import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useBookStore } from '../../stores/bookStore'

export function BookSearch({ searchQuery, onSearchChange, selectedGenre, onGenreChange }) {
  const genres = useBookStore((s) => s.genres)
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // The pills row scrolls (overflow-x-auto below) but gave no visual hint that it does —
  // the last pill just clipped mid-word at the edge. Fade gradients make the affordance
  // visible, only appearing on whichever side still has more to scroll to.
  const updateFades = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    updateFades()
    window.addEventListener('resize', updateFades)
    return () => window.removeEventListener('resize', updateFades)
  }, [genres])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          placeholder="Search by title or author..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm
            placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
        />
      </div>
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={updateFades}
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
        >
          <button
            onClick={() => onGenreChange(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer
              ${!selectedGenre ? 'bg-foreground text-white' : 'bg-surface text-muted hover:text-foreground border border-border'}`}
          >
            All
          </button>
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => onGenreChange(genre === selectedGenre ? null : genre)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer
                ${genre === selectedGenre ? 'bg-foreground text-white' : 'bg-surface text-muted hover:text-foreground border border-border'}`}
            >
              {genre}
            </button>
          ))}
        </div>
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-1 w-6 bg-gradient-to-r from-background to-transparent" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-6 bg-gradient-to-l from-background to-transparent" />
        )}
      </div>
    </div>
  )
}
