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
      sections: (chapter.sections || []).map((s) => ({ number: s.number, text: s.text })),
    },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data // { geminiApiKey, liveSystemPrompt, liveModel, liveVoice, sessionId }
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

// Does a sentence substantially appear (in order) within the chapter text?
function sentenceAligns(sentence, chapterWords) {
  const words = normalizeWords(sentence)
  if (words.length < 3) return false // too short → treat as a conversational aside
  let best = 0
  for (let start = chapterWords.indexOf(words[0]); start !== -1; start = chapterWords.indexOf(words[0], start + 1)) {
    let matches = 0, p = start
    for (const w of words) {
      let found = false
      for (let k = 0; k < 6 && p + k < chapterWords.length; k++) {
        if (chapterWords[p + k] === w) { p += k + 1; matches++; found = true; break }
      }
      if (!found) p++
    }
    best = Math.max(best, matches / words.length)
    if (best >= 0.7) break
  }
  return best >= 0.6
}

// Split agent transcription into book-narration vs conversational-aside segments.
function classifyNarration(text, chapterWords) {
  if (!chapterWords.length) return [{ type: 'aside', text }]
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text]
  const segs = []
  for (const sent of sentences) {
    const type = sentenceAligns(sent, chapterWords) ? 'narration' : 'aside'
    if (segs.length && segs[segs.length - 1].type === type) segs[segs.length - 1].text += sent
    else segs.push({ type, text: sent })
  }
  return segs
}

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

// ─── Full-duplex Live session ────────────────────────────────────────────────
export class GeminiLiveSession {
  constructor({ geminiApiKey, liveSystemPrompt, liveModel, liveVoice, sessionId, sections,
    onStateChange, onTranscript, onProgress, onError }) {
    this.apiKey = geminiApiKey
    this.systemPrompt = liveSystemPrompt || 'You are a warm, engaging audiobook narrator.'
    this.model = liveModel || 'gemini-3.1-flash-live-preview'
    this.voice = liveVoice || 'Charon'
    this.sessionId = sessionId
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

    this._playbackSources = []
    this._nextStartTime = 0

    // Streaming bubble buffers (per turn)
    this._userBuf = ''
    this._agentBuf = ''
    this._userMsgId = null
    this._agentMsgId = null

    // Progress: align narrated words against the chapter text
    const chapterText = (sections || []).map((s) => s.text).join(' ')
    this._chapterWords = normalizeWords(chapterText)
    this._wordPtr = 0
    this._lastPct = 0
    this._lastActive = -1
    // Cumulative word count at the end of each section → section boundaries
    this._sectionBounds = []
    let acc = 0
    ;(sections || []).forEach((s) => { acc += normalizeWords(s.text).length; this._sectionBounds.push(acc) })

    // Audio level analysers (set up in _startMic)
    this._micAnalyser = null
    this._playAnalyser = null
  }

  setState(s) {
    this.state = s
    this.onStateChange?.(s)
  }

  async start() {
    this.setState('connecting')
    try {
      await this._openSocket()
      await this._startMic()
      // Kick off narration; user can interrupt/ask at any time (server VAD).
      this._send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: 'Please begin narrating this chapter from the beginning.' }] }],
          turnComplete: true,
        },
      })
      this.setState('speaking')
    } catch (err) {
      this.setState('error')
      this.onError?.(err.message)
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
        let msg
        try { msg = JSON.parse(text) } catch { return }

        if (msg.setupComplete) {
          if (!settled) { settled = true; resolve() }
          return
        }
        this._handleServerMessage(msg)
      }

      ws.onerror = () => {
        if (!settled) { settled = true; reject(new Error('Live API connection failed')) }
      }

      ws.onclose = (e) => {
        if (!settled) { settled = true; reject(new Error(`Live API closed: ${e.reason || e.code}`)) }
        if (this.state !== 'ended' && this.state !== 'error') this.setState('ended')
      }
    })
  }

  _handleServerMessage(msg) {
    const sc = msg.serverContent
    if (!sc) return

    if (sc.interrupted) {
      // User started speaking over the agent — stop current playback immediately.
      this._stopPlayback()
      this.setState('listening')
    }

    // Stream the user's question bubble as they speak.
    if (sc.inputTranscription?.text) {
      this._userBuf += sc.inputTranscription.text
      if (!this._userMsgId) this._userMsgId = 'u' + Date.now() + Math.random()
      this.onTranscript?.({ id: this._userMsgId, role: 'user', text: this._userBuf.trim() })
    }

    // Stream the agent's bubble AS the transcription arrives (before/with audio),
    // and advance chapter progress from what's been narrated.
    if (sc.outputTranscription?.text) {
      this._agentBuf += sc.outputTranscription.text
      if (!this._agentMsgId) this._agentMsgId = 'a' + Date.now() + Math.random()
      const text = this._agentBuf.trim()
      this.onTranscript?.({
        id: this._agentMsgId,
        role: 'agent',
        text,
        segments: classifyNarration(text, this._chapterWords),
      })
      this._advanceProgress(sc.outputTranscription.text)
    }

    const parts = sc.modelTurn?.parts || []
    for (const part of parts) {
      const data = part.inlineData?.data
      if (data) {
        this.setState('speaking')
        this._enqueueAudio(base64ToInt16(data))
      }
    }

    if (sc.turnComplete) {
      // Finalize turn — next turn starts fresh bubbles.
      this._userBuf = ''
      this._agentBuf = ''
      this._userMsgId = null
      this._agentMsgId = null
      this.setState('listening')
    }
  }

  // Sequence-align narrated words against the chapter; only real narration advances
  // the bar (Q&A / paraphrase won't match the next expected word, so it holds).
  _advanceProgress(text) {
    if (!this._chapterWords.length) return
    const WINDOW = 8
    for (const w of normalizeWords(text)) {
      for (let k = 0; k < WINDOW && this._wordPtr + k < this._chapterWords.length; k++) {
        if (this._chapterWords[this._wordPtr + k] === w) { this._wordPtr += k + 1; break }
      }
    }
    const pct = Math.min(100, Math.round((this._wordPtr / this._chapterWords.length) * 100))
    let activeIndex = this._sectionBounds.findIndex((b) => this._wordPtr < b)
    if (activeIndex === -1) activeIndex = this._sectionBounds.length - 1
    if (pct !== this._lastPct || activeIndex !== this._lastActive) {
      this._lastPct = pct
      this._lastActive = activeIndex
      this.onProgress?.({ pct, activeIndex })
    }
  }

  async _startMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.micCtx = new AudioContext({ sampleRate: 16000 })
    this.playCtx = new AudioContext({ sampleRate: 24000 })

    const source = this.micCtx.createMediaStreamSource(this.stream)
    // Analyser for the user's mic level (waveform).
    this._micAnalyser = this.micCtx.createAnalyser()
    this._micAnalyser.fftSize = 256
    source.connect(this._micAnalyser)
    // Analyser for the agent's playback level (waveform); passes audio through to speakers.
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

  // RMS level 0..1 for each stream — polled by the UI for the waveform.
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
