import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { track } from '../../lib/analytics'
import { AuthorBadge } from './AuthorBadge'

export function BookCard({ book }) {
  return (
    <Link
      to={`/books/${book.id}`}
      onClick={() => track('book_selected', { book_id: book.id, title: book.title, source: 'browse_grid' })}
      className="group block rounded-xl border border-border bg-surface p-4 shadow-raised hover:border-border-strong transition-colors"
    >
      <div className="relative mb-3">
        <div className="aspect-[3/4] rounded-lg bg-background flex items-center justify-center overflow-hidden">
          {book.cover_url ? (
            <img src={book.cover_url} alt={book.title} className="w-full h-full object-contain" />
          ) : (
            <BookOpen size={32} className="text-muted" />
          )}
        </div>
        <AuthorBadge book={book} size="md" />
      </div>
      <h3 className="font-semibold text-sm leading-tight group-hover:text-highlight transition-colors line-clamp-2">
        {book.title}
      </h3>
      <p className="text-xs text-muted mt-1 truncate">{book.author}</p>
    </Link>
  )
}
