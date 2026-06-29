import { Link } from 'react-router-dom'
import { User, Star } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

export function NarratorCard({ narrator, bookId, isOnline = false, rating = null, reviewCount = 0 }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-border">
      <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center shrink-0">
        {narrator.avatar_url ? (
          <img src={narrator.avatar_url} alt={narrator.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          <User size={20} className="text-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link to={`/narrators/${narrator.id}`} className="font-medium text-sm hover:text-highlight transition-colors">
            {narrator.name}
          </Link>
          <Badge variant={isOnline ? 'success' : 'muted'}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
        </div>
        <p className="text-xs text-muted mt-1 line-clamp-2">{narrator.bio}</p>
        {rating && (
          <div className="flex items-center gap-1 mt-1.5">
            <Star size={12} className="fill-highlight text-highlight" />
            <span className="text-xs font-medium">{rating.toFixed(1)}</span>
            <span className="text-xs text-muted">({reviewCount})</span>
          </div>
        )}
      </div>
      <Link to={`/narrators/${narrator.id}`}>
        <Button size="sm" variant="outline">
          View profile
        </Button>
      </Link>
    </div>
  )
}
