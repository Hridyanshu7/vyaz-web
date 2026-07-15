// The व seal mark — the one static symbol allowed the signature gradient as a
// decorative fill (design-language.html §3/§5). Reserved for actual brand-identity
// moments (nav, auth), not general "book" iconography elsewhere in the app.
export function Logo({ size = 34, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-lg font-bold text-white shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.56,
        background: 'linear-gradient(135deg, #4A3ECB 0%, #1F9EA8 55%, #F5A623 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)',
      }}
    >
      व
    </span>
  )
}
