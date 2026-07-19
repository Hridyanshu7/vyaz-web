import { useEffect, useState } from 'react'
import { Mic, Loader2 } from 'lucide-react'

// design-language.html §12 — no visible text label anywhere (E9): state reads only via
// aria-label on the button plus this sr-only live-region announcement.
const STATE_ANNOUNCE = {
  idle: 'Starting session',
  connecting: 'Connecting',
  speaking: 'Narrator speaking. Tap to interrupt.',
  listening: 'Listening — tap to check in',
  reconnecting: 'Reconnecting',
  ended: 'Session ended',
  error: 'Something went wrong',
}

const BARS = 4

function WaveBars({ level }) {
  return (
    <div className="flex items-end justify-center gap-[3px] h-4">
      {Array.from({ length: BARS }).map((_, i) => {
        const center = 1 - Math.abs(i - (BARS - 1) / 2) / (BARS / 2)
        const h = 5 + level * 12 * center * (0.6 + Math.random() * 0.4)
        return (
          <div
            key={i}
            className="w-[3px] rounded-full bg-current [animation:wave-pulse_1.1s_ease-in-out_infinite]"
            style={{ height: `${Math.max(5, h)}px`, animationDelay: `${i * 90}ms` }}
          />
        )
      })}
    </div>
  )
}

// The one control surface for a live Talk session (design-language.html §12) — 52px circle,
// idle glyph is a mic, speaking/listening show a small live waveform instead. Tapping while
// the narrator is speaking interrupts it (GeminiLiveSession#interrupt — stops audio instantly,
// same as a real server-driven barge-in); tapping while listening/idle nudges the model to
// check in, via the same sendTextContext channel already used for table/visual context (no
// new wire surface). Both taps are no-ops without a live session (sessionRef.current null).
export function VoiceOrb({ sessionRef, state, className = '' }) {
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

  const tappable = state === 'speaking' || state === 'listening'

  const tap = () => {
    if (!tappable) return
    const s = sessionRef.current
    if (!s) return
    if (state === 'speaking') {
      s.interrupt()
    } else {
      s.sendTextContext(
        '[The listener just tapped in to check in — briefly ask if they\'re following along or have a question, then continue.]'
      )
    }
  }

  const stateStyles = {
    idle: 'bg-surface border-border-strong text-muted',
    connecting: 'bg-surface border-border-strong text-muted',
    reconnecting: 'bg-surface border-border-strong text-muted',
    ended: 'bg-surface border-border-strong text-muted',
    error: 'bg-surface border-border-strong text-muted',
    speaking: 'bg-highlight border-transparent text-white shadow-glow',
    listening: 'bg-success border-transparent text-white shadow-[0_0_0_4px_rgba(27,147,88,.16)]',
  }[state] || 'bg-surface border-border-strong text-muted'

  return (
    <button
      onClick={tap}
      aria-label={STATE_ANNOUNCE[state] || state}
      disabled={!tappable}
      className={[
        'shrink-0 w-[52px] h-[52px] rounded-full border-2 flex items-center justify-center transition-colors duration-200',
        tappable ? 'cursor-pointer' : 'cursor-default',
        stateStyles,
        className,
      ].join(' ')}
    >
      {state === 'speaking' || state === 'listening' ? (
        <WaveBars level={level} />
      ) : state === 'connecting' || state === 'reconnecting' ? (
        <Loader2 size={20} className="animate-spin" />
      ) : (
        <Mic size={20} />
      )}
      <span className="sr-only" aria-live="polite">{STATE_ANNOUNCE[state] || state}</span>
    </button>
  )
}
