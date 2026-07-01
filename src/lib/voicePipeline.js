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
  return data
  // { geminiApiKey, narrationPrompt, answeringPrompt, sections, sessionId,
  //   sttModel, llmModel, ttsModel, ttsVoice }
}

// ─── Gemini text (LLM + STT) ──────────────────────────────────────────────────
async function callGeminiText(apiKey, model, prompt, userMessage) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.7 },
      }),
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates[0].content.parts[0].text.trim()
}

async function transcribeAudio(apiKey, model, audioBlob) {
  // Browser STT requires real-time WebSpeech integration (not post-hoc blob transcription)
  // so we always use Gemini for transcription regardless of sttModel setting
  const effectiveModel = model === 'browser' ? 'gemini-2.5-flash' : model

  const buffer = await audioBlob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // Chunked encoding to avoid O(n²) string concatenation and stack overflow on large blobs
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  const base64 = btoa(binary)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent?key=${apiKey}`,
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

// ─── TTS: prepare (fetch blob) then play — separated so we can pre-fetch ──────
async function prepareTTS(apiKey, ttsModel, ttsVoice, text) {
  const cleanText = text.replace(/\*([^*]+)\*/g, '$1').replace(/\*\*/g, '').trim()

  if (ttsModel !== 'browser') {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: cleanText }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ttsVoice } } },
            },
          }),
        }
      )
      const data = await res.json()
      if (data.error) {
        console.warn(`[TTS] ${ttsModel}/${ttsVoice}:`, data.error.message)
      } else {
        const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data
        if (audioData) {
          const binary = atob(audioData)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          return { type: 'blob', blob: new Blob([bytes], { type: 'audio/wav' }) }
        }
      }
    } catch (err) {
      console.warn('[TTS] Gemini failed, falling back to browser:', err.message)
    }
  }

  return { type: 'browser', text: cleanText }
}

function getBestBrowserVoice() {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => /Samantha.*Enhanced/i.test(v.name) && v.lang.startsWith('en')) ||
    voices.find((v) => /Samantha/i.test(v.name) && v.lang.startsWith('en')) ||
    voices.find((v) => /Alex/i.test(v.name) && v.lang.startsWith('en')) ||
    voices.find((v) => v.lang === 'en-US' && v.localService) ||
    voices.find((v) => v.lang.startsWith('en') && v.localService) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    null
  )
}

async function playPrepared(prepared, onAudioEl) {
  if (prepared.type === 'blob') {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(prepared.blob)
      const audio = new Audio(url)
      onAudioEl?.(audio)
      audio.onended = () => { URL.revokeObjectURL(url); resolve() }
      audio.onerror = reject
      audio.play().catch(reject)
    })
  } else {
    await new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(prepared.text)
      const voice = getBestBrowserVoice()
      if (voice) utterance.voice = voice
      utterance.rate = 0.92
      utterance.onend = resolve
      utterance.onerror = resolve
      window.speechSynthesis.speak(utterance)
    })
  }
}

// ─── Main session class ────────────────────────────────────────────────────────
export class VoicePipelineSession {
  constructor({ geminiApiKey, narrationPrompt, answeringPrompt, sections, sessionId,
    sttModel, llmModel, ttsModel, ttsVoice,
    onStateChange, onTranscript, onSectionComplete, onError }) {
    this.apiKey = geminiApiKey
    this.narrationPrompt = narrationPrompt
    this.answeringPrompt = answeringPrompt
    this.sections = sections
    this.sessionId = sessionId
    this.sttModel = sttModel || 'gemini-2.5-flash'
    this.llmModel = llmModel || 'gemini-2.5-flash'
    this.ttsModel = ttsModel || 'gemini-2.5-flash-preview-tts'
    this.ttsVoice = ttsVoice || 'Charon'
    this.onStateChange = onStateChange
    this.onTranscript = onTranscript
    this.onSectionComplete = onSectionComplete
    this.onError = onError

    this.currentSectionIdx = 0
    this.sentencePosition = 0
    this.state = 'idle'
    this.audioEl = null
    this.mediaRecorder = null
    this.audioChunks = []
    this._prefetched = null  // { text, prepared, sentenceCount }
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
      let chunkText, prepared

      if (this._prefetched) {
        // Use pre-fetched chunk — audio starts immediately on Continue
        const pf = this._prefetched
        this._prefetched = null
        chunkText = pf.text
        prepared = pf.prepared
        this.sentencePosition += pf.sentenceCount
      } else {
        // Cold fetch (first chunk or pre-fetch missed)
        chunkText = await callGeminiText(
          this.apiKey,
          this.llmModel,
          this.narrationPrompt,
          `Narrate the next 2-4 sentences from this text:\n\n${remaining}`
        )
        if (!chunkText) throw new Error('Empty narration response from LLM')
        const narrated = chunkText.match(/[^.!?]+[.!?]+/g) || []
        this.sentencePosition += narrated.length
        prepared = await prepareTTS(this.apiKey, this.ttsModel, this.ttsVoice, chunkText)
      }

      this.onTranscript?.({ role: 'agent', text: chunkText })

      // Fire-and-forget pre-fetch of next chunk while current audio plays
      this._prefetchNext()

      await playPrepared(prepared, (el) => { this.audioEl = el })
      this.audioEl = null
      this.setState('paused')
    } catch (err) {
      this.onError?.(err.message)
    }
  }

  _prefetchNext() {
    if (this._prefetched) return
    const remaining = this.remainingText()
    if (!remaining) return

    ;(async () => {
      try {
        const text = await callGeminiText(
          this.apiKey,
          this.llmModel,
          this.narrationPrompt,
          `Narrate the next 2-4 sentences from this text:\n\n${remaining}`
        )
        if (!text) return
        const sentenceCount = (text.match(/[^.!?]+[.!?]+/g) || []).length
        const prepared = await prepareTTS(this.apiKey, this.ttsModel, this.ttsVoice, text)
        this._prefetched = { text, prepared, sentenceCount }
      } catch { /* ignore — will cold-fetch on next continue */ }
    })()
  }

  async continueNarration() {
    this.setState('narrating')
    await this._narrateNextChunk()
  }

  // ── Q&A ────────────────────────────────────────────────────────────────────
  async startRecording() {
    this.setState('asking')
    this.audioChunks = []
    this._prefetched = null  // invalidate; position may change after Q&A

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
      const question = await transcribeAudio(this.apiKey, this.sttModel, blob)
      this.onTranscript?.({ role: 'user', text: question })

      const fullChapterContent = this.sections.map((s) => s.text).join('\n\n')
      const filledAnsweringPrompt = this.answeringPrompt.replace(/{content}/g, fullChapterContent)

      const answer = await callGeminiText(this.apiKey, this.llmModel, filledAnsweringPrompt, question)
      if (!answer) throw new Error('Empty answer from LLM')

      this.onTranscript?.({ role: 'agent', text: answer })
      const prepared = await prepareTTS(this.apiKey, this.ttsModel, this.ttsVoice, answer)
      await playPrepared(prepared, (el) => { this.audioEl = el })
      this.audioEl = null

      this.setState('narrating')
      await this._narrateNextChunk()
    } catch (err) {
      this.onError?.(err.message)
    }
  }

  stopAudio() {
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl = null
    }
    window.speechSynthesis.cancel()
  }

  end() {
    this.stopAudio()
    this._prefetched = null
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop()
      this.mediaRecorder.stream.getTracks().forEach((t) => t.stop())
    }
    this.setState('ended')
  }
}
