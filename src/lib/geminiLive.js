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

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

// ─── Full-duplex Live session ────────────────────────────────────────────────
export class GeminiLiveSession {
  constructor({ geminiApiKey, liveSystemPrompt, liveModel, liveVoice, sessionId,
    onStateChange, onTranscript, onError }) {
    this.apiKey = geminiApiKey
    this.systemPrompt = liveSystemPrompt || 'You are a warm, engaging audiobook narrator.'
    this.model = liveModel || 'gemini-2.0-flash-live-001'
    this.voice = liveVoice || 'Charon'
    this.sessionId = sessionId
    this.onStateChange = onStateChange
    this.onTranscript = onTranscript
    this.onError = onError

    this.state = 'idle'
    this.ws = null
    this.stream = null
    this.micCtx = null
    this.processor = null
    this.playCtx = null

    this._playbackSources = []
    this._nextStartTime = 0

    this._userBuf = ''
    this._agentBuf = ''
    this._userEmitted = false
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

    if (sc.inputTranscription?.text) {
      this._userBuf += sc.inputTranscription.text
    }
    if (sc.outputTranscription?.text) {
      this._agentBuf += sc.outputTranscription.text
    }

    const parts = sc.modelTurn?.parts || []
    for (const part of parts) {
      const data = part.inlineData?.data
      if (data) {
        // Model produced audio → user's turn is over, flush their bubble once.
        if (this._userBuf && !this._userEmitted) {
          this.onTranscript?.({ role: 'user', text: this._userBuf.trim() })
          this._userEmitted = true
        }
        this.setState('speaking')
        this._enqueueAudio(base64ToInt16(data))
      }
    }

    if (sc.turnComplete) {
      if (this._agentBuf) this.onTranscript?.({ role: 'agent', text: this._agentBuf.trim() })
      this._userBuf = ''
      this._agentBuf = ''
      this._userEmitted = false
      this.setState('listening')
    }
  }

  async _startMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.micCtx = new AudioContext({ sampleRate: 16000 })
    this.playCtx = new AudioContext({ sampleRate: 24000 })

    const source = this.micCtx.createMediaStreamSource(this.stream)
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
    src.connect(ctx.destination)
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
