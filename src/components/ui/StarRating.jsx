import { Star } from 'lucide-react'

export function StarRating({ rating, max = 5, size = 16, interactive = false, onChange }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onChange?.(i + 1)}
          className={interactive ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star
            size={size}
            className={i < rating ? 'fill-highlight text-highlight' : 'text-border'}
          />
        </button>
      ))}
    </div>
  )
}
