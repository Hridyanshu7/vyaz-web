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

export function VoiceAgentModal({ open, onClose, book, chapter }) {
  const [agentState, setAgentState] = useState('idle')
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState(null)
  const sessionRef = useRef(null)

  useEffect(() => {
    if (!open || !book || !chapter) return
    let cancelled = false

    async function connect() {
      setAgentState('idle')
      setMuted(false)
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
    setMuted(false)
    setError(null)
    onClose()
  }

  const toggleMute = () => {
    if (!sessionRef.current) return
    if (muted) {
      sessionRef.current.unmute()
      setMuted(false)
    } else {
      sessionRef.current.mute()
      setMuted(true)
    }
  }

  if (!open) return null

  const isActive = agentState === 'listening' || agentState === 'speaking'
  const isConnecting = agentState === 'idle' || agentState === 'connecting'
  const isEnded = agentState === 'ended'

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

        {/* Orb */}
        <div className="flex flex-col items-center justify-center py-10 px-6 gap-5">
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

        {/* Controls */}
        <div className="flex items-center gap-3 px-4 pb-5">
          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            disabled={isConnecting || isEnded}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              muted
                ? 'bg-highlight/10 border-highlight text-highlight'
                : 'bg-surface border-border hover:bg-background'
            }`}
          >
            {muted ? <MicOff size={14} /> : <Mic size={14} />}
            {muted ? 'Unmute' : 'Mute'}
          </button>

          {/* End session */}
          <button
            onClick={handleClose}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium cursor-pointer transition-colors"
          >
            <PhoneOff size={14} />
            End Session
          </button>
        </div>
      </div>
    </div>
  )
}
