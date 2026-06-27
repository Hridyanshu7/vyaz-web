import { Search } from 'lucide-react'
import { GENRES } from '../../data/seedBooks'

export function BookSearch({ searchQuery, onSearchChange, selectedGenre, onGenreChange }) {
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
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => onGenreChange(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer
            ${!selectedGenre ? 'bg-foreground text-white' : 'bg-surface text-muted hover:text-foreground border border-border'}`}
        >
          All
        </button>
        {GENRES.map((genre) => (
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
    </div>
  )
}
