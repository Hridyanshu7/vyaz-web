import { useState, useEffect, useRef } from 'react'
import { X, Mic, Loader2, PhoneOff, Volume2, Radio, CheckCircle2, Circle } from 'lucide-react'
import { getGeminiLiveSession, GeminiLiveSession } from '../lib/geminiLive'
import { useAdminStore } from '../stores/adminStore'
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
    state === 'speaking' ? 'bg-highlight' : state === 'listening' ? 'bg-green-500' : 'bg-border'
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
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [reconnectCountdown, setReconnectCountdown] = useState(0)
  const sessionRef = useRef(null)
  const bubblesRef = useRef(null)
  const stickToBottomRef = useRef(true)

  const { voiceTranscripts, upsertVoiceMessage, clearVoiceTranscript } = useAdminStore()
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
    if (!open || !book || (mode !== 'gist' && !chapter)) return
    let cancelled = false

    async function connect() {
      setState('connecting')
      setError(null)
      setSessionId(null)
      setProgress(0)
      setActiveIndex(-1)
      try {
        const config = await getGeminiLiveSession(book, chapter, { mode })
        if (cancelled) return
        setSessionId(config.sessionId)

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
  }, [open, book, chapter, mode])

  const handleClose = () => {
    if (sessionId) clearVoiceTranscript(sessionId)
    sessionRef.current?.end()
    sessionRef.current = null
    setState('idle')
    setError(null)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-3xl bg-background rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

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
          <button onClick={handleClose} className="p-1 hover:bg-surface rounded-lg cursor-pointer shrink-0">
            <X size={16} />
          </button>
        </div>

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
              <div className="mx-4 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 shrink-0">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
          </div>

          {/* Right column — controls (30%) */}
          <div className="flex flex-col min-h-0 sm:w-[30%] shrink-0 border-t sm:border-t-0 border-border">

            {/* Waveform + state */}
            <div className="px-4 pt-4 shrink-0">
              <Waveform sessionRef={sessionRef} state={state} />
              <div className="flex items-center justify-center gap-2 mt-1">
                {state === 'speaking' && <Volume2 size={12} className="text-highlight animate-pulse" />}
                {state === 'listening' && <Mic size={12} className="text-green-500 animate-pulse" />}
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
                        {status === 'done' && <CheckCircle2 size={12} className="text-green-500 shrink-0 mt-0.5" />}
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
      </div>
    </div>
  )
}
