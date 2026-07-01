import { useState, useEffect, useRef } from 'react'
import { X, Mic, Loader2, PhoneOff, SkipForward, Volume2, CheckCircle2, Circle } from 'lucide-react'
import { getVoicePipelineSession, VoicePipelineSession } from '../lib/voicePipeline'
import { supabase } from '../lib/supabase'
import { useAdminStore } from '../stores/adminStore'

const STATE_LABELS = {
  idle: 'Starting...',
  narrating: 'Narrating',
  paused: 'Paused',
  asking: 'Listening...',
  answering: 'Answering',
  done: 'Chapter complete',
  ended: 'Session ended',
}

export function VoicePipelineModal({ open, onClose, book, chapter }) {
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [totalSections, setTotalSections] = useState(0)
  const [completedSections, setCompletedSections] = useState([])
  const sessionRef = useRef(null)
  const bubblesRef = useRef(null)

  const { voiceTranscripts, appendVoiceMessage, clearVoiceTranscript } = useAdminStore()
  const conversation = sessionId ? (voiceTranscripts[sessionId] || []) : []

  useEffect(() => {
    if (bubblesRef.current) bubblesRef.current.scrollTop = bubblesRef.current.scrollHeight
  }, [conversation])

  useEffect(() => {
    if (!open || !book || !chapter) return
    let cancelled = false

    async function connect() {
      setState('idle')
      setError(null)
      setSessionId(null)
      setCompletedSections([])

      try {
        const config = await getVoicePipelineSession(book, chapter)
        if (cancelled) return

        setSessionId(config.sessionId)
        setTotalSections(config.totalSections)

        const session = new VoicePipelineSession({
          ...config,
          onStateChange: (s) => { if (!cancelled) setState(s) },
          onTranscript: ({ role, text }) => {
            if (!cancelled && config.sessionId) {
              appendVoiceMessage(config.sessionId, { role, text, id: Date.now() + Math.random() })
            }
          },
          onSectionComplete: async (sectionNumber) => {
            if (cancelled) return
            setCompletedSections((prev) => [...prev, sectionNumber])
            // Update voice_progress in DB
            const { data: existing } = await supabase.from('voice_progress')
              .select('completed_sections').eq('session_id', config.sessionId).single()
            if (existing) {
              const updated = [...new Set([...(existing.completed_sections || []), sectionNumber])]
              await supabase.from('voice_progress').update({ completed_sections: updated })
                .eq('session_id', config.sessionId)
            }
          },
          onError: (msg) => { if (!cancelled) setError(msg) },
        })

        sessionRef.current = session
        await session.start()
      } catch (err) {
        if (!cancelled) setError(err.message)
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

  const hasSections = totalSections > 0
  const progressPct = hasSections ? Math.round((completedSections.length / totalSections) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-sm bg-background rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-xs text-muted truncate">{book?.title}</p>
            <h2 className="text-sm font-semibold leading-snug mt-0.5">
              Ch {chapter?.number}: {chapter?.title}
            </h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-surface rounded-lg cursor-pointer shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        {hasSections && (
          <div className="px-4 pt-3 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-muted">Progress</p>
              <p className="text-xs font-medium">{completedSections.length}/{totalSections} sections</p>
            </div>
            <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-highlight rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {/* State indicator */}
        <div className="px-4 pt-3 shrink-0">
          <div className="flex items-center gap-2">
            {state === 'narrating' && <Volume2 size={12} className="text-highlight animate-pulse" />}
            {state === 'asking' && <Mic size={12} className="text-red-500 animate-pulse" />}
            {state === 'answering' && <Volume2 size={12} className="text-green-500 animate-pulse" />}
            {(state === 'idle' || state === 'paused') && <div className="w-3 h-3" />}
            <p className="text-xs text-muted">{STATE_LABELS[state] || state}</p>
          </div>
        </div>

        {/* Conversation bubbles */}
        {conversation.length > 0 && (
          <div ref={bubblesRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
            {conversation.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'agent'
                    ? 'bg-surface border border-border rounded-tl-sm'
                    : 'bg-highlight/10 border border-highlight/20 rounded-tr-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
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
          {state === 'narrating' && (
            <div className="flex gap-2">
              <button
                onClick={() => { sessionRef.current?.stopAudio(); setState('paused') }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-surface hover:bg-background text-sm font-medium cursor-pointer"
              >
                Ask a Question
              </button>
              <button
                onClick={() => sessionRef.current?.continueNarration()}
                className="px-3 py-2.5 rounded-xl border border-border bg-surface hover:bg-background cursor-pointer"
                title="Skip section"
              >
                <SkipForward size={14} />
              </button>
            </div>
          )}

          {state === 'paused' && (
            <div className="flex gap-2">
              <button
                onClick={() => sessionRef.current?.startRecording()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-highlight/30 bg-highlight/5 text-highlight text-sm font-medium cursor-pointer"
              >
                <Mic size={14} /> Ask a Question
              </button>
              <button
                onClick={() => sessionRef.current?.continueNarration()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-surface hover:bg-background text-sm font-medium cursor-pointer"
              >
                ▶ Continue
              </button>
            </div>
          )}

          {state === 'asking' && (
            <button
              onClick={() => sessionRef.current?.stopRecordingAndAnswer()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-300 bg-red-50 text-red-700 text-sm font-medium cursor-pointer"
            >
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording... Tap to Send
            </button>
          )}

          {state === 'answering' && (
            <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-surface text-sm text-muted">
              <Volume2 size={14} className="animate-pulse" /> Answering...
            </div>
          )}

          {(state === 'idle' || state === 'done' || state === 'ended') && (
            <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-surface text-sm text-muted">
              {state === 'idle' ? <><Loader2 size={14} className="animate-spin" /> Starting...</> :
               state === 'done' ? '✓ Chapter complete' : 'Session ended'}
            </div>
          )}

          {/* End session always visible */}
          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 py-2 mt-2 rounded-xl text-xs text-muted hover:text-foreground cursor-pointer"
          >
            <PhoneOff size={12} /> End Session
          </button>
        </div>
      </div>
    </div>
  )
}
