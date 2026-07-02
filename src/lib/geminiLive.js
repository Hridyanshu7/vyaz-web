import { supabase } from './supabase'

// ─── Session config from Edge Function ────────────────────────────────────────
export async function getGeminiLiveSession(book, chapter) {
  const { data, error } = await supabase.functions.invoke('voice-session', {
    body: {
      book_id: book.id,
      book_title: book.title,
      author: book.author,
      chapter_number: chapter.number,
      chapter_title: chapter.title,
      oneliner: chapter.oneliner || '',
      sections: (chapter.sections || []).map((s) => ({ number: s.number, title: s.title || '', text: s.text })),
    },
  })
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

// Short affirmative reply to a "shall we continue?" check-in.
function isAffirmative(text) {
  if (!text) return false
  const t = text.trim().toLowerCase()
  if (t.split(/\s+/).length > 6) return false
  return /\b(yes|yeah|yep|yup|sure|ok|okay|continue|go on|go ahead|next|proceed|carry on|keep going|please do)\b/.test(t)
}

// Split an agent turn into book-discussion vs conversational-reply segments,
// based on the turn's role (not fragile verbatim text-matching).
function buildSegments(text, kind) {
  const t = text.trim()
  if (!t) return []
  if (kind === 'reply') return [{ type: 'aside', text: t }]
  // discussion turn: substance is content; a trailing check-in question is an aside
  const sentences = t.match(/[^.!?]+[.!?]*/g) || [t]
  let splitAt = sentences.length
  while (splitAt > 0 && /\?\s*$/.test(sentences[splitAt - 1].trim())) splitAt--
  const content = sentences.slice(0, splitAt).join(' ').trim()
  const aside = sentences.slice(splitAt).join(' ').trim()
  const segs = []
  if (content) segs.push({ type: 'narration', text: content })
  if (aside) segs.push({ type: 'aside', text: aside })
  return segs.length ? segs : [{ type: 'narration', text: t }]
}

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

// ─── Full-duplex Live session (per-section discussion orchestration) ──────────
export class GeminiLiveSession {
  constructor({ geminiApiKey, liveSystemPrompt, liveModel, liveVoice, sessionId, sections,
    onStateChange, onTranscript, onProgress, onError }) {
    this.apiKey = geminiApiKey
    this.systemPrompt = liveSystemPrompt || 'You are an engaging book-discussion guide.'
    this.model = liveModel || 'gemini-3.1-flash-live-preview'
    this.voice = liveVoice || 'Charon'
    this.sessionId = sessionId
    this.sections = sections || []
    this.onStateChange = onStateChange
    this.onTranscript = onTranscript
    this.onProgress = onProgress
    this.onError = onError

    this.state = 'idle'
    this.ws = null
    this.stream = null
    this.micCtx = null
    this.processor = null
    this.playCtx = null
    this._micAnalyser = null
    this._playAnalyser = null

    this._playbackSources = []
    this._nextStartTime = 0

    // Per-turn streaming bubble buffers
    this._userBuf = ''
    this._agentBuf = ''
    this._userMsgId = null
    this._agentMsgId = null
    this._lastUser = ''

    // Orchestration
    this.currentSectionIdx = 0
    this._turnKind = 'discussion'   // 'discussion' (we drove it) | 'reply' (user spoke)
    this._awaitingContinue = false
    this._advancing = false
  }

  setState(s) {
    this.state = s
    this.onStateChange?.(s)
  }

  _emitProgress() {
    const total = this.sections.length || 1
    const done = this.currentSectionIdx >= this.sections.length
    const pct = done ? 100 : Math.round((this.currentSectionIdx / total) * 100)
    const activeIndex = done ? this.sections.length : this.currentSectionIdx
    this.onProgress?.({ pct, activeIndex })
  }

  async start() {
    this.setState('connecting')
    try {
      await this._openSocket()
      await this._startMic()
      this.currentSectionIdx = 0
      this._turnKind = 'discussion'
      this._awaitingContinue = false
      this._emitProgress()
      this._sendSectionInstruction(0)
      this.setState('speaking')
    } catch (err) {
      this.setState('error')
      this.onError?.(err.message)
    }
  }

  // Instruct the model to discuss exactly one section, in depth, then wait.
  _sendSectionInstruction(idx) {
    const s = this.sections[idx]
    if (!s) return
    const label = s.title ? `section ${s.number} ("${s.title}")` : `section ${s.number}`
    this._send({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{
            text:
              `Now discuss ONLY ${label} of this chapter, in a natural spoken conversation. ` +
              `Cover ALL of its key ideas, arguments, examples and nuances thoroughly — do not oversimplify, ` +
              `condense away detail, or skip anything. Do not move on to any later section. When you have ` +
              `covered this section fully, pause and ask if I'd like to continue, then wait.\n\n` +
              `SECTION TEXT:\n${s.text}`,
          }],
        }],
        turnComplete: true,
      },
    })
  }

  // Advance to the next section (from Continue button or a spoken "yes").
  _advanceSection() {
    if (this._advancing) return
    this._advancing = true
    this._stopPlayback()
    this.currentSectionIdx++
    this._awaitingContinue = false
    if (this.currentSectionIdx >= this.sections.length) {
      this._emitProgress()
      this.setState('done')
      this._advancing = false
      return
    }
    this._turnKind = 'discussion'
    this._emitProgress()
    this._sendSectionInstruction(this.currentSectionIdx)
    this.setState('speaking')
    this._advancing = false
  }

  // Public: user tapped "Continue" (also works as skip if mid-section).
  continueSection() {
    if (this.state === 'done') return
    this._advanceSection()
  }

  _handleServerMessage(msg) {
    const sc = msg.serverContent
    if (!sc) return

    if (sc.interrupted) {
      this._stopPlayback()
      this.setState('listening')
    }

    // User is speaking → this exchange is a reply turn.
    if (sc.inputTranscription?.text) {
      this._userBuf += sc.inputTranscription.text
      this._lastUser = this._userBuf
      this._turnKind = 'reply'
      if (!this._userMsgId) this._userMsgId = 'u' + Date.now() + Math.random()
      this.onTranscript?.({ id: this._userMsgId, role: 'user', text: this._userBuf.trim() })
    }

    // Agent transcription streams in → build the bubble by role.
    if (sc.outputTranscription?.text) {
      this._agentBuf += sc.outputTranscription.text
      if (!this._agentMsgId) this._agentMsgId = 'a' + Date.now() + Math.random()
      const text = this._agentBuf.trim()
      this.onTranscript?.({
        id: this._agentMsgId,
        role: 'agent',
        text,
        segments: buildSegments(text, this._turnKind),
      })
    }

    for (const part of (sc.modelTurn?.parts || [])) {
      const data = part.inlineData?.data
      if (data) { this.setState('speaking'); this._enqueueAudio(base64ToInt16(data)) }
    }

    if (sc.turnComplete) {
      const kind = this._turnKind
      const lastUser = this._lastUser
      this._userBuf = ''
      this._agentBuf = ''
      this._userMsgId = null
      this._agentMsgId = null
      this._lastUser = ''

      if (kind === 'discussion') {
        this._awaitingContinue = true
        this.setState('listening')
      } else if (this._awaitingContinue && isAffirmative(lastUser)) {
        // The user confirmed continuing after a section — advance ourselves.
        this._advanceSection()
      } else {
        this.setState('listening')
      }
    }
  }

  _openSocket() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?key=${this.apiKey}`)
      this.ws = ws
      let settled = false

      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: `models/${this.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } },
              temperature: 0.8,
            },
            systemInstruction: { parts: [{ text: this.systemPrompt }] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: { automaticActivityDetection: {} },
          },
        }))
      }

      ws.onmessage = async (event) => {
        const text = event.data instanceof Blob ? await event.data.text() : event.data
        let m
        try { m = JSON.parse(text) } catch { return }
        if (m.setupComplete) { if (!settled) { settled = true; resolve() } return }
        this._handleServerMessage(m)
      }

      ws.onerror = () => { if (!settled) { settled = true; reject(new Error('Live API connection failed')) } }
      ws.onclose = (e) => {
        if (!settled) { settled = true; reject(new Error(`Live API closed: ${e.reason || e.code}`)) }
        if (this.state !== 'ended' && this.state !== 'error' && this.state !== 'done') this.setState('ended')
      }
    })
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

    // ScriptProcessorNode is deprecated but universally supported and simplest for raw PCM.
    this.processor = this.micCtx.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (e) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return
      const int16 = floatTo16BitPCM(e.inputBuffer.getChannelData(0))
      this._send({ realtimeInput: { audio: { data: int16ToBase64(int16), mimeType: 'audio/pcm;rate=16000' } } })
    }
    source.connect(this.processor)
    this.processor.connect(this.micCtx.destination)
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
    this._stopPlayback()
    if (this.processor) { this.processor.disconnect(); this.processor.onaudioprocess = null; this.processor = null }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null }
    if (this.micCtx) { this.micCtx.close(); this.micCtx = null }
    if (this.playCtx) { this.playCtx.close(); this.playCtx = null }
    if (this.ws) { try { this.ws.close() } catch { /* noop */ } this.ws = null }
    this.setState('ended')
  }
}
