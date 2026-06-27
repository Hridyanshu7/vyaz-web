import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, User, Star, BookOpen, Calendar } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StarRating } from '../components/ui/StarRating'
import { SEED_BOOKS, SEED_NARRATORS } from '../data/seedBooks'

const MOCK_REVIEWS = [
  { id: 1, reviewer: 'Alex T.', rating: 5, comment: 'Incredibly helpful session. Explained the key concepts from Sapiens in a way that clicked immediately.', date: '2 days ago' },
  { id: 2, reviewer: 'Maya K.', rating: 4, comment: 'Great discussion about Atomic Habits. Would book again.', date: '1 week ago' },
  { id: 3, reviewer: 'Jordan P.', rating: 5, comment: 'Saved me hours of re-reading. Went straight to the parts I needed to understand.', date: '2 weeks ago' },
]

export function NarratorProfile() {
  const { id } = useParams()
  const narrator = SEED_NARRATORS.find((n) => n.id === id)

  if (!narrator) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <p className="text-muted">Narrator not found.</p>
        <Link to="/books" className="text-highlight hover:underline text-sm mt-2 inline-block">Back to books</Link>
      </div>
    )
  }

  const books = SEED_BOOKS.filter((b) => narrator.book_ids.includes(b.id))
  const avgRating = 4.5

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link to="/books" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6">
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="flex items-start gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center shrink-0 border border-border">
          <User size={28} className="text-muted" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{narrator.name}</h1>
          <p className="text-sm text-muted mt-1">{narrator.bio}</p>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1">
              <Star size={14} className="fill-highlight text-highlight" />
              <span className="text-sm font-medium">{avgRating}</span>
              <span className="text-xs text-muted">({MOCK_REVIEWS.length} reviews)</span>
            </div>
            <Badge variant="muted">
              <BookOpen size={12} />
              {books.length} books
            </Badge>
          </div>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3">Books they can discuss</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {books.map((book) => (
            <Link
              key={book.id}
              to={`/book/${book.id}/narrator/${narrator.id}/schedule`}
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-foreground/20 transition-colors"
            >
              <div className="w-10 h-14 rounded bg-surface flex items-center justify-center shrink-0">
                <BookOpen size={16} className="text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{book.title}</p>
                <p className="text-xs text-muted">{book.author}</p>
              </div>
              <Button size="sm" variant="outline">Book</Button>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3">Availability</h2>
        <div className="p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Calendar size={16} />
            <span>Typically available weekday evenings and weekends (IST)</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3">Reviews</h2>
        <div className="space-y-4">
          {MOCK_REVIEWS.map((review) => (
            <div key={review.id} className="p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{review.reviewer}</span>
                  <StarRating rating={review.rating} size={12} />
                </div>
                <span className="text-xs text-muted">{review.date}</span>
              </div>
              <p className="text-sm text-muted">{review.comment}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
