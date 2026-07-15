import { useState, useEffect, useRef } from 'react'
import { X, Mic, Loader2, PhoneOff, Volume2, Radio, CheckCircle2, Circle, ThumbsUp, ThumbsDown, Send, Smartphone } from 'lucide-react'
import { getGeminiLiveSession, GeminiLiveSession } from '../lib/geminiLive'
import { useAdminStore } from '../stores/adminStore'
import { useAuthStore } from '../stores/authStore'
import { startVoiceSessionRecord, endVoiceSessionRecord, submitSessionRating } from '../lib/voiceSessionLog'
import { SessionRatingScreen } from './SessionRatingScreen'
import { supabase } from '../lib/supabase'

// Low-frequency events worth persisting to voice_events (skip per-turn/state spam).
const PERSIST_EVENTS = new Set(['session_start', 'setup_complete', 'go_away', 'ws_close', 'ws_error', 'server_error', 'session_end'])

const STATE_LABELS = {
  idle: 'Starting…',
  connecting: 'Connecting…',
  speaking: 'Narrator speaking',
  listening: 'Listening — just speak',
  reconnecting: 'Reconnecting…',
  ended: 'Session ended',
  error: 'Error',
}

// Below this width, the two-column layout (transcript + controls) collapses to a single
// stacked column — matches the `sm:` Tailwind breakpoint used throughout this component.
// A phone rotated to landscape is almost always wider than this, which is exactly why
// landscape is required below it: it's the difference between the cramped stacked layout
// and the same side-by-side layout desktop gets.
const LANDSCAPE_REQUIRED_BELOW_WIDTH = 640

// Talk is required to run in landscape on narrow viewports — this is a hard gate (no
// session starts while portrait), not just a hint, so the connect() effect below must
// depend on it and bail out until it flips.
function useOrientationGate() {
  const [needsLandscape, setNeedsLandscape] = useState(() =>
    window.matchMedia('(orientation: portrait)').matches && window.innerWidth < LANDSCAPE_REQUIRED_BELOW_WIDTH
  )

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)')
    const check = () => setNeedsLandscape(mq.matches && window.innerWidth < LANDSCAPE_REQUIRED_BELOW_WIDTH)
    check()
    mq.addEventListener('change', check)
    window.addEventListener('resize', check)
    return () => {
      mq.removeEventListener('change', check)
      window.removeEventListener('resize', check)
    }
  }, [])

  return needsLandscape
}

// Blocking gate shown instead of the modal body on a narrow portrait viewport — replaces
// the transcript/controls entirely rather than overlaying them, since no session is
// running yet (connect() is gated on the same condition, so no Gemini Live slot is spent
// while the user hasn't rotated).
function RotatePrompt() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center min-h-[320px]">
      <Smartphone size={40} className="text-highlight animate-[rotate-hint_2.5s_ease-in-out_infinite]" />
      <div>
        <p className="text-sm font-semibold">Rotate your device</p>
        <p className="text-xs text-muted mt-1 max-w-[240px] mx-auto">
          Talk needs landscape — more room to follow the transcript and section progress.
        </p>
      </div>
    </div>
  )
}

// Group a run of narration into readable paragraphs (~2 sentences each).
// IMPORTANT: the sentence regex only matches text ending in . ! ? — so any trailing,
// not-yet-terminated portion (constant while streaming, and permanent when a segment
// ends mid-sentence, e.g. right before an aside) must be preserved explicitly, or those
// spoken words never render even though they're in the buffer + audio.
function toParagraphs(text) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || []
  const tail = text.slice(sentences.join('').length)
  const units = tail.trim() ? [...sentences, tail] : sentences
  if (units.length === 0) return [text.trim()].filter(Boolean)
  const paras = []
  for (let i = 0; i < units.length; i += 2) {
    paras.push(units.slice(i, i + 2).join(' ').trim())
  }
  return paras.filter(Boolean)
}

// Render agent transcription as structured blocks: narration paragraphs + distinct asides.
function AgentContent({ segments, text }) {
  if (!segments) return <p>{text}</p>
  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.type === 'aside' ? (
          <p key={i} className="italic text-muted border-l-2 border-muted/30 pl-2">
            {seg.text.trim()}
          </p>
        ) : (
          <div key={i} className="space-y-1.5">
            {toParagraphs(seg.text).map((p, j) => <p key={j}>{p}</p>)}
          </div>
        )
      )}
    </div>
  )
}

// Thumbs up/down on an agent bubble. Thumbs-down opens a remarks field that only commits
// to the store on explicit Submit (Enter or the send button) — never on every keystroke.
// Once submitted, it collapses to a read-only line the user can click to re-open and edit.
function MessageFeedback({ sessionId, msg, setVoiceMessageFeedback }) {
  const thumbs = msg.feedback?.thumbs || null
  const savedRemarks = msg.feedback?.remarks || ''
  const [draft, setDraft] = useState(savedRemarks)
  const [editing, setEditing] = useState(false)

  const toggle = (value) => {
    if (thumbs === value) {
      setVoiceMessageFeedback(sessionId, msg.id, null)
      setDraft('')
      setEditing(false)
      return
    }
    if (value === 'up') {
      setVoiceMessageFeedback(sessionId, msg.id, { thumbs: 'up', remarks: '' })
      setDraft('')
      setEditing(false)
      return
    }
    // Fresh thumbs-down: start editing immediately so the user can type + submit a reason.
    setVoiceMessageFeedback(sessionId, msg.id, { thumbs: 'down', remarks: '' })
    setDraft('')
    setEditing(true)
  }

  const submit = () => {
    setVoiceMessageFeedback(sessionId, msg.id, { thumbs: 'down', remarks: draft.trim() })
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-1.5 px-1">
      <button
        onClick={() => toggle('up')}
        aria-label="Good response"
        className={`p-1 rounded-md cursor-pointer transition-colors ${
          thumbs === 'up' ? 'text-success bg-success/10' : 'text-muted hover:text-foreground'
        }`}
      >
        <ThumbsUp size={12} />
      </button>
      <button
        onClick={() => toggle('down')}
        aria-label="Bad response"
        className={`p-1 rounded-md cursor-pointer transition-colors ${
          thumbs === 'down' ? 'text-error bg-error/10' : 'text-muted hover:text-foreground'
        }`}
      >
        <ThumbsDown size={12} />
      </button>
      {thumbs === 'down' && (
        editing ? (
          <>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder="What went wrong? (optional)"
              autoFocus
              className="flex-1 text-[11px] px-2 py-1 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-highlight"
            />
            <button
              onClick={submit}
              aria-label="Submit remarks"
              className="p-1 rounded-md text-highlight hover:bg-highlight/10 cursor-pointer shrink-0"
            >
              <Send size={12} />
            </button>
          </>
        ) : (
          <button
            onClick={() => { setDraft(savedRemarks); setEditing(true) }}
            className="flex-1 text-left text-[11px] px-2 py-1 rounded-md border border-transparent hover:border-border text-muted truncate cursor-pointer"
          >
            {savedRemarks || 'Add a reason…'}
          </button>
        )
      )}
    </div>
  )
}

// Animated waveform driven by live audio levels (agent = highlight, user = green).
function Waveform({ sessionRef, state }) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    let raf
    const loop = () => {
      const s = sessionRef.current
      if (s?.getAudioLevels) {
        const { user, agent } = s.getAudioLevels()
        setLevel(Math.max(user, agent))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [sessionRef])

  const BARS = 11
  const color =
    state === 'speaking' ? 'bg-highlight' : state === 'listening' ? 'bg-success' : 'bg-border'
  const idle = state !== 'speaking' && state !== 'listening'

  return (
    <div className="flex items-center justify-center gap-1 h-12">
      {Array.from({ length: BARS }).map((_, i) => {
        const center = 1 - Math.abs(i - (BARS - 1) / 2) / (BARS / 2)
        const h = idle ? 3 : 3 + level * 38 * center * (0.55 + Math.random() * 0.45)
        return (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-100 ${color}`}
            style={{ height: `${Math.max(3, h)}px`, opacity: idle ? 0.4 : 1 }}
          />
        )
      })}
    </div>
  )
}

export function GeminiLiveModal({ open, onClose, book, chapter, mode = 'chapter' }) {
  const needsLandscape = useOrientationGate()
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [reconnectCountdown, setReconnectCountdown] = useState(0)
  const [showRating, setShowRating] = useState(false)
  const [rating, setRating] = useState(0)
  const [feedbackText, setFeedbackText] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const sessionRef = useRef(null)
  const bubblesRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const providerConfigRef = useRef(null) // { liveModel, liveVoice } — for the voice_sessions record at close
  const { user, profile } = useAuthStore()
  const listenerName = (profile?.name || '').trim()

  const { voiceTranscripts, upsertVoiceMessage, clearVoiceTranscript, setVoiceMessageFeedback } = useAdminStore()
  const conversation = sessionId ? (voiceTranscripts[sessionId] || []) : []
  const sections = chapter?.sections || []

  // Auto-scroll to the newest text ONLY while the user is already at the bottom.
  // If they've scrolled up to re-read, leave their position alone.
  useEffect(() => {
    if (stickToBottomRef.current && bubblesRef.current) {
      bubblesRef.current.scrollTop = bubblesRef.current.scrollHeight
    }
  }, [conversation])

  // Friendly countdown shown during a reconnect gap. It's an estimate — the overlay is
  // dismissed the instant the session actually resumes (state → speaking/listening).
  useEffect(() => {
    if (state !== 'reconnecting') return
    setReconnectCountdown(5)
    const iv = setInterval(() => setReconnectCountdown((c) => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(iv)
  }, [state])

  const handleTranscriptScroll = () => {
    const el = bubblesRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  useEffect(() => {
    // Landscape is mandatory on narrow viewports — bail out without spending a Gemini
    // Live session slot (only ~3 concurrent per key) until the user actually rotates.
    if (!open || !book || (mode !== 'gist' && !chapter) || needsLandscape) return
    let cancelled = false

    async function connect() {
      setState('connecting')
      setError(null)
      setSessionId(null)
      setProgress(0)
      setActiveIndex(-1)
      try {
        const config = await getGeminiLiveSession(book, chapter, { mode, listenerName })
        if (cancelled) return
        setSessionId(config.sessionId)
        providerConfigRef.current = { liveModel: config.liveModel, liveVoice: config.liveVoice }
        startVoiceSessionRecord({
          sessionId: config.sessionId,
          userId: user?.id,
          bookId: book?.id,
          chapterNumber: mode === 'gist' ? null : chapter?.number,
          mode,
          provider: 'gemini_live',
        })

        const session = new GeminiLiveSession({
          ...config,
          mode,
          onStateChange: (s) => { if (!cancelled) setState(s) },
          onTranscript: ({ id, role, text, segments }) => {
            if (!cancelled && config.sessionId && text) {
              upsertVoiceMessage(config.sessionId, { id, role, text, segments })
            }
          },
          onProgress: ({ pct, activeIndex }) => {
            if (!cancelled) { setProgress(pct); setActiveIndex(activeIndex) }
          },
          onError: (msg) => { if (!cancelled) setError(msg) },
          onEvent: (evt) => {
            // Best-effort persist of key events (no-ops if the table/RLS isn't set up).
            if (!PERSIST_EVENTS.has(evt.type)) return
            supabase.from('voice_events').insert({
              session_id: evt.sessionId,
              book_id: book?.id,
              chapter_number: chapter?.number,
              type: evt.type,
              detail: evt,
            }).then(() => {}, () => {})
          },
        })
        sessionRef.current = session
        await session.start()
      } catch (err) {
        if (!cancelled) { setError(err.message); setState('error') }
      }
    }

    connect()
    return () => {
      cancelled = true
      sessionRef.current?.end()
      sessionRef.current = null
    }
  }, [open, book, chapter, mode, needsLandscape])

  const handleClose = () => {
    const hadSession = !!sessionId
    if (sessionId) {
      // Capture the transcript BEFORE clearing it — clearVoiceTranscript wipes the store
      // entry this record depends on.
      const turns = useAdminStore.getState().voiceTranscripts[sessionId] || []
      const meta = {
        endReason: error ? 'error' : 'user_ended',
        model: providerConfigRef.current?.liveModel,
        voice: providerConfigRef.current?.liveVoice,
      }
      if (mode !== 'gist') { meta.progressPct = progress; meta.activeSectionIndex = activeIndex }
      endVoiceSessionRecord({ sessionId, userId: user?.id, turns, meta })
      clearVoiceTranscript(sessionId)
    }
    sessionRef.current?.end()
    sessionRef.current = null
    setState('idle')
    setError(null)
    // Only prompt for a rating if a session record actually exists to attach it to —
    // e.g. a connection failure before any sessionId was issued has nothing to rate.
    if (hadSession) setShowRating(true)
    else onClose()
  }

  const handleSubmitRating = async () => {
    if (!rating) return
    setSubmittingRating(true)
    await submitSessionRating({ sessionId, userId: user?.id, rating, feedbackText })
    setSubmittingRating(false)
    setShowRating(false)
    setRating(0)
    setFeedbackText('')
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-3xl bg-background rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col max-h-[90dvh]">

        {/* Header (full width) */}
        <div className="flex items-start justify-between p-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-1.5">
              <Radio size={11} className="text-highlight" />
              <p className="text-[10px] text-highlight font-medium uppercase tracking-wide">Live · Full-duplex</p>
            </div>
            <p className="text-xs text-muted truncate mt-1">{book?.title}</p>
            <h2 className="text-sm font-semibold leading-snug mt-0.5">
              {mode === 'gist' ? 'Whole-book Gist' : `Ch ${chapter?.number}: ${chapter?.title}`}
            </h2>
          </div>
          {!showRating && (
            <button onClick={handleClose} className="p-1 hover:bg-surface rounded-lg cursor-pointer shrink-0">
              <X size={16} />
            </button>
          )}
        </div>

        {needsLandscape ? (
          <RotatePrompt />
        ) : showRating ? (
          <SessionRatingScreen
            rating={rating}
            setRating={setRating}
            feedbackText={feedbackText}
            setFeedbackText={setFeedbackText}
            onSubmit={handleSubmitRating}
            submitting={submittingRating}
          />
        ) : (
        <>
        {/* Two-column body */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0">

          {/* Left column — transcript (70%) */}
          <div className="relative flex flex-col min-h-0 flex-1 sm:flex-none sm:w-[70%] sm:border-r border-border">
            {/* Reconnect overlay — the socket hit its time limit; we resume where we left off. */}
            {state === 'reconnecting' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/92 backdrop-blur-sm px-6 text-center">
                <Loader2 size={22} className="animate-spin text-highlight" />
                <p className="text-sm font-medium">Hope you're having a lot of fun!</p>
                <p className="text-xs text-muted">
                  Let's continue in {reconnectCountdown > 0 ? `${reconnectCountdown}s` : 'a moment'}…
                </p>
              </div>
            )}
            {conversation.length > 0 ? (
              <div ref={bubblesRef} onScroll={handleTranscriptScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {conversation.map((msg) => (
                  <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-muted px-1">{msg.role === 'agent' ? 'Narrator' : 'You'}</span>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'agent'
                        ? 'bg-surface border border-border rounded-tl-none text-foreground'
                        : 'bg-highlight text-white rounded-tr-none'
                    }`}>
                      {msg.role === 'agent'
                        ? <AgentContent segments={msg.segments} text={msg.text} />
                        : msg.text}
                    </div>
                    {msg.role === 'agent' && (
                      <MessageFeedback sessionId={sessionId} msg={msg} setVoiceMessageFeedback={setVoiceMessageFeedback} />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center px-6 py-10 min-h-[140px]">
                <p className="text-xs text-muted text-center leading-relaxed">
                  The narrator will begin shortly.<br />Just speak anytime to ask a question — no buttons needed.
                </p>
              </div>
            )}

            {error && (
              <div className="mx-4 mb-3 p-3 rounded-lg bg-error/10 border border-error shrink-0">
                <p className="text-xs text-error">{error}</p>
              </div>
            )}
          </div>

          {/* Right column — controls (30%) */}
          <div className="flex flex-col min-h-0 max-h-[46dvh] sm:max-h-none sm:w-[30%] shrink-0 border-t sm:border-t-0 border-border">

            {/* Waveform + state */}
            <div className="px-4 pt-4 shrink-0">
              <Waveform sessionRef={sessionRef} state={state} />
              <div className="flex items-center justify-center gap-2 mt-1">
                {state === 'speaking' && <Volume2 size={12} className="text-highlight animate-pulse" />}
                {state === 'listening' && <Mic size={12} className="text-success animate-pulse" />}
                {(state === 'connecting' || state === 'idle' || state === 'reconnecting') && <Loader2 size={12} className="animate-spin text-muted" />}
                <p className="text-xs text-muted">{STATE_LABELS[state] || state}</p>
              </div>
            </div>

            {/* Section progress */}
            {sections.length > 0 && (
              <div className="px-4 pt-4 flex flex-col min-h-0 flex-1">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <p className="text-xs text-muted">Progress</p>
                  <p className="text-xs font-medium">{progress}%</p>
                </div>
                <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden shrink-0 mb-3">
                  <div className="h-full bg-highlight rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <div className="space-y-1.5 overflow-y-auto pr-1 min-h-0">
                  {sections.map((s, i) => {
                    const status = activeIndex < 0 ? 'remaining' : i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'remaining'
                    return (
                      <div key={s.number ?? i} className="flex items-start gap-2">
                        {status === 'done' && <CheckCircle2 size={12} className="text-success shrink-0 mt-0.5" />}
                        {status === 'active' && <Volume2 size={12} className="text-highlight shrink-0 mt-0.5 animate-pulse" />}
                        {status === 'remaining' && <Circle size={12} className="text-muted/40 shrink-0 mt-0.5" />}
                        <span className={`text-[11px] leading-snug ${
                          status === 'active' ? 'text-highlight font-medium'
                            : status === 'done' ? 'text-foreground'
                            : 'text-muted'
                        }`}>
                          {s.number}. {s.title || `Section ${s.number}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Legend + End Session */}
            <div className="p-4 border-t border-border shrink-0 mt-auto">
              <div className="flex flex-col gap-1.5 mb-3">
                <span className="flex items-center gap-1.5 text-[10px] text-muted"><span className="w-2 h-2 rounded-full bg-foreground/70" /> Book content</span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted"><span className="w-2 h-2 rounded-full bg-muted/50" /> Narrator's replies</span>
              </div>
              <button
                onClick={handleClose}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-surface hover:bg-background text-sm font-medium cursor-pointer"
              >
                <PhoneOff size={14} /> End Session
              </button>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
