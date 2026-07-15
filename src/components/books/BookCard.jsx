import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'

export function BookCard({ book }) {
  return (
    <Link
      to={`/books/${book.id}`}
      className="group block rounded-xl border border-border bg-surface p-4 shadow-raised hover:border-border-strong transition-colors"
    >
      <div className="aspect-[3/4] rounded-lg bg-background flex items-center justify-center mb-3 overflow-hidden">
        {book.cover_url ? (
          <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <BookOpen size={32} className="text-muted" />
        )}
      </div>
      <h3 className="font-semibold text-sm leading-tight group-hover:text-highlight transition-colors line-clamp-2">
        {book.title}
      </h3>
      <p className="text-xs text-muted mt-1 truncate">{book.author}</p>
    </Link>
  )
}
