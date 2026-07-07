import { Star, Loader2 } from 'lucide-react'

// Shared post-session rating screen — rendered in place of a voice modal's body once the
// user ends a session. Stars are mandatory (Submit stays disabled until one is picked);
// the text field is always shown but optional. Identical across all three voice providers.
export function SessionRatingScreen({ rating, setRating, feedbackText, setFeedbackText, onSubmit, submitting }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-5 text-center">
      <div>
        <p className="text-sm font-semibold">Rate this session</p>
        <p className="text-xs text-muted mt-1">Your feedback helps us improve the narrator.</p>
      </div>

      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className="p-1 cursor-pointer"
          >
            <Star
              size={28}
              className={n <= rating ? 'fill-highlight text-highlight' : 'text-muted/40'}
            />
          </button>
        ))}
      </div>

      <div className="w-full max-w-sm text-left">
        <label className="block text-xs text-muted mb-1.5">Anything to share? (optional)</label>
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          rows={3}
          placeholder="Issues, compliments, anything at all…"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
        />
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!rating || submitting}
        className="w-full max-w-sm flex items-center justify-center gap-2 py-2.5 rounded-xl bg-highlight text-white text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </div>
  )
}
