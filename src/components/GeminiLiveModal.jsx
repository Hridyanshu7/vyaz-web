import { useState, useEffect, useRef } from 'react'
import { X, Mic, Loader2, PhoneOff, Volume2, Radio } from 'lucide-react'
import { getGeminiLiveSession, GeminiLiveSession } from '../lib/geminiLive'
import { useAdminStore } from '../stores/adminStore'

const STATE_LABELS = {
  idle: 'Starting…',
  connecting: 'Connecting…',
  speaking: 'Narrator speaking',
  listening: 'Listening — just speak',
  ended: 'Session ended',
  error: 'Error',
}

export function GeminiLiveModal({ open, onClose, book, chapter }) {
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [progress, setProgress] = useState(0)
  const sessionRef = useRef(null)
  const bubblesRef = useRef(null)

  const { voiceTranscripts, upsertVoiceMessage, clearVoiceTranscript } = useAdminStore()
  const conversation = sessionId ? (voiceTranscripts[sessionId] || []) : []

  useEffect(() => {
    if (bubblesRef.current) bubblesRef.current.scrollTop = bubblesRef.current.scrollHeight
  }, [conversation])

  useEffect(() => {
    if (!open || !book || !chapter) return
    let cancelled = false

    async function connect() {
      setState('connecting')
      setError(null)
      setSessionId(null)
      setProgress(0)
      try {
        const config = await getGeminiLiveSession(book, chapter)
        if (cancelled) return
        setSessionId(config.sessionId)

        const session = new GeminiLiveSession({
          ...config,
          onStateChange: (s) => { if (!cancelled) setState(s) },
          onTranscript: ({ id, role, text }) => {
            if (!cancelled && config.sessionId && text) {
              upsertVoiceMessage(config.sessionId, { id, role, text })
            }
          },
          onProgress: (pct) => { if (!cancelled) setProgress(pct) },
          onError: (msg) => { if (!cancelled) setError(msg) },
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
  }, [open, book, chapter])

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
      <div className="w-full max-w-sm bg-background rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-1.5">
              <Radio size={11} className="text-highlight" />
              <p className="text-[10px] text-highlight font-medium uppercase tracking-wide">Live · Full-duplex</p>
            </div>
            <p className="text-xs text-muted truncate mt-1">{book?.title}</p>
            <h2 className="text-sm font-semibold leading-snug mt-0.5">
              Ch {chapter?.number}: {chapter?.title}
            </h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-surface rounded-lg cursor-pointer shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-3 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-muted">Chapter progress</p>
            <p className="text-xs font-medium">{progress}%</p>
          </div>
          <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
            <div className="h-full bg-highlight rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* State indicator */}
        <div className="px-4 pt-3 shrink-0">
          <div className="flex items-center gap-2">
            {state === 'speaking' && <Volume2 size={12} className="text-highlight animate-pulse" />}
            {state === 'listening' && <Mic size={12} className="text-green-500 animate-pulse" />}
            {(state === 'connecting' || state === 'idle') && <Loader2 size={12} className="animate-spin text-muted" />}
            {(state === 'ended' || state === 'error') && <div className="w-3 h-3" />}
            <p className="text-xs text-muted">{STATE_LABELS[state] || state}</p>
          </div>
        </div>

        {/* Conversation bubbles */}
        {conversation.length > 0 && (
          <div ref={bubblesRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {conversation.map((msg) => (
              <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-muted px-1">{msg.role === 'agent' ? 'Narrator' : 'You'}</span>
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'agent'
                    ? 'bg-surface border border-border rounded-tl-none text-foreground'
                    : 'bg-highlight text-white rounded-tr-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {conversation.length === 0 && state !== 'error' && (
          <div className="flex-1 flex items-center justify-center px-6 py-8 min-h-[120px]">
            <p className="text-xs text-muted text-center leading-relaxed">
              The narrator will begin shortly.<br />Just speak anytime to ask a question — no buttons needed.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 p-3 rounded-lg bg-red-50 border border-red-200 shrink-0">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-surface hover:bg-background text-sm font-medium cursor-pointer"
          >
            <PhoneOff size={14} /> End Session
          </button>
        </div>
      </div>
    </div>
  )
}
