import { supabase } from './supabase'
import { normalizeWords } from './words'

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
    // `chapter.sections` only exists once an admin has run the Split step (AdminPanel.jsx,
    // splitIntoSections) — epub.js never populates it at parse time. A never-split chapter
    // has sections: [] (truthy, so `sections || []` doesn't catch it), which used to send an
    // EMPTY narration payload: the edge function's {content} placeholder ended up blank, and
    // Gemini narrated well-known books from its own training memory instead of the real
    // text — drifting/hallucinating past whatever it could recall precisely, completely
    // silently (no error, since the session "worked"). Falling back to the whole `content`
    // as one synthetic section guarantees real chapter text always reaches the prompt (and
    // this.sections downstream in GeminiLiveSession — _chapterWords/_sentenceOffsets/seek
    // all read from it too, so an empty array was silently breaking those as well).
    const sections = chapter.sections?.length
      ? chapter.sections
      : (chapter.content ? [{ number: 1, title: '', text: chapter.content }] : [])
    body = {
      book_id: book.id,
      book_title: book.title,
      author: book.author,
      chapter_number: chapter.number,
      chapter_title: chapter.title,
      oneliner: chapter.oneliner || '',
      sections: sections.map((s) => ({ number: s.number, title: s.title || '', text: s.text })),
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

// Same chunked-btoa pattern as int16ToBase64, for arbitrary bytes (image files) instead of
// PCM audio samples — used to send a chapter's image/svg assets as a live multimodal frame.
function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
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
    onStateChange, onTranscript, onProgress, onError, onEvent, onToolCall }) {
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
    // Synchronous callback for tool calls this class can't resolve on its own (needs data
    // it doesn't hold, e.g. the full chapters list for jump_to_chapter, or chapter blocks
    // for describe_visual) — (name, args) => { ok, error? }, called and answered
    // immediately, not async, so the toolResponse can go out before this session
    // potentially tears itself down as a result.
    this.onToolCall = onToolCall
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

    // Progress: single verbatim word pointer over the chapter (asides/Q&A excluded). Joined
    // with a blank line (not a single space) so paragraph boundaries survive for
    // seek_by_count — word-alignment is whitespace-agnostic either way (normalizeWords
    // splits on \s+).
    const chapterText = this.sections.map((s) => s.text).join('\n\n')
    this._chapterWords = normalizeWords(chapterText)
    // Word-offset each sentence/paragraph starts at, for seek_by_count. Derived from the
    // ORIGINAL (non-normalized) text so blank lines and .!? punctuation survive.
    this._sentenceOffsets = []
    this._paragraphOffsets = []
    {
      let cursor = 0
      for (const para of chapterText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
        this._paragraphOffsets.push(cursor)
        const matched = para.match(/[^.!?]+[.!?]+(\s|$)/g) || []
        const tail = para.slice(matched.join('').length).trim()
        for (const sentence of tail ? [...matched, tail] : matched.length ? matched : [para]) {
          this._sentenceOffsets.push(cursor)
          cursor += normalizeWords(sentence).length
        }
      }
    }
    this._wordPtr = 0
    this._turnStartPtr = 0
    // Whether this turn's start position has been confidently re-anchored yet (via
    // _findBestAnchor) — see _startAgentBubble/_handleServerMessage.
    this._turnAnchored = false
    this._lastPct = 0
    this._lastActive = -1
    // Audio-clock checkpoints for getDisplayWordPtr() — raw _wordPtr jumps the instant
    // transcription TEXT arrives, which is network-paced and can run well ahead of the
    // actual real-time audio PLAYBACK the words correspond to.
    this._progressCheckpoints = []
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

  // Find where a turn's opening words best match within the WHOLE chapter — not just
  // forward from wherever the pointer currently sits. A turn can't be assumed to continue
  // linearly: the agent may rewind/repeat earlier text on request, or a small alignment
  // slip in one turn would otherwise compound forever (the pointer only ever moves forward
  // once _alignFrom locks onto a position). Requires a contiguous run of at least half the
  // lead words to trust a re-anchor at all — otherwise falls back to the current pointer
  // (treated as an ordinary continuation), so a short/ambiguous phrase can't cause a false
  // jump to some coincidental match elsewhere in the book.
  _findBestAnchor(leadWords) {
    if (leadWords.length === 0) return this._wordPtr
    const n = this._chapterWords.length
    let bestScore = 0
    let bestPos = this._wordPtr
    for (let start = 0; start < n; start++) {
      let score = 0
      for (let k = 0; k < leadWords.length && start + k < n; k++) {
        if (this._chapterWords[start + k] !== leadWords[k]) break
        score++
      }
      if (score === 0) continue
      // Ties (equally-good matches, e.g. a repeated stock phrase) prefer whichever
      // position is closest to the current pointer — most likely to be the real one.
      if (score > bestScore || (score === bestScore && Math.abs(start - this._wordPtr) < Math.abs(bestPos - this._wordPtr))) {
        bestScore = score
        bestPos = start
      }
    }
    return bestScore >= Math.ceil(leadWords.length / 2) ? bestPos : this._wordPtr
  }

  // Dispatch every function call in one toolCall message. Unknown names still get a
  // toolResponse (rather than silently dropped) so the model never hangs waiting on one.
  _handleToolCall(functionCalls) {
    this._log('tool_call', { calls: functionCalls.map((fc) => ({ name: fc.name, args: fc.args })) })
    for (const fc of functionCalls) {
      if (fc.name === 'seek_by_count') {
        this._executeSeek(this._resolveCountSeek(fc.args || {}), fc.id, fc.name)
      } else if (fc.name === 'seek_to_text') {
        // A short quote is too easy to coincidentally match somewhere wrong (e.g. common
        // opening words matching near position 0) — require enough words to trust it, same
        // spirit as _findBestAnchor's own score threshold. Guards against the model firing
        // this for an ordinary "continue" it shouldn't have called a tool for at all.
        const words = normalizeWords(fc.args?.quote || '')
        if (words.length < 4) {
          this._sendToolResponse(fc.id, fc.name, { ok: false, error: 'quote too short to locate reliably — if the listener just wants you to continue, no tool call is needed' })
        } else {
          this._executeSeek(this._findBestAnchor(words), fc.id, fc.name)
        }
      } else if (fc.name === 'end_session') {
        this._sendToolResponse(fc.id, fc.name, { ok: true })
        this.end()
      } else if (fc.name === 'jump_to_chapter') {
        // This class only holds ONE chapter's content — resolving a target chapter and
        // switching to it needs the full chapters list, which lives at the React layer.
        // onToolCall is synchronous specifically so the toolResponse can go out (and,
        // on success, this session torn down) in the same tick, not after an async gap.
        const result = this.onToolCall?.(fc.name, fc.args || {}) || { ok: false, error: 'chapter switching not available' }
        this._sendToolResponse(fc.id, fc.name, result)
        if (result.ok) this.end()
      } else if (fc.name === 'describe_visual') {
        // Block-locating (which image/table the listener means) is resolved synchronously
        // via onToolCall, same as jump_to_chapter — but SENDING it is async (fetching the
        // asset's bytes), so the toolResponse itself doesn't go out until that's done.
        const resolved = this.onToolCall?.(fc.name, fc.args || {}) || { ok: false, error: 'not available' }
        if (!resolved.ok) {
          this._sendToolResponse(fc.id, fc.name, resolved)
        } else if (resolved.type === 'table') {
          this.sendTextContext(resolved.text)
          this._sendToolResponse(fc.id, fc.name, { ok: true })
        } else {
          this.sendImageFrame(resolved.assetUrl).then((sent) => {
            this._sendToolResponse(fc.id, fc.name, sent ? { ok: true } : { ok: false, error: 'could not load the image' })
          })
        }
      } else {
        this._sendToolResponse(fc.id, fc.name, { ok: false, error: 'not implemented' })
      }
    }
  }

  // direction/unit/count -> a target word offset, stepping through the pre-computed
  // sentence/paragraph boundary arrays from wherever the pointer currently sits.
  _resolveCountSeek({ direction, unit, count }) {
    const offsets = unit === 'paragraph' ? this._paragraphOffsets : this._sentenceOffsets
    if (!offsets.length) return this._wordPtr
    let idx = 0
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] <= this._wordPtr) idx = i
      else break
    }
    const delta = direction === 'backward' ? -Math.abs(count || 1) : Math.abs(count || 1)
    const targetIdx = Math.max(0, Math.min(offsets.length - 1, idx + delta))
    return offsets[targetIdx]
  }

  // Jump the pointer to targetWordPtr and nudge the model to resume verbatim from there.
  // Deliberately does NOT call _startAgentBubble() here — that would checkpoint the display
  // pointer against "now", but no real audio exists yet for this position (the model's
  // response to the resume nudge below hasn't even been generated). getDisplayWordPtr()
  // would then report the full target the instant that stale checkpoint's timestamp passes
  // (next animation frame), well before real audio catches up — the highlight would visibly
  // run ahead of the narration. Instead: just clear the current turn/anchor state so the
  // NEXT real message (handled normally in _handleServerMessage) starts a fresh turn there —
  // its own _startAgentBubble() call checkpoints against the real audio clock at that later,
  // accurate moment. Trust the seek target directly (skip fuzzy re-anchoring) since it's
  // exact, not a guess from transcription text. Mirrors _reconnect()'s RESUME_PROMPT pattern
  // — a synthetic clientContent turn, not a real user utterance.
  _executeSeek(targetWordPtr, id, name) {
    this._wordPtr = Math.max(0, Math.min(this._chapterWords.length, targetWordPtr))
    this._agentMsgId = null
    this._agentBuf = ''
    this._turnStartPtr = this._wordPtr
    this._turnAnchored = true
    this._emitProgress()
    this._sendToolResponse(id, name, { ok: true })
    const resumeCue = this._chapterWords.slice(this._wordPtr, this._wordPtr + 12).join(' ')
    this._send({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: `Continue reading the chapter aloud VERBATIM, resuming exactly from: "${resumeCue}"` }] }],
        turnComplete: true,
      },
    })
  }

  _sendToolResponse(id, name, response) {
    this._log('tool_response', { name, response })
    this._send({ toolResponse: { functionResponses: [{ id, name, response }] } })
  }

  // Send an image (a resolved asset URL from a chapter's image block) into the live session
  // as multimodal context, so the model can actually look at it and describe it — B7's "no
  // pre-baked captions, describe live via realtimeInput" design. UNVERIFIED against the
  // real API: `realtimeInput.video` is a best-guess field name for image-frame delivery,
  // Gemini Live's frame-streaming convention, not yet confirmed by a live test.
  async sendImageFrame(assetUrl) {
    try {
      const res = await fetch(assetUrl)
      const blob = await res.blob()
      const bytes = new Uint8Array(await blob.arrayBuffer())
      this._send({ realtimeInput: { video: { data: bytesToBase64(bytes), mimeType: blob.type || 'image/jpeg' } } })
      this._log('image_frame_sent', { assetUrl, mimeType: blob.type })
      return true
    } catch (err) {
      this._log('image_frame_failed', { assetUrl, error: err.message })
      return false
    }
  }

  // Inject structured non-image context (e.g. a table's rows as text) as a real turn — the
  // model reads it directly, no vision needed, it's already text.
  sendTextContext(text) {
    this._send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } })
  }

  // The display-ready word pointer — interpolated against actual AUDIO PLAYBACK time
  // (playCtx.currentTime vs. the audio-clock checkpoints recorded in _handleServerMessage),
  // not transcription arrival time. Transcription text can arrive network-fast in bursts
  // well ahead of the real-time audio it corresponds to. Polled by the UI every frame rather
  // than pushed via onProgress, so the reveal advances smoothly instead of jumping only when
  // a transcription chunk happens to arrive over the wire.
  getDisplayWordPtr() {
    const cps = this._progressCheckpoints
    if (cps.length === 0) return -1 // no turn has started yet — stay in "not started" state
    const now = this.playCtx?.currentTime ?? 0
    let result = cps[0].wordPtr
    for (let i = 0; i < cps.length; i++) {
      if (cps[i].audioTime > now) break
      result = cps[i].wordPtr
      const next = cps[i + 1]
      if (next && next.audioTime > now) {
        if (next.audioTime > cps[i].audioTime) {
          const t = (now - cps[i].audioTime) / (next.audioTime - cps[i].audioTime)
          result = Math.round(cps[i].wordPtr + t * (next.wordPtr - cps[i].wordPtr))
        }
        break
      }
    }
    return result
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
      // Re-anchor the turn's start position once enough narration words have arrived to
      // trust a match — the agent can rewind/repeat earlier text on request, so a turn
      // can't be assumed to continue linearly from wherever the pointer already was. Not
      // clamped to Math.max anymore: a confident re-anchor is allowed to move the pointer
      // backward (that's the whole point — it's what makes a rewind actually show up).
      if (!this._turnAnchored) {
        const narrationWords = normalizeWords(narration)
        if (narrationWords.length >= 4) {
          this._turnStartPtr = this._findBestAnchor(narrationWords.slice(0, 6))
          this._turnAnchored = true
        }
      }
      this._wordPtr = this._alignFrom(this._turnStartPtr, narration)
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
        // Checkpoint HERE, gated on real audio actually having been scheduled in this
        // message — not on transcription text alone. Transcription and audio aren't
        // guaranteed to arrive in the same message; text can lead audio by a chunk or more.
        // Checkpointing on text-only messages would pair a fresh wordPtr with a STALE
        // `_nextStartTime`, so the interpolated display would reach that word before its
        // real audio has even started — a small error each time, compounding over a long
        // session into a growing highlight-ahead-of-audio drift.
        this._progressCheckpoints.push({ audioTime: this._nextStartTime, wordPtr: this._wordPtr })
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
    this._turnStartPtr = this._wordPtr // interim guess — replaced once _findBestAnchor runs
    this._turnAnchored = false
    this._userBuf = ''
    this._userMsgId = null
    // Seed a checkpoint at this turn's start (audio-clock time, self-corrected for any gap
    // since the last turn) so interpolation has a valid baseline the instant the first
    // transcription chunk of the new turn arrives.
    const audioTime = Math.max(this._nextStartTime, this.playCtx?.currentTime ?? 0)
    this._progressCheckpoints = [{ audioTime, wordPtr: this._wordPtr }]
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
            // Hands-free voice commands (rewind/skip/stop) — see _handleToolCall.
            tools: [{
              functionDeclarations: [
                {
                  name: 'seek_by_count',
                  description: 'Move the narration position forward or backward by a number of sentences or paragraphs, e.g. "go back two sentences" or "skip ahead a paragraph".',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      direction: { type: 'STRING', enum: ['forward', 'backward'] },
                      unit: { type: 'STRING', enum: ['sentence', 'paragraph'] },
                      count: { type: 'INTEGER', description: 'How many sentences/paragraphs to move.' },
                    },
                    required: ['direction', 'unit', 'count'],
                  },
                },
                {
                  name: 'seek_to_text',
                  description: 'Move the narration position to a specific passage the listener described, e.g. "go back to where they meet the investor". The quote must be the EXACT verbatim words from the chapter text you were given, not a paraphrase.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      quote: { type: 'STRING', description: 'Exact verbatim words from the chapter to resume from.' },
                    },
                    required: ['quote'],
                  },
                },
                {
                  name: 'end_session',
                  description: 'End the listening session now, e.g. "that\'s enough for now" or "let\'s stop here".',
                  parameters: { type: 'OBJECT', properties: {} },
                },
                {
                  name: 'jump_to_chapter',
                  description: 'Switch to a different chapter of the book, e.g. "go to chapter 5" or "jump to the chapter about X". Provide the chapter number if the listener said one, otherwise the chapter title/topic as best you can tell.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      chapter_number: { type: 'INTEGER', description: 'The chapter number, if the listener said one.' },
                      chapter_title: { type: 'STRING', description: 'The chapter title or topic, if no number was given.' },
                    },
                  },
                },
                {
                  name: 'describe_visual',
                  description: 'Look at and describe a chart, image, or table from the chapter, e.g. "what does this chart show?" or "can you describe that image?". Use "most_recent" for whichever one narration just passed; otherwise describe which one the listener means.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      reference: { type: 'STRING', description: '"most_recent", or a description of which visual (e.g. its caption/topic).' },
                    },
                    required: ['reference'],
                  },
                },
              ],
            }],
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
        if (m.toolCall?.functionCalls) { this._handleToolCall(m.toolCall.functionCalls); return }
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

  // Tap-to-interrupt (the voice orb, while speaking): mirrors exactly what already happens
  // on a real server-driven `sc.interrupted` message (barge-in via VAD on the mic stream) —
  // stop audio immediately, reset the bubble so the next reply starts fresh. Deliberately
  // client-side only: telling the SERVER to cancel in-flight generation would need an
  // explicit realtimeInput.activityStart/activityEnd signal, but automaticActivityDetection
  // is enabled on this session, and sending manual activity markers while auto-VAD is on is
  // unverified/likely-rejected by the API — same "flag it, don't guess" discipline as
  // sendImageFrame's realtimeInput.video field above. In practice this still reads as a real
  // interrupt to the listener (immediate silence); the model's own turn naturally winds down
  // once it notices the user speaking, same as it always does.
  interrupt() {
    this._log('orb_interrupt')
    this._stopPlayback()
    this._agentMsgId = null
    this._agentBuf = ''
    this.setState('listening')
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
