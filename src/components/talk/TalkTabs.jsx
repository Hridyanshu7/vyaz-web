// design-language.html §12 — below the sm: (640px) breakpoint the two-panel body collapses
// to a Chat/Book switch instead of the old mandatory-landscape gate (E10). Active tab gets a
// solid --ink pill; inactive stays plain text.
export function TalkTabs({ tab, setTab }) {
  return (
    <div className="flex sm:hidden items-center gap-1 px-3 py-2 border-b border-border shrink-0">
      {[
        { key: 'chat', label: 'Chat' },
        { key: 'book', label: 'Book' },
      ].map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
            tab === t.key ? 'bg-foreground text-background' : 'text-muted hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
