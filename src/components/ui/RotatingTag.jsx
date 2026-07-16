import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// "Live" is a deliberate override of the brand's own accent — the red dot/pill is the
// YouTube/Instagram/Twitch broadcast convention, used on purpose because familiarity beats
// house style here. It's a different red from the reserved --color-seal token, not that one
// reactivated. "On-demand" and "hands-free" don't have their own color convention the way
// live=red does, so both stay in the same on-brand accent-wash — a rotating slot cycling
// through three different hues read like a traffic light, not a considered set. They're
// told apart by icon only: a clock (deliberately not a play triangle — that glyph reads as
// passive/podcast, wrong message for this product) and a headphone glyph, chosen over a
// wave-bar icon for being the more universally recognizable "hands-free/audio" shorthand.
const TAGS = [
  {
    key: 'live',
    className: 'bg-[#FDE4E4] text-[#DC2626] uppercase',
    content: (
      <>
        <span className="w-[7px] h-[7px] rounded-full bg-[#DC2626] shrink-0 animate-[blink_1.4s_ease-in-out_infinite] motion-reduce:animate-none" />
        live
      </>
    ),
  },
  {
    key: 'on-demand',
    className: 'bg-accent-wash text-highlight-hover',
    content: (
      <>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        on-demand
      </>
    ),
  },
  {
    key: 'hands-free',
    className: 'bg-accent-wash text-highlight-hover',
    content: (
      <>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path d="M3 14v-2a9 9 0 0 1 18 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="1" y="14" width="6" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
          <rect x="17" y="14" width="6" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
        </svg>
        hands-free
      </>
    ),
  },
]

export function RotatingTag() {
  const [index, setIndex] = useState(0)
  const [width, setWidth] = useState(null)
  const refs = useRef([])

  // Lock the slot to the widest tag's width so the rest of the sentence never reflows
  // mid-cycle. useLayoutEffect (not useEffect) so this is measured before first paint.
  useLayoutEffect(() => {
    setWidth(Math.max(...refs.current.map((el) => el?.offsetWidth || 0)))
  }, [])

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % TAGS.length), 1800)
    return () => clearInterval(id)
  }, [])

  return (
    <span
      className="relative inline-block h-[1.55em] overflow-hidden align-middle"
      style={width ? { width } : undefined}
    >
      {TAGS.map((tag, i) => {
        const state = i === index ? 'active' : i === (index + 1) % TAGS.length ? 'next' : 'prev'
        const translateY = state === 'active' ? '0' : state === 'next' ? '100%' : '-100%'
        return (
          <span
            key={tag.key}
            ref={(el) => (refs.current[i] = el)}
            className={`rotating-tag-pill absolute left-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap font-extrabold text-[0.78em] py-[0.22em] pr-[0.68em] pl-[0.56em] rounded-full tracking-wide ${tag.className}`}
            style={{
              transform: `translateY(${translateY})`,
              opacity: state === 'active' ? 1 : 0,
              // Inline, not Tailwind utility classes: transition-[...]/duration-[...]/ease-[...]
              // each bundle their own default duration into the same rule, and cascade order
              // between separate utilities silently picked the wrong one — collapsed a 450ms
              // slide down to a near-instant snap. Inline style has no such ordering ambiguity.
              transition: 'transform 450ms cubic-bezier(.22,.9,.32,1), opacity 350ms ease',
            }}
          >
            {tag.content}
          </span>
        )
      })}
    </span>
  )
}
