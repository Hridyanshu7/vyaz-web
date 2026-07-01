import { supabase } from './supabase'

// ─── Session config from Edge Function ────────────────────────────────────────
export async function getVoicePipelineSession(book, chapter) {
  const { data, error } = await supabase.functions.invoke('voice-session', {
    body: {
      book_id: book.id,
      book_title: book.title,
      author: book.author,
      chapter_number: chapter.number,
      chapter_title: chapter.title,
      oneliner: chapter.oneliner || '',
      sections: (chapter.sections || []).map((s) => ({
        number: s.number,
        text: s.text,
      })),
    },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data // { geminiApiKey, narrationPrompt, answeringPrompt, sections, sessionId }
}

// ─── Gemini helpers ────────────────────────────────────────────────────────────
async function callGeminiText(apiKey, prompt, userMessage) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.7,
          response_mime_type: 'application/json',
        },
      }),
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  const raw = data.candidates[0].content.parts[0].text
  return JSON.parse(raw)
}

async function transcribeAudio(apiKey, audioBlob) {
  // Convert blob to base64
  const buffer = await audioBlob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  const base64 = btoa(binary)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Transcribe this audio exactly. Return only the transcribed text, nothing else.' },
            { inline_data: { mime_type: audioBlob.type || 'audio/webm', data: base64 } },
          ],
        }],
      }),
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates[0].content.parts[0].text.trim()
}

async function textToSpeech(apiKey, text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          response_modalities: ['AUDIO'],
          speech_config: { voice_config: { prebuilt_voice_config: { voice_name: 'Charon' } } },
        },
      }),
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  const audioBase64 = data.candidates[0].content.parts[0].inline_data.data
  const binary = atob(audioBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'audio/wav' })
}

// ─── Main session class ────────────────────────────────────────────────────────
export class VoicePipelineSession {
  constructor({ geminiApiKey, narrationPrompt, answeringPrompt, sections, sessionId, onStateChange, onTranscript, onSectionComplete, onError }) {
    this.apiKey = geminiApiKey
    this.narrationPrompt = narrationPrompt
    this.answeringPrompt = answeringPrompt
    this.sections = sections
    this.sessionId = sessionId
    this.onStateChange = onStateChange
    this.onTranscript = onTranscript
    this.onSectionComplete = onSectionComplete
    this.onError = onError

    this.currentSectionIdx = 0
    this.sentencePosition = 0    // how many sentences narrated in current section
    this.state = 'idle'
    this.audioEl = null
    this.mediaRecorder = null
    this.audioChunks = []
    this.nextChunkAudio = null   // pre-fetched next chunk audio
  }

  setState(s) {
    this.state = s
    this.onStateChange?.(s)
  }

  currentSection() {
    return this.sections[this.currentSectionIdx]
  }

  remainingText() {
    const sec = this.currentSection()
    if (!sec) return null
    const sentences = sec.text.match(/[^.!?]+[.!?]+/g) || [sec.text]
    return sentences.slice(this.sentencePosition).join(' ')
  }

  // ── Narration ──────────────────────────────────────────────────────────────
  async start() {
    this.setState('narrating')
    await this._narrateNextChunk()
  }

  async _narrateNextChunk() {
    const remaining = this.remainingText()
    if (!remaining) {
      // Section complete
      this.onSectionComplete?.(this.currentSection()?.number)
      this.currentSectionIdx++
      this.sentencePosition = 0
      if (this.currentSectionIdx >= this.sections.length) {
        this.setState('done')
        return
      }
      await this._narrateNextChunk()
      return
    }

    try {
      const result = await callGeminiText(
        this.apiKey,
        this.narrationPrompt,
        `Narrate the next 2-4 sentences from this text:\n\n${remaining}`
      )

      const chunk = result.text || ''
      const checkIn = result.check_in || ''

      // Count sentences narrated to advance position
      const narrated = chunk.match(/[^.!?]+[.!?]+/g) || []
      this.sentencePosition += narrated.length

      this.onTranscript?.({ role: 'agent', text: chunk })

      // Play chunk + check-in sequentially
      const fullText = checkIn ? `${chunk} ${checkIn}` : chunk
      await this._playTTS(fullText)

      this.setState('paused')
    } catch (err) {
      this.onError?.(err.message)
    }
  }

  async continueNarration() {
    this.setState('narrating')
    await this._narrateNextChunk()
  }

  // ── Q&A ────────────────────────────────────────────────────────────────────
  async startRecording() {
    this.setState('asking')
    this.audioChunks = []

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.mediaRecorder = new MediaRecorder(stream)
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data) }
    this.mediaRecorder.start()
  }

  async stopRecordingAndAnswer() {
    if (!this.mediaRecorder) return
    this.setState('answering')

    await new Promise((res) => {
      this.mediaRecorder.onstop = res
      this.mediaRecorder.stop()
      this.mediaRecorder.stream.getTracks().forEach((t) => t.stop())
    })

    try {
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' })
      const question = await transcribeAudio(this.apiKey, blob)
      this.onTranscript?.({ role: 'user', text: question })

      const fullChapterContent = this.sections.map((s) => s.text).join('\n\n')
      const filledAnsweringPrompt = this.answeringPrompt.replace(/{content}/g, fullChapterContent)

      const result = await callGeminiText(
        this.apiKey,
        filledAnsweringPrompt,
        question
      )

      const answer = result.text || ''
      this.onTranscript?.({ role: 'agent', text: answer })
      await this._playTTS(answer)

      // Seamlessly resume narration
      this.setState('narrating')
      await this._narrateNextChunk()
    } catch (err) {
      this.onError?.(err.message)
    }
  }

  // ── TTS playback ───────────────────────────────────────────────────────────
  async _playTTS(text) {
    return new Promise(async (resolve, reject) => {
      try {
        const blob = await textToSpeech(this.apiKey, text)
        const url = URL.createObjectURL(blob)
        this.audioEl = new Audio(url)
        this.audioEl.onended = () => { URL.revokeObjectURL(url); resolve() }
        this.audioEl.onerror = reject
        await this.audioEl.play()
      } catch (err) { reject(err) }
    })
  }

  stopAudio() {
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl = null
    }
  }

  end() {
    this.stopAudio()
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop()
      this.mediaRecorder.stream.getTracks().forEach((t) => t.stop())
    }
    this.setState('ended')
  }
}
