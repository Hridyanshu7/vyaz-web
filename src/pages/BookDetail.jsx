import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { BookOpen, ArrowLeft, FileText, ExternalLink, BookMarked, Mic, Loader2 } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StarRating } from '../components/ui/StarRating'
import { useBookStore } from '../stores/bookStore'
import { VoiceAgentModal } from '../components/VoiceAgentModal'
import { VoicePipelineModal } from '../components/VoicePipelineModal'
import { GeminiLiveModal } from '../components/GeminiLiveModal'
import { useAdminDataStore } from '../stores/adminDataStore'

function getTopGenres(book) {
  if (book.genres?.length > 0) return book.genres
  return book.goodreads_data?.genres || []
}

export function BookDetail() {
  const { id } = useParams()
  const { getBook, fetchBookChapters } = useBookStore()
  const book = getBook(id)
  const [chaptersLoading, setChaptersLoading] = useState(false)

  // Chapters are lazy-loaded (grid stays light) — pull this book's chapters on open.
  useEffect(() => {
    if (!book || book.chapters) return
    setChaptersLoading(true)
    fetchBookChapters(id).finally(() => setChaptersLoading(false))
  }, [id, book, fetchBookChapters])

  const [descExpanded, setDescExpanded] = useState(false)
  const [expandedCard, setExpandedCard] = useState(null)
  const [voiceChapter, setVoiceChapter] = useState(null)

  // Provider precedence: admin settings → public scoped read → gemini_live default.
  const adminVoiceProvider = useAdminDataStore((s) => s.platformSettings.voice_provider)
  const publicVoiceProvider = useBookStore((s) => s.voiceProvider)
  const voiceProvider = adminVoiceProvider || publicVoiceProvider || 'gemini_live'

  if (!book) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <p className="text-muted">Book not found.</p>
        <Link to="/books" className="text-highlight hover:underline text-sm mt-2 inline-block">Back to browse</Link>
      </div>
    )
  }

  const az = book.amazon_data
  const gr = book.goodreads_data
  const topGenres = getTopGenres(book)
  const description = book.description || gr?.description || az?.description || ''
  const chapters = book.chapters || []

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Link to="/books" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6">
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="grid md:grid-cols-[300px_1fr] gap-6">

        {/* ===== LEFT COLUMN ===== */}
        <div>
          {/* Cover */}
          <div className="aspect-[3/4] rounded-xl bg-surface flex items-center justify-center border border-border overflow-hidden shadow-sm mb-4">
            {book.cover_url ? (
              <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <BookOpen size={48} className="text-muted" />
            )}
          </div>

          {/* Title + Author */}
          <h1 className="text-xl font-bold leading-tight">{book.title}</h1>
          <p className="text-sm text-muted mt-0.5">{book.author}</p>

          {/* Genres */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {topGenres.slice(0, 4).map((g) => (
              <Badge key={g} variant="muted">{g}</Badge>
            ))}
          </div>

          {/* Ratings */}
          <div className="mt-3 space-y-1.5">
            {book.goodreads_rating && (
              <div className="flex items-center gap-1.5">
                <StarRating rating={Math.round(book.goodreads_rating)} size={12} />
                <span className="text-xs font-semibold">{book.goodreads_rating}</span>
                <span className="text-[10px] text-muted">({book.goodreads_ratings_count?.toLocaleString()})</span>
                <span className="text-[10px] text-green-700">Goodreads</span>
              </div>
            )}
            {book.amazon_rating && (
              <div className="flex items-center gap-1.5">
                <StarRating rating={Math.round(book.amazon_rating)} size={12} />
                <span className="text-xs font-semibold">{book.amazon_rating}</span>
                <span className="text-[10px] text-muted">({book.amazon_reviews_count?.toLocaleString()})</span>
                <span className="text-[10px] text-orange-600">Amazon</span>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="mt-3 text-xs text-muted space-y-0.5">
            {book.page_count && <p className="flex items-center gap-1"><FileText size={12} /> {book.page_count} pages · ~{Math.ceil(book.page_count / 40)} hr read</p>}
            {book.isbn && <p>ISBN: {book.isbn}</p>}
          </div>

          {/* External links */}
          <div className="flex gap-3 mt-3">
            {gr?.url && (
              <a href={gr.url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700 hover:underline flex items-center gap-1">
                <ExternalLink size={10} /> Goodreads
              </a>
            )}
            {az?.url && (
              <a href={az.url} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:underline flex items-center gap-1">
                <ExternalLink size={10} /> Amazon
              </a>
            )}
          </div>

          {/* Book Gist (AI) button removed pending Gemini billing — feature code retained
              (voice-session mode:'gist', GeminiLiveModal gist mode, live_gist_prompt). See
              DECISIONS A13 / action plan item 36 to re-enable. */}

          {/* Summary */}
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted mb-2">Summary</p>
            <p
              onClick={() => setDescExpanded(!descExpanded)}
              className={`text-xs leading-relaxed cursor-pointer transition-all hover:line-clamp-none ${descExpanded ? '' : 'line-clamp-8'}`}
            >{description}</p>
          </div>

          {/* AI Review Summary */}
          {az?.aiSummary && (
            <div className="mt-4 p-3 rounded-lg bg-surface border border-border">
              <p className="text-xs font-medium uppercase tracking-wider text-muted mb-1">What readers say</p>
              <p className="text-xs leading-relaxed italic">"{az.aiSummary}"</p>
              <p className="text-[10px] text-muted mt-1">{book.amazon_reviews_count?.toLocaleString()} reviews</p>
            </div>
          )}

          {/* Review cards */}
          {az?.aiKeywords?.length > 0 && (
            <div className="mt-4 space-y-2">
              {az.aiKeywords.slice(0, 4).map((k, i) => (
                <div
                  key={i}
                  onClick={() => setExpandedCard(expandedCard === i ? null : i)}
                  className="p-2.5 rounded-lg border border-border cursor-pointer hover:border-foreground/20 transition-colors"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider">{k.name}</p>
                    {k.mentionCount && <p className="text-[10px] text-muted">{k.mentionCount.total.toLocaleString()}</p>}
                  </div>
                  <p className={`text-xs text-muted leading-relaxed ${expandedCard === i ? '' : 'line-clamp-2'}`}>{k.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== RIGHT COLUMN ===== */}
        <div>
          {/* CHAPTERS */}
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted mb-3">Chapters</p>
            {chapters.length > 0 ? (
              <div className="space-y-2">
                {chapters.map((ch, i) => {
                  const estimatedPages = ch.content
                    ? Math.ceil(ch.content.split(/\s+/).length / 250)
                    : null
                  return (
                    <div key={i} className="border border-border rounded-xl p-3">
                      <div className="flex items-start gap-3">
                        {/* S. No. */}
                        <span className="text-xs text-muted font-mono mt-0.5 w-5 shrink-0">
                          {String(ch.number ?? i + 1).padStart(2, '0')}
                        </span>
                        {/* Title + oneliner */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{ch.title}</p>
                          {ch.oneliner && (
                            <p className="text-xs text-muted mt-0.5 leading-relaxed">{ch.oneliner}</p>
                          )}
                        </div>
                        {/* Pages */}
                        {estimatedPages && (
                          <span className="text-[10px] text-muted shrink-0 mt-0.5 whitespace-nowrap">~{estimatedPages} pp</span>
                        )}
                      </div>
                      {/* Section titles */}
                      {ch.sections?.some((s) => s.title) && (
                        <div className="pl-8 mt-1.5 space-y-0.5">
                          {ch.sections.filter((s) => s.title).map((s) => (
                            <p key={s.number} className="text-[10px] text-muted">
                              <span className="text-muted/50 mr-1">{s.number}.</span>{s.title}
                            </p>
                          ))}
                        </div>
                      )}
                      {/* Talk CTA */}
                      <div className="flex items-center gap-2 mt-2.5 pl-8">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setVoiceChapter(ch) }}
                          className="flex items-center gap-1"
                        >
                          <Mic size={11} /> Talk
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : chaptersLoading ? (
              <div className="text-center py-10 border border-dashed border-border rounded-xl">
                <Loader2 size={24} className="mx-auto text-muted mb-2 animate-spin" />
                <p className="text-sm text-muted">Loading chapters…</p>
              </div>
            ) : (
              <div className="text-center py-10 border border-dashed border-border rounded-xl">
                <BookMarked size={24} className="mx-auto text-muted mb-2" />
                <p className="text-sm text-muted">Chapter details coming soon.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {voiceProvider === 'gemini_live' ? (
        <GeminiLiveModal
          open={!!voiceChapter}
          onClose={() => setVoiceChapter(null)}
          book={book}
          chapter={voiceChapter}
        />
      ) : voiceProvider === 'pipeline' ? (
        <VoicePipelineModal
          open={!!voiceChapter}
          onClose={() => setVoiceChapter(null)}
          book={book}
          chapter={voiceChapter}
        />
      ) : (
        <VoiceAgentModal
          open={!!voiceChapter}
          onClose={() => setVoiceChapter(null)}
          book={book}
          chapter={voiceChapter}
        />
      )}
    </div>
  )
}
