// Standard WhatsApp click-to-chat green + glyph, not the brand's indigo — like the LIVE
// badge, this is a case where instant recognizability is the entire point of the
// element, so it deliberately breaks from the accent system.
export function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/917999739858"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-floating hover:brightness-105 hover:scale-105 transition-all"
    >
      <svg viewBox="0 0 24 24" width="28" height="28" fill="white" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.87 9.87 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.1c-.24.68-1.19 1.25-1.94 1.41-.51.11-1.18.19-3.43-.74-2.88-1.19-4.74-4.1-4.88-4.29-.14-.19-1.17-1.56-1.17-2.98 0-1.42.74-2.11 1-2.4.26-.29.57-.36.76-.36h.55c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.52 1.9 1.05.94 1.93 1.23 2.21 1.37.28.14.44.12.6-.07.16-.19.68-.79.86-1.06.18-.28.36-.23.6-.14.24.09 1.53.72 1.79.85.26.14.43.2.5.31.06.12.06.68-.18 1.35z" />
      </svg>
    </a>
  )
}
