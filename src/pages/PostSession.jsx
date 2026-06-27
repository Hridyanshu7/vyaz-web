import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { StarRating } from '../components/ui/StarRating'

export function PostSession() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <Check size={28} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold mb-1">Thanks for your review!</h2>
        <p className="text-sm text-muted mb-6">Your feedback helps other readers find great narrators.</p>
        <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6 cursor-pointer">
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <h1 className="text-xl font-bold mb-1">How was your session?</h1>
      <p className="text-sm text-muted mb-8">Your review helps narrators improve and readers choose wisely.</p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-3">Rating</label>
          <StarRating rating={rating} size={32} interactive onChange={setRating} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Comments (optional)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What stood out? What could be better?"
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm
              placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight resize-none"
          />
        </div>

        <Button
          className="w-full"
          disabled={rating === 0}
          onClick={() => setSubmitted(true)}
        >
          Submit review
        </Button>
      </div>
    </div>
  )
}
