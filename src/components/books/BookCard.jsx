import { Link } from 'react-router-dom'
import { BookOpen, Users } from 'lucide-react'
import { Badge } from '../ui/Badge'

export function BookCard({ book, narratorCount = 0, onlineCount = 0 }) {
  return (
    <Link
      to={`/books/${book.id}`}
      className="group block rounded-xl border border-border bg-background p-4 hover:border-foreground/20 transition-colors"
    >
      <div className="aspect-[3/4] rounded-lg bg-surface flex items-center justify-center mb-3 overflow-hidden">
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
      <div className="flex items-center gap-2 mt-2.5">
        <Badge variant="muted">
          <Users size={12} />
          {narratorCount} narrator{narratorCount !== 1 ? 's' : ''}
        </Badge>
        {onlineCount > 0 && (
          <Badge variant="success">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {onlineCount} online
          </Badge>
        )}
      </div>
    </Link>
  )
}
