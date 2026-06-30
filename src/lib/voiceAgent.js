import { supabase } from './supabase'

const SAMPLE_RATE = 16000
const CHUNK_SIZE = 4096

export async function getCartesiaSession(book, chapter) {
  const { data, error } = await supabase.functions.invoke('cartesia-token', {
    body: {
      book_title: book.title,
      author: book.author,
      chapter_title: chapter.title,
      oneliner: chapter.oneliner || '',
      content: chapter.content || '',
    },
  })
  if (error) throw new Error(error.message)
  if (data.error) throw new Error(data.error)
  return data // { accessToken, agentId, systemPrompt }
}

export class VoiceAgentSession {
  constructor({ accessToken, agentId, systemPrompt, onStateChange, onError }) {
    this.accessToken = accessToken
    this.agentId = agentId
    this.systemPrompt = systemPrompt
    this.onStateChange = onStateChange
    this.onError = onError

    this.ws = null
    this.audioContext = null
    this.micStream = null
    this.processor = null
    this.scheduledAt = 0
    this.state = 'idle'
  }

  setState(s) {
    this.state = s
    this.onStateChange?.(s)
  }

  async start() {
    this.setState('connecting')

    // Request microphone
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      throw new Error('Microphone access denied.')
    }

    // Audio context for mic capture + playback
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    this.scheduledAt = this.audioContext.currentTime

    // Connect WebSocket
    const wsUrl = `wss://api.cartesia.ai/agents/stream/${this.agentId}?token=${this.accessToken}`
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      // Send start event with dynamic system prompt
      this.ws.send(JSON.stringify({
        event: 'start',
        config: { input_format: 'pcm_16000' },
        agent: { system_prompt: this.systemPrompt },
      }))
    }

    this.ws.onmessage = (e) => this._handleMessage(e)
    this.ws.onerror = () => this.onError?.('WebSocket connection failed.')
    this.ws.onclose = () => {
      if (this.state !== 'ended') this.setState('ended')
    }

    // Keep-alive ping every 60s
    this._pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('')
    }, 60000)
  }

  _handleMessage(e) {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }

    if (msg.event === 'ack') {
      this.setState('listening')
      this._startMic()
    }

    if (msg.event === 'agent_speaking') {
      this.setState('speaking')
    }

    if (msg.event === 'agent_done_speaking') {
      this.setState('listening')
    }

    if (msg.event === 'media_output' && msg.media?.payload) {
      this._playAudioChunk(msg.media.payload)
    }

    if (msg.event === 'error') {
      this.onError?.(msg.message || 'Agent error')
    }
  }

  mute() {
    this.muted = true
    this.micStream?.getTracks().forEach((t) => { t.enabled = false })
  }

  unmute() {
    this.muted = false
    this.micStream?.getTracks().forEach((t) => { t.enabled = true })
  }

  _startMic() {
    this.muted = false
    const source = this.audioContext.createMediaStreamSource(this.micStream)
    this.processor = this.audioContext.createScriptProcessor(CHUNK_SIZE, 1, 1)

    source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)

    this.processor.onaudioprocess = (e) => {
      if (this.ws?.readyState !== WebSocket.OPEN || this.muted) return
      const float32 = e.inputBuffer.getChannelData(0)
      const int16 = new Int16Array(float32.length)
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
      }
      const bytes = new Uint8Array(int16.buffer)
      let binary = ''
      bytes.forEach((b) => { binary += String.fromCharCode(b) })
      const base64 = btoa(binary)

      this.ws.send(JSON.stringify({
        event: 'media_input',
        stream_id: 'mic',
        media: { payload: base64 },
      }))
    }
  }

  _playAudioChunk(base64) {
    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768

      const buffer = this.audioContext.createBuffer(1, float32.length, SAMPLE_RATE)
      buffer.copyToChannel(float32, 0)

      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(this.audioContext.destination)

      const startAt = Math.max(this.scheduledAt, this.audioContext.currentTime)
      source.start(startAt)
      this.scheduledAt = startAt + buffer.duration
    } catch { /* skip bad chunk */ }
  }

  end() {
    this.setState('ended')
    clearInterval(this._pingInterval)

    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop())
      this.micStream = null
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event: 'stop' }))
      this.ws.close()
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}
