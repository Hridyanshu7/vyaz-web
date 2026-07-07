import { useState, useEffect, useRef } from 'react'
import { X, Mic, MicOff, Loader2, PhoneOff, CheckCircle2, Circle, Volume2 } from 'lucide-react'
import { getCartesiaSession, VoiceAgentSession } from '../lib/voiceAgent'
import { supabase } from '../lib/supabase'
import { useAdminStore } from '../stores/adminStore'
import { useAuthStore } from '../stores/authStore'
import { startVoiceSessionRecord, endVoiceSessionRecord, submitSessionRating } from '../lib/voiceSessionLog'
import { SessionRatingScreen } from './SessionRatingScreen'

const STATE_LABELS = {
  idle: 'Starting...',
  connecting: 'Connecting...',
  listening: 'Listening',
  speaking: 'Speaking',
  ended: 'Session ended',
}

export function VoiceAgentModal({ open, onClose, book, chapter }) {
  const [agentState, setAgentState] = useState('idle')
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [totalSections, setTotalSections] = useState(0)
  const [completedSections, setCompletedSections] = useState([])
  const [showRating, setShowRating] = useState(false)
  const [rating, setRating] = useState(0)
  const [feedbackText, setFeedbackText] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const sessionRef = useRef(null)
  const bubblesRef = useRef(null)
  const { user } = useAuthStore()

  const { voiceTranscripts, appendVoiceMessage, clearVoiceTranscript } = useAdminStore()
  const conversation = sessionId ? (voiceTranscripts[sessionId] || []) : []

  // Connect voice session
  useEffect(() => {
    if (!open || !book || !chapter) return
    let cancelled = false

    async function connect() {
      setAgentState('idle')
      setMuted(false)
      setError(null)
      setSessionId(null)
      setTotalSections(0)
      setCompletedSections([])

      try {
        const sessionData = await getCartesiaSession(book, chapter)
        if (cancelled) return

        setSessionId(sessionData.sessionId)
        setTotalSections(sessionData.totalSections || 0)
        startVoiceSessionRecord({
          sessionId: sessionData.sessionId,
          userId: user?.id,
          bookId: book?.id,
          chapterNumber: chapter?.number,
          mode: 'chapter',
          provider: 'cartesia',
        })

        const session = new VoiceAgentSession({
          ...sessionData,
          onStateChange: (s) => { if (!cancelled) setAgentState(s) },
          onError: (msg) => { if (!cancelled) setError(msg) },
          onTranscript: ({ role, text }) => {
            if (!cancelled && sessionData.sessionId) {
              appendVoiceMessage(sessionData.sessionId, { role, text, id: Date.now() + Math.random() })
            }
          },
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

  // Auto-scroll bubbles to bottom when new message arrives
  useEffect(() => {
    if (bubblesRef.current) {
      bubblesRef.current.scrollTop = bubblesRef.current.scrollHeight
    }
  }, [conversation])

  // Supabase Realtime: subscribe to progress updates for this session
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`voice_progress:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'voice_progress',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setCompletedSections(payload.new.completed_sections || [])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  const handleClose = () => {
    const hadSession = !!sessionId
    if (sessionId) {
      const turns = useAdminStore.getState().voiceTranscripts[sessionId] || []
      endVoiceSessionRecord({
        sessionId,
        userId: user?.id,
        turns,
        meta: { endReason: error ? 'error' : 'user_ended', completedSections, totalSections },
      })
      clearVoiceTranscript(sessionId)
    }
    sessionRef.current?.end()
    sessionRef.current = null
    setAgentState('idle')
    setMuted(false)
    setError(null)
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

  const toggleMute = () => {
    if (!sessionRef.current) return
    if (muted) { sessionRef.current.unmute(); setMuted(false) }
    else { sessionRef.current.mute(); setMuted(true) }
  }

  if (!open) return null

  const isActive = agentState === 'listening' || agentState === 'speaking'
  const isConnecting = agentState === 'idle' || agentState === 'connecting'
  const isEnded = agentState === 'ended'
  const hasSections = totalSections > 0
  const progressPct = hasSections ? Math.round((completedSections.length / totalSections) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-sm bg-background rounded-2xl border border-border shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-xs text-muted truncate">{book?.title}</p>
            <h2 className="text-sm font-semibold leading-snug mt-0.5">
              Ch {chapter?.number}: {chapter?.title}
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
        {/* Progress bar */}
        {hasSections && (
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-muted">Progress</p>
              <p className="text-xs font-medium">{completedSections.length}/{totalSections} sections</p>
            </div>
            <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-highlight rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Orb */}
        <div className="flex flex-col items-center justify-center py-6 px-6 gap-4">
          <div className="relative flex items-center justify-center">
            {isActive && !muted && (
              <>
                <div className={`absolute w-24 h-24 rounded-full opacity-10 animate-ping ${agentState === 'speaking' ? 'bg-highlight' : 'bg-green-500'}`} />
                <div className={`absolute w-20 h-20 rounded-full opacity-15 animate-pulse ${agentState === 'speaking' ? 'bg-highlight' : 'bg-green-500'}`} />
              </>
            )}
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
              muted ? 'bg-surface border-2 border-border' :
              agentState === 'listening' ? 'bg-green-500/10 border-2 border-green-500' :
              agentState === 'speaking' ? 'bg-highlight/10 border-2 border-highlight' :
              'bg-surface border-2 border-border'
            }`}>
              {isConnecting ? (
                <Loader2 size={24} className="animate-spin text-muted" />
              ) : muted ? (
                <MicOff size={24} className="text-muted" />
              ) : agentState === 'listening' ? (
                <Mic size={24} className="text-green-500" />
              ) : agentState === 'speaking' ? (
                <div className="flex items-end gap-0.5 h-5">
                  {[60, 100, 80, 40].map((h, i) => (
                    <div key={i} className="w-1 bg-highlight rounded-full animate-bounce"
                      style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              ) : isEnded ? (
                <MicOff size={24} className="text-muted" />
              ) : (
                <Mic size={24} className="text-muted" />
              )}
            </div>
          </div>

          {/* Status */}
          <div className="text-center">
            <p className="text-sm font-medium">
              {muted ? 'Muted' : STATE_LABELS[agentState] || agentState}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {muted ? 'Unmute to speak' :
               agentState === 'listening' ? 'Speak naturally — the narrator is listening' :
               agentState === 'speaking' ? 'Interrupt anytime by speaking' :
               isConnecting ? 'Setting up your session...' : ''}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="w-full p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Conversation bubbles */}
        {conversation.length > 0 && (
          <div
            ref={bubblesRef}
            className="mx-4 mb-3 max-h-48 overflow-y-auto space-y-2 scroll-smooth"
          >
            {conversation.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'agent'
                    ? 'bg-surface border border-border text-foreground rounded-tl-sm'
                    : 'bg-highlight/10 border border-highlight/20 text-foreground rounded-tr-sm'
                }`}>
                  {msg.role === 'agent' && (
                    <div className="flex items-center gap-1 mb-0.5 text-[10px] text-muted">
                      <Volume2 size={9} /> Narrator
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Section list */}
        {hasSections && (
          <div className="mx-4 mb-3 rounded-xl border border-border overflow-hidden">
            <div className="px-3 py-2 bg-surface border-b border-border">
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Sections</p>
            </div>
            <div className="max-h-36 overflow-y-auto divide-y divide-border">
              {Array.from({ length: totalSections }, (_, i) => i + 1).map((n) => {
                const done = completedSections.includes(n)
                return (
                  <div key={n} className={`flex items-center gap-2 px-3 py-2 ${done ? 'bg-green-50' : ''}`}>
                    {done
                      ? <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                      : <Circle size={12} className="text-muted shrink-0" />
                    }
                    <span className={`text-xs ${done ? 'text-green-700 line-through' : 'text-muted'}`}>
                      Section {n}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3 px-4 pb-4">
          <button
            onClick={toggleMute}
            disabled={isConnecting || isEnded}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              muted ? 'bg-highlight/10 border-highlight text-highlight' : 'bg-surface border-border hover:bg-background'
            }`}
          >
            {muted ? <MicOff size={14} /> : <Mic size={14} />}
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            onClick={handleClose}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium cursor-pointer transition-colors"
          >
            <PhoneOff size={14} />
            End Session
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
