import { supabase } from './supabase'

// ─── Session config from Edge Function ────────────────────────────────────────
export async function getGeminiLiveSession(book, chapter, opts = {}) {
  const mode = opts.mode || 'chapter'
  let body
  if (mode === 'gist') {
    // Assemble the whole-book content client-side (chapters are already in the store) and
    // send it — the edge function does no per-request DB fetch (scales under concurrency).
    const bookContent = (book.chapters || [])
      .map((c) => `## ${c.title || 'Chapter'}\n${c.content || (c.sections || []).map((s) => s.text).join('\n\n')}`)
      .join('\n\n')
    body = { book_id: book.id, book_title: book.title, author: book.author, mode: 'gist', bookContent, listener_name: opts.listenerName || '' }
  } else {
    body = {
      book_id: book.id,
      book_title: book.title,
      author: book.author,
      chapter_number: chapter.number,
      chapter_title: chapter.title,
      oneliner: chapter.oneliner || '',
      sections: (chapter.sections || []).map((s) => ({ number: s.number, title: s.title || '', text: s.text })),
      listener_name: opts.listenerName || '',
    }
  }
  const { data, error } = await supabase.functions.invoke('voice-session', { body })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data // { geminiApiKey, liveSystemPrompt, liveModel, liveVoice, sessionId, sections }
}

// ─── Audio helpers ───────────────────────────────────────────────────────────
function floatTo16BitPCM(float32) {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16
}

function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToInt16(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

function normalizeWords(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}

// Split agent text into book-narration (outside (( ))) vs agent-aside (inside (( ))).
// Parens are stripped from the segment text. Handles an unclosed trailing "((".
function parseAsides(text) {
  const segs = []
  const re = /\(\(([\s\S]*?)\)\)/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: 'narration', text: text.slice(last, m.index) })
    segs.push({ type: 'aside', text: m[1] })
    last = re.lastIndex
  }
  const tail = text.slice(last)
  const openIdx = tail.indexOf('((')
  if (openIdx >= 0) {
    if (openIdx > 0) segs.push({ type: 'narration', text: tail.slice(0, openIdx) })
    const asideTail = tail.slice(openIdx + 2)
    if (asideTail) segs.push({ type: 'aside', text: asideTail })
  } else if (tail) {
    segs.push({ type: 'narration', text: tail })
  }
  // merge consecutive same-type, drop empties
  const merged = []
  for (const s of segs) {
    if (!s.text) continue
    if (merged.length && merged[merged.length - 1].type === s.type) merged[merged.length - 1].text += s.text
    else merged.push({ ...s })
  }
  return merged.length ? merged : [{ type: 'narration', text }]
}

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
// Ephemeral-token connections use v1alpha AND the *Constrained* method (regular API keys
// use BidiGenerateContent + ?key=; ephemeral tokens use BidiGenerateContentConstrained
// + ?access_token=). Wrong method → "Method doesn't allow unregistered callers".
const WS_URL_V1ALPHA =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained'

// Long chapters outlive a single WebSocket (~10-15 min limit). On an unexpected
// drop we transparently re-open and resume via the server's resumption handle.
const MAX_RECONNECTS = 5
const RESUME_PROMPT = 'Please continue reading the chapter aloud from exactly where you left off, verbatim.'

// ─── Full-duplex verbatim narration session ──────────────────────────────────
export class GeminiLiveSession {
  constructor({ geminiApiKey, ephemeralToken, liveSystemPrompt, liveModel, liveVoice, sessionId, sections, mode,
    onStateChange, onTranscript, onProgress, onError, onEvent }) {
    this.mode = mode || 'chapter' // 'chapter' = verbatim narration; 'gist' = whole-book summary
    this.apiKey = geminiApiKey
    // Short-lived server-minted token; when present we connect via v1alpha + access_token
    // so the real API key never reaches the browser. Falls back to the raw key if absent.
    this.authToken = ephemeralToken || null
    this.systemPrompt = liveSystemPrompt || 'You are a narrator. Read the chapter verbatim; wrap your own remarks in ((double parentheses)).'
    this.model = liveModel || 'gemini-3.1-flash-live-preview'
    this.voice = liveVoice || 'Charon'
    this.sessionId = sessionId
    this.sections = sections || []
    this.onStateChange = onStateChange
    this.onTranscript = onTranscript
    this.onProgress = onProgress
    this.onError = onError
    this.onEvent = onEvent
    this._startedAt = Date.now()
    this._ending = false

    // Reconnection / session resumption (long chapters outlive one socket).
    this._resumeHandle = null
    this._reconnecting = false
    this._reconnectAttempts = 0

    this.state = 'idle'
    this.ws = null
    this.stream = null
    this.micCtx = null
    this.playCtx = null
    this._micAnalyser = null
    this._playAnalyser = null
    this._playbackSources = []
    this._nextStartTime = 0

    // Per-turn streaming bubble buffers. A turn's bubble is created by whichever signal
    // arrives first (audio or transcription) and reset on turnComplete/interrupt, so the
    // NEXT turn always starts a fresh bubble — never gluing one turn's opening words onto
    // the previous bubble.
    this._userBuf = ''
    this._agentBuf = ''
    this._userMsgId = null
    this._agentMsgId = null

    // Progress: single verbatim word pointer over the chapter (asides/Q&A excluded).
    const chapterText = this.sections.map((s) => s.text).join(' ')
    this._chapterWords = normalizeWords(chapterText)
    this._wordPtr = 0
    this._turnStartPtr = 0
    this._lastPct = 0
    this._lastActive = -1
    // Cumulative word count at each section end → section boundaries
    this._sectionBounds = []
    let acc = 0
    this.sections.forEach((s) => { acc += normalizeWords(s.text).length; this._sectionBounds.push(acc) })
  }

  setState(s) {
    const from = this.state
    this.state = s
    if (from !== s) this._log('state', { from, to: s })
    this.onStateChange?.(s)
  }

  // Structured event log → console + onEvent hook (UI surfacing + DB persistence).
  _log(type, data = {}) {
    try { console.log(`[GeminiLive] ${type}`, data) } catch { /* noop */ }
    this.onEvent?.({ t: Date.now(), sessionId: this.sessionId, type, ...data })
  }

  // Advance a copy of the pointer through verbatim text, matching chapter words.
  _alignFrom(startPtr, text) {
    let p = startPtr
    const WINDOW = 8
    for (const w of normalizeWords(text)) {
      for (let k = 0; k < WINDOW && p + k < this._chapterWords.length; k++) {
        if (this._chapterWords[p + k] === w) { p += k + 1; break }
      }
    }
    return p
  }

  _emitProgress() {
    const total = this._chapterWords.length || 1
    const pct = Math.min(100, Math.round((this._wordPtr / total) * 100))
    let activeIndex = this._sectionBounds.findIndex((b) => this._wordPtr < b)
    if (activeIndex === -1) activeIndex = this._sectionBounds.length // all sections covered
    if (pct !== this._lastPct || activeIndex !== this._lastActive) {
      this._lastPct = pct
      this._lastActive = activeIndex
      this.onProgress?.({ pct, activeIndex })
    }
  }

  async start() {
    this._log('session_start', { model: this.model, voice: this.voice, sections: this.sections.length })
    this.setState('connecting')
    try {
      await this._openSocket()
      await this._startMic()
      this._emitProgress()
      const kickoff = this.mode === 'gist'
        ? 'Please begin your spoken summary of the book now, starting with its core thesis.'
        : 'Please begin reading the chapter aloud from the very beginning.'
      this._send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: kickoff }] }],
          turnComplete: true,
        },
      })
      this.setState('speaking')
    } catch (err) {
      this.setState('error')
      this.onError?.(err.message)
    }
  }

  _handleServerMessage(msg) {
    // goAway: server warns the connection is about to close (e.g. hit the time limit).
    if (msg.goAway) this._log('go_away', { timeLeft: msg.goAway.timeLeft })
    if (msg.usageMetadata) this._log('usage', { totalTokens: msg.usageMetadata.totalTokenCount })
    if (msg.error) this._log('server_error', { error: msg.error })

    // Session-resumption handle: store the latest so we can resume after a drop.
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      this._resumeHandle = msg.sessionResumptionUpdate.newHandle
    }

    const sc = msg.serverContent
    if (!sc) return

    if (sc.interrupted) {
      this._log('interrupted')
      this._stopPlayback()
      this._agentMsgId = null // the post-barge-in reply starts a fresh bubble
      this._agentBuf = ''
      this.setState('listening')
    }

    // User speaking → stream their bubble (does not affect progress).
    if (sc.inputTranscription?.text) {
      this._userBuf += sc.inputTranscription.text
      if (!this._userMsgId) this._userMsgId = 'u' + Date.now() + Math.random()
      this.onTranscript?.({ id: this._userMsgId, role: 'user', text: this._userBuf.trim() })
    }

    // Agent transcription → classify by (( )) and advance progress from verbatim only.
    // Transcription NEVER rotates the bubble — it appends to the current anchor (minted
    // by audio, or here as a safety if transcription somehow leads audio) so late/trailing
    // chunks always land in the right bubble.
    if (sc.outputTranscription?.text) {
      if (!this._agentMsgId) this._startAgentBubble()
      this._agentBuf += sc.outputTranscription.text
      const segments = parseAsides(this._agentBuf)
      // Progress: re-align this turn's verbatim (non-aside) text from the turn start.
      const narration = segments.filter((s) => s.type === 'narration').map((s) => s.text).join(' ')
      this._wordPtr = Math.max(this._wordPtr, this._alignFrom(this._turnStartPtr, narration))
      this.onTranscript?.({
        id: this._agentMsgId,
        role: 'agent',
        text: segments.map((s) => s.text).join(''),
        segments,
      })
      this._emitProgress()
    }

    for (const part of (sc.modelTurn?.parts || [])) {
      const data = part.inlineData?.data
      if (data) {
        // Anchor the bubble if audio leads transcription, so late transcription attaches.
        if (!this._agentMsgId) this._startAgentBubble()
        this.setState('speaking')
        this._enqueueAudio(base64ToInt16(data))
      }
    }

    if (sc.turnComplete) {
      this._log('turn_complete', { wordPtr: this._wordPtr })
      // Reset the AGENT bubble so the next agent turn starts fresh. The USER bubble is NOT
      // reset here: turnComplete marks the MODEL's turn end, which can land after the user
      // has already begun their next utterance — clearing it here ate the opening words.
      // The user bubble is finalized instead when the model begins replying (_startAgentBubble).
      this._agentBuf = ''
      this._agentMsgId = null
      this.setState('listening')
    }
  }

  // Start a fresh agent bubble for the current turn. The model beginning its reply means the
  // user's utterance is complete, so finalize the user bubble here (rather than on turnComplete)
  // — the next user utterance then starts cleanly, with its opening words intact.
  _startAgentBubble() {
    this._agentMsgId = 'a' + Date.now() + Math.random()
    this._agentBuf = ''
    this._turnStartPtr = this._wordPtr
    this._userBuf = ''
    this._userMsgId = null
  }

  _openSocket(resumeHandle) {
    return new Promise((resolve, reject) => {
      const wsUrl = this.authToken
        ? `${WS_URL_V1ALPHA}?access_token=${this.authToken}`
        : `${WS_URL}?key=${this.apiKey}`
      const ws = new WebSocket(wsUrl)
      this.ws = ws
      let settled = false

      ws.onopen = () => {
        this._log('ws_open', { resumed: !!resumeHandle })
        ws.send(JSON.stringify({
          setup: {
            model: `models/${this.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } },
              temperature: 0.6,
            },
            systemInstruction: { parts: [{ text: this.systemPrompt }] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: { automaticActivityDetection: {} },
            // Resume prior context after a drop; slidingWindow compresses old context so
            // long chapters run past the raw connection/token limit.
            sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
            contextWindowCompression: { slidingWindow: {} },
          },
        }))
      }

      ws.onmessage = async (event) => {
        const text = event.data instanceof Blob ? await event.data.text() : event.data
        let m
        try { m = JSON.parse(text) } catch { return }
        if (m.setupComplete) { this._log('setup_complete'); if (!settled) { settled = true; resolve() } return }
        this._handleServerMessage(m)
      }

      ws.onerror = () => {
        this._log('ws_error')
        if (!settled) { settled = true; reject(new Error('Live API connection failed')) }
      }
      ws.onclose = (e) => {
        if (this.ws !== ws) return // superseded by a reconnect — ignore the stale socket's close
        this._log('ws_close', { code: e.code, reason: e.reason, wasClean: e.wasClean, intentional: this._ending, durationMs: Date.now() - this._startedAt })
        // Pre-setup failure: let the awaiting caller (start/_reconnect) handle the rejection.
        if (!settled) { settled = true; reject(new Error(`Live API closed: ${e.reason || e.code}`)); return }
        // Post-setup drop.
        if (this._ending) {
          if (this.state !== 'ended' && this.state !== 'error') this.setState('ended')
          return
        }
        // Unexpected mid-session drop → transparently resume if we can, else surface it.
        if (this._resumeHandle && this._reconnectAttempts < MAX_RECONNECTS) {
          this._reconnect()
        } else {
          this.onError?.(`Session ended (${e.reason || 'code ' + e.code}). It may have hit the ~15-min connection limit — reopen to continue.`)
          if (this.state !== 'ended' && this.state !== 'error') this.setState('ended')
        }
      }
    })
  }

  // Re-open the socket and resume the session after an unexpected drop. Reuses the live
  // mic + AudioContexts (the mic processor already sends to the new `this.ws`) and keeps
  // the in-memory progress pointer, so narration continues where it left off.
  async _reconnect() {
    if (this._ending || this._reconnecting) return
    this._reconnecting = true
    this._reconnectAttempts++
    this.setState('reconnecting')
    this._log('reconnect_attempt', { attempt: this._reconnectAttempts, hasHandle: !!this._resumeHandle })
    try {
      await this._openSocket(this._resumeHandle)
      this._send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: RESUME_PROMPT }] }],
          turnComplete: true,
        },
      })
      this._reconnectAttempts = 0
      this._reconnecting = false
      this._agentMsgId = null // resumed audio starts a fresh bubble
      this._agentBuf = ''
      this.setState('speaking')
      this._log('reconnect_success')
    } catch (err) {
      this._reconnecting = false
      this._log('reconnect_failed', { attempt: this._reconnectAttempts, error: err.message })
      if (!this._ending && this._reconnectAttempts < MAX_RECONNECTS) {
        setTimeout(() => this._reconnect(), 1500)
      } else if (!this._ending) {
        this.onError?.('Lost the connection and could not resume automatically. Please reopen to continue.')
        this.setState('error')
      }
    }
  }

  async _startMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.micCtx = new AudioContext({ sampleRate: 16000 })
    this.playCtx = new AudioContext({ sampleRate: 24000 })

    const source = this.micCtx.createMediaStreamSource(this.stream)
    this._micAnalyser = this.micCtx.createAnalyser()
    this._micAnalyser.fftSize = 256
    source.connect(this._micAnalyser)
    this._playAnalyser = this.playCtx.createAnalyser()
    this._playAnalyser.fftSize = 256
    this._playAnalyser.connect(this.playCtx.destination)

    // Capture mic PCM OFF the main thread via AudioWorklet (avoids the deprecated
    // ScriptProcessorNode's main-thread congestion — DECISIONS A9). Falls back to
    // ScriptProcessorNode if the worklet module can't load, so Talk always works.
    const sendPcm = (int16) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return
      this._send({ realtimeInput: { audio: { data: int16ToBase64(int16), mimeType: 'audio/pcm;rate=16000' } } })
    }
    try {
      await this.micCtx.audioWorklet.addModule(new URL('./pcmCaptureProcessor.js', import.meta.url))
      const node = new AudioWorkletNode(this.micCtx, 'pcm-capture')
      node.port.onmessage = (e) => sendPcm(new Int16Array(e.data))
      source.connect(node)
      node.connect(this.micCtx.destination) // keep the node pulled; it outputs silence
      this._workletNode = node
      this._log('mic_capture', { mode: 'audioworklet' })
    } catch (err) {
      this._log('audioworklet_failed', { error: err.message })
      this.processor = this.micCtx.createScriptProcessor(4096, 1, 1)
      this.processor.onaudioprocess = (e) => sendPcm(floatTo16BitPCM(e.inputBuffer.getChannelData(0)))
      source.connect(this.processor)
      this.processor.connect(this.micCtx.destination)
    }
  }

  _enqueueAudio(int16) {
    const ctx = this.playCtx
    if (!ctx) return
    const f32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768
    const buf = ctx.createBuffer(1, f32.length, 24000)
    buf.copyToChannel(f32, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(this._playAnalyser || ctx.destination)
    const startAt = Math.max(ctx.currentTime, this._nextStartTime)
    src.start(startAt)
    this._nextStartTime = startAt + buf.duration
    this._playbackSources.push(src)
    src.onended = () => { this._playbackSources = this._playbackSources.filter((s) => s !== src) }
  }

  _stopPlayback() {
    this._playbackSources.forEach((s) => { try { s.stop() } catch { /* already stopped */ } })
    this._playbackSources = []
    this._nextStartTime = 0
  }

  _send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  // RMS level 0..1 per stream — polled by the UI for the waveform.
  getAudioLevels() {
    return { user: this._readLevel(this._micAnalyser), agent: this._readLevel(this._playAnalyser) }
  }

  _readLevel(analyser) {
    if (!analyser) return 0
    const buf = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3)
  }

  end() {
    if (!this._ending) this._log('session_end', { durationMs: Date.now() - this._startedAt })
    this._ending = true
    this._stopPlayback()
    if (this.processor) { this.processor.disconnect(); this.processor.onaudioprocess = null; this.processor = null }
    if (this._workletNode) { this._workletNode.disconnect(); this._workletNode.port.onmessage = null; this._workletNode = null }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null }
    if (this.micCtx) { this.micCtx.close(); this.micCtx = null }
    if (this.playCtx) { this.playCtx.close(); this.playCtx = null }
    if (this.ws) { try { this.ws.close() } catch { /* noop */ } this.ws = null }
    this.setState('ended')
  }
}
