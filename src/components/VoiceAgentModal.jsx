import { useState, useEffect, useRef } from 'react'
import { X, Mic, MicOff, Loader2, PhoneOff } from 'lucide-react'
import { getCartesiaSession, VoiceAgentSession } from '../lib/voiceAgent'

const STATE_LABELS = {
  idle: 'Starting...',
  connecting: 'Connecting...',
  listening: 'Listening',
  speaking: 'Speaking',
  ended: 'Session ended',
}

const STATE_COLORS = {
  listening: 'bg-green-500',
  speaking: 'bg-highlight',
  connecting: 'bg-muted',
  idle: 'bg-muted',
  ended: 'bg-muted',
}

export function VoiceAgentModal({ open, onClose, book, chapter }) {
  const [agentState, setAgentState] = useState('idle')
  const [error, setError] = useState(null)
  const sessionRef = useRef(null)

  useEffect(() => {
    if (!open || !book || !chapter) return

    let cancelled = false

    async function connect() {
      setAgentState('idle')
      setError(null)

      try {
        const sessionData = await getCartesiaSession(book, chapter)
        if (cancelled) return

        const session = new VoiceAgentSession({
          ...sessionData,
          onStateChange: (s) => { if (!cancelled) setAgentState(s) },
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
    sessionRef.current?.end()
    sessionRef.current = null
    setAgentState('idle')
    setError(null)
    onClose()
  }

  if (!open) return null

  const isActive = agentState === 'listening' || agentState === 'speaking'
  const dotColor = STATE_COLORS[agentState] || 'bg-muted'

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
          <button onClick={handleClose} className="p-1 hover:bg-surface rounded-lg cursor-pointer shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Main area */}
        <div className="flex flex-col items-center justify-center py-10 px-6 gap-6">

          {/* Animated orb */}
          <div className="relative flex items-center justify-center">
            {isActive && (
              <>
                <div className={`absolute w-24 h-24 rounded-full ${dotColor} opacity-10 animate-ping`} />
                <div className={`absolute w-20 h-20 rounded-full ${dotColor} opacity-15 animate-pulse`} />
              </>
            )}
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-300 ${
              agentState === 'listening' ? 'bg-green-500/10 border-2 border-green-500' :
              agentState === 'speaking' ? 'bg-highlight/10 border-2 border-highlight' :
              'bg-surface border-2 border-border'
            }`}>
              {agentState === 'connecting' || agentState === 'idle' ? (
                <Loader2 size={24} className="animate-spin text-muted" />
              ) : agentState === 'listening' ? (
                <Mic size={24} className="text-green-500" />
              ) : agentState === 'speaking' ? (
                <div className="flex items-end gap-0.5 h-5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-1 bg-highlight rounded-full animate-bounce"
                      style={{ height: `${[60, 100, 80, 40][i - 1]}%`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              ) : agentState === 'ended' ? (
                <MicOff size={24} className="text-muted" />
              ) : (
                <Mic size={24} className="text-muted" />
              )}
            </div>
          </div>

          {/* Status */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${isActive ? 'animate-pulse' : ''}`} />
              <p className="text-sm font-medium">{STATE_LABELS[agentState] || agentState}</p>
            </div>
            {agentState === 'listening' && (
              <p className="text-xs text-muted mt-1">Speak naturally — the narrator is listening</p>
            )}
            {agentState === 'speaking' && (
              <p className="text-xs text-muted mt-1">Narrator is speaking — you can interrupt anytime</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="w-full p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* End session button */}
        <div className="px-4 pb-4">
          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-surface hover:bg-background text-sm font-medium cursor-pointer transition-colors"
          >
            <PhoneOff size={14} />
            End Session
          </button>
        </div>
      </div>
    </div>
  )
}
