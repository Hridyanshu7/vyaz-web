import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Radio } from 'lucide-react'
import { useLiveSession } from '../lib/useLiveSession'
import { useAdminStore } from '../stores/adminStore'
import { useAuthStore } from '../stores/authStore'
import { startVoiceSessionRecord, endVoiceSessionRecord, submitSessionRating } from '../lib/voiceSessionLog'
import { SessionRatingScreen } from './SessionRatingScreen'
import { VoiceOrb } from './talk/VoiceOrb'
import { BookStage } from './talk/BookStage'
import { BookSeekBar } from './talk/BookSeekBar'
import { ConversationPanel } from './talk/ConversationPanel'
import { TalkTabs } from './talk/TalkTabs'
import { supabase } from '../lib/supabase'

// Low-frequency events worth persisting to voice_events (skip per-turn/state spam).
const PERSIST_EVENTS = new Set(['session_start', 'setup_complete', 'go_away', 'ws_close', 'ws_error', 'server_error', 'session_end', 'tool_call', 'tool_response', 'orb_interrupt'])

// The Session Modal (design-language.html §12) — a two-panel Conversation/Book layout on
// desktop, a Chat/Book tab switch below the `sm:` breakpoint (E10 dropped the old mandatory-
// landscape gate: portrait now works natively via the tab switch, no rotate prompt needed),
// and a single floating voice orb as the only control surface. State reads only via the orb's
// icon/color + an sr-only live region — no visible status text anywhere (E9).
export function GeminiLiveModal({ open, onClose, book, chapters, chapterIdx, setChapterIdx, chapter: chapterProp, mode = 'chapter' }) {
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
  const [tab, setTab] = useState('chat')
  const providerConfigRef = useRef(null) // { liveModel, liveVoice } — for the voice_sessions record at close
  // onTranscript/onEvent are created fresh every render (below) but only actually invoked from
  // deep inside the live session, well after this render — a ref (not the sessionId state var
  // itself) is what lets them always see the CURRENT session id rather than whatever id was in
  // scope the moment the callback closure was created.
  const sessionIdRef = useRef(null)
  const { user, profile } = useAuthStore()
  const listenerName = (profile?.name || '').trim()

  const { voiceTranscripts, upsertVoiceMessage, clearVoiceTranscript, setVoiceMessageFeedback } = useAdminStore()
  const conversation = sessionId ? (voiceTranscripts[sessionId] || []) : []
  // Gist mode has no chapters array to index into — falls back to the legacy `chapter` prop.
  const chapter = mode === 'gist' ? chapterProp : (chapters?.[chapterIdx] ?? chapterProp ?? null)

  const liveSession = useLiveSession({
    book,
    chapters,
    chapterIdx,
    setChapterIdx,
    mode,
    listenerName,
    onStateChange: (s) => setState(s),
    onTranscript: ({ id, role, text, segments }) => {
      if (sessionIdRef.current && text) upsertVoiceMessage(sessionIdRef.current, { id, role, text, segments })
    },
    onProgress: ({ pct, activeIndex }) => { setProgress(pct); setActiveIndex(activeIndex) },
    onError: (msg) => setError(msg),
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
  const sessionRef = liveSession.sessionRef

  // Friendly countdown shown during a reconnect gap. It's an estimate — the overlay is
  // dismissed the instant the session actually resumes (state → speaking/listening).
  useEffect(() => {
    if (state !== 'reconnecting') return
    setReconnectCountdown(5)
    const iv = setInterval(() => setReconnectCountdown((c) => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(iv)
  }, [state])

  // A session can now end ITSELF (the voice-driven end_session tool, not just the manual X).
  // handleClose() is what actually persists the transcript, clears it, and shows the
  // mandatory rating screen — none of that runs automatically just because the session tore
  // itself down (onStateChange only sets `state`). Route a self-ended session through the
  // same close path a manual click already uses. Safe to call handleClose() here even though
  // it also calls liveSession.end() again — that method no-ops on an already-ended session
  // (every cleanup step is null-guarded). Manual closes never observe this effect firing:
  // handleClose's own setState('idle') runs synchronously right after session.end()'s
  // setState('ended'), so React batches them into one commit and `state` settles at 'idle',
  // never rendering 'ended' at all.
  useEffect(() => {
    if (state !== 'ended') return
    // A successful jump_to_chapter also tears the old session down through this exact same
    // 'ended' transition (see useLiveSession.js's chapterSwitchRef) — without this check that
    // looks identical to the model hanging up, so a chapter jump would incorrectly end the
    // whole Talk session and show the rating screen instead of just reconnecting on the new
    // chapter. Consume the flag immediately so a LATER genuine end isn't also swallowed.
    if (liveSession.chapterSwitchRef.current) {
      liveSession.chapterSwitchRef.current = false
      return
    }
    handleClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    // Fires on open, and on ANY chapter change while the modal is open (manual switch — the
    // seek bar or a future dropdown — or a voice-triggered jump_to_chapter, indistinguishable
    // here by design; see the comment in useLiveSession.js's jump_to_chapter handling).
    if (!open || !book || (mode !== 'gist' && !chapter)) return
    let cancelled = false

    async function connect() {
      setState('connecting')
      setError(null)
      setSessionId(null)
      sessionIdRef.current = null
      setProgress(0)
      setActiveIndex(-1)
      try {
        const config = await liveSession.start()
        if (cancelled || !config) return
        setSessionId(config.sessionId)
        sessionIdRef.current = config.sessionId
        providerConfigRef.current = { liveModel: config.liveModel, liveVoice: config.liveVoice }
        startVoiceSessionRecord({
          sessionId: config.sessionId,
          userId: user?.id,
          bookId: book?.id,
          chapterNumber: mode === 'gist' ? null : chapter?.number,
          mode,
          provider: 'gemini_live',
        })
      } catch (err) {
        if (!cancelled) { setError(err.message); setState('error') }
      }
    }

    connect()
    return () => {
      cancelled = true
      liveSession.end()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, book, chapter, mode])

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
    liveSession.end()
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

  const connected = state === 'speaking' || state === 'listening'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0">
      <div className="relative w-full max-w-3xl bg-background rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col max-h-[90dvh]">

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

        {showRating ? (
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
        <TalkTabs tab={tab} setTab={setTab} />

        {/* Two-panel body — Conversation (45%) + Book (55%) on desktop, tab-switched on mobile */}
        <div className="relative flex flex-col sm:grid sm:grid-cols-[45%_55%] flex-1 min-h-0">
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

          <div className={`${tab === 'book' ? 'hidden' : 'flex'} sm:flex flex-col min-h-0 sm:border-r border-border`}>
            <ConversationPanel
              conversation={conversation}
              sessionId={sessionId}
              setVoiceMessageFeedback={setVoiceMessageFeedback}
              connected={connected}
            />
            {error && (
              <div className="mx-4 mb-3 p-3 rounded-lg bg-error/10 border border-error shrink-0">
                <p className="text-xs text-error">{error}</p>
              </div>
            )}
          </div>

          <div className={`${tab === 'chat' ? 'hidden' : 'flex'} sm:flex flex-col min-h-0`}>
            <BookStage chapter={chapter} blocks={liveSession.blocks} wordIndex={liveSession.wordPtr} />
          </div>
        </div>

        {mode !== 'gist' && chapters?.length > 0 && (
          <BookSeekBar chapters={chapters} chapterIdx={chapterIdx} setChapterIdx={setChapterIdx} wordIndex={liveSession.wordPtr} />
        )}

        <VoiceOrb sessionRef={sessionRef} state={state} className="absolute right-[18px] bottom-[76px]" />
        </>
        )}
      </div>
    </div>
  )
}
