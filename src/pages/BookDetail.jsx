import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, ArrowLeft, FileText, Clock, ExternalLink, BookMarked, Mic, Loader2 } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { StarRating } from '../components/ui/StarRating'
import { AuthorBadge } from '../components/books/AuthorBadge'
import { useBookStore } from '../stores/bookStore'
import { useAuthStore } from '../stores/authStore'
import { GeminiLiveModal } from '../components/GeminiLiveModal'
import { track } from '../lib/analytics'

function getTopGenres(book) {
  if (book.genres?.length > 0) return book.genres
  return book.goodreads_data?.genres || []
}

const TABS = [
  { key: 'chapters', label: 'Chapters' },
  { key: 'overview', label: 'Overview' },
]

export function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { getBook, fetchBookChapters } = useBookStore()
  const book = getBook(id)
  const [chaptersLoading, setChaptersLoading] = useState(false)

  // Chapters are lazy-loaded (grid stays light) — pull this book's chapters on open.
  useEffect(() => {
    if (!book || book.chapters) return
    setChaptersLoading(true)
    fetchBookChapters(id).finally(() => setChaptersLoading(false))
  }, [id, book, fetchBookChapters])

  const [activeTab, setActiveTab] = useState('chapters')
  const [descExpanded, setDescExpanded] = useState(false)
  const [expandedCard, setExpandedCard] = useState(null)
  // Tracked as an INDEX into book.chapters, not the chapter object itself — jump_to_chapter
  // (voice-triggered chapter switching) needs a setter it can call with a resolved index,
  // the same shape block-lab's TalkLayout/useLiveSession already use.
  const [voiceChapterIdx, setVoiceChapterIdx] = useState(null)
  const voiceChapter = voiceChapterIdx != null ? (book?.chapters || [])[voiceChapterIdx] ?? null : null

  // A signed-out Talk click routes through /login (?redirectTo=/books/:id?talkChapter=N) —
  // once chapters are loaded, auto-reopen Talk on that exact chapter instead of leaving the
  // user to find + click it again, then strip the param so it doesn't re-fire on refresh.
  useEffect(() => {
    const chNum = searchParams.get('talkChapter')
    if (!chNum || !book?.chapters?.length) return
    const idx = book.chapters.findIndex((c) => String(c.number) === chNum)
    if (idx !== -1) setVoiceChapterIdx(idx)
    setSearchParams((p) => { p.delete('talkChapter'); return p }, { replace: true })
  }, [searchParams, book?.chapters, setSearchParams])

  const handleTalk = (e, ch) => {
    e.stopPropagation()
    track('chapter_talk_started', {
      book_id: id,
      book_title: book.title,
      chapter_number: ch.number,
      chapter_title: ch.title,
      signed_in: !!user,
    })
    if (!user) {
      const target = `/books/${id}?talkChapter=${ch.number}`
      navigate(`/login?redirectTo=${encodeURIComponent(target)}`)
      return
    }
    const idx = (book.chapters || []).findIndex((c) => c.number === ch.number)
    setVoiceChapterIdx(idx !== -1 ? idx : null)
  }

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
  const readHours = book.page_count ? Math.ceil(book.page_count / 40) : null

  // Book Gist (AI) button removed pending Gemini billing — feature code retained
  // (voice-session mode:'gist', GeminiLiveModal gist mode, live_gist_prompt). See
  // DECISIONS A13 / action plan item 36 to re-enable.

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <Link to="/books" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors mb-5">
        <ArrowLeft size={16} /> Back
      </Link>

      {/* ===== HERO ===== */}
      <div className="rounded-2xl border border-border bg-surface shadow-raised p-5 sm:p-6 grid sm:grid-cols-[220px_1fr] gap-6">
        <div className="relative">
          <div className="aspect-[3/4] rounded-xl bg-background flex items-center justify-center border border-border overflow-hidden">
            {book.cover_url ? (
              <img src={book.cover_url} alt={book.title} className="w-full h-full object-contain" />
            ) : (
              <BookOpen size={40} className="text-muted" />
            )}
          </div>
          <AuthorBadge book={book} size="lg" />
        </div>

        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{book.title}</h1>
          <p className="text-sm text-ink-soft mt-1">By {book.author}</p>

          <hr className="border-border my-4" />

          {topGenres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topGenres.slice(0, 4).map((g) => (
                <Badge key={g} variant="muted">{g}</Badge>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-1.5">
            {book.goodreads_rating && (
              <div className="flex items-center gap-1.5">
                <StarRating rating={Math.round(book.goodreads_rating)} size={13} />
                <span className="text-xs font-semibold">{book.goodreads_rating}</span>
                <span className="text-xs font-mono text-muted">({book.goodreads_ratings_count?.toLocaleString()})</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted">Goodreads</span>
              </div>
            )}
            {book.amazon_rating && (
              <div className="flex items-center gap-1.5">
                <StarRating rating={Math.round(book.amazon_rating)} size={13} />
                <span className="text-xs font-semibold">{book.amazon_rating}</span>
                <span className="text-xs font-mono text-muted">({book.amazon_reviews_count?.toLocaleString()})</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted">Amazon</span>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-1.5 text-sm text-ink-soft">
            {book.page_count && (
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-muted shrink-0" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted w-12 shrink-0">Pages</span>
                {book.page_count}
              </div>
            )}
            {readHours && (
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-muted shrink-0" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted w-12 shrink-0">Read</span>
                ~{readHours} hr
              </div>
            )}
          </div>

          {(gr?.url || az?.url) && (
            <div className="flex gap-4 mt-4">
              {gr?.url && (
                <a href={gr.url} target="_blank" rel="noopener noreferrer" className="text-xs text-highlight-hover hover:underline flex items-center gap-1">
                  <ExternalLink size={11} /> Goodreads
                </a>
              )}
              {az?.url && (
                <a href={az.url} target="_blank" rel="noopener noreferrer" className="text-xs text-highlight-hover hover:underline flex items-center gap-1">
                  <ExternalLink size={11} /> Amazon
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="mt-6 rounded-2xl border border-border bg-surface shadow-raised overflow-hidden">
        <div className="flex gap-6 px-5 sm:px-6 border-b border-border overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap py-3.5 text-[11px] font-mono uppercase tracking-wider border-b-2 -mb-px cursor-pointer transition-colors ${
                activeTab === t.key
                  ? 'text-foreground border-foreground font-medium'
                  : 'text-muted border-transparent hover:text-ink-soft'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6 max-h-[60vh] overflow-y-auto">

          {/* ---- Chapters ---- */}
          {activeTab === 'chapters' && (
            chapters.length > 0 ? (
              <div className="space-y-2.5">
                {chapters.map((ch, i) => {
                  const estimatedPages = ch.content
                    ? Math.ceil(ch.content.split(/\s+/).length / 250)
                    : null
                  return (
                    <div
                      key={i}
                      className="group rounded-xl border border-border bg-background p-3.5 transition-all hover:border-border-strong hover:shadow-floating"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-8 h-8 rounded-lg bg-accent-wash flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-mono font-semibold text-highlight-hover">
                            {String(ch.number ?? i + 1).padStart(2, '0')}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold leading-snug">{ch.title}</p>
                            <button
                              type="button"
                              onClick={(e) => handleTalk(e, ch)}
                              aria-label={`Talk about chapter ${ch.number ?? i + 1}: ${ch.title}`}
                              className="flex items-center justify-center w-11 h-11 rounded-full shrink-0 border border-border-strong bg-transparent text-muted cursor-pointer
                                transition-colors duration-200 hover:border-highlight hover:text-highlight
                                focus-visible:border-highlight focus-visible:text-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight/40"
                            >
                              <Mic size={18} />
                            </button>
                          </div>
                          {ch.oneliner && (
                            <p className="text-xs text-ink-soft mt-1 leading-relaxed">{ch.oneliner}</p>
                          )}
                          {estimatedPages && (
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted mt-2">~{estimatedPages} pages</p>
                          )}
                          {ch.sections?.some((s) => s.title) && (
                            <div className="mt-2.5 pl-3 border-l-2 border-border space-y-1">
                              {ch.sections.filter((s) => s.title).map((s) => (
                                <p key={s.number} className="text-[10px] text-muted">
                                  <span className="text-muted/60 mr-1">{s.number}.</span>{s.title}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
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
            )
          )}

          {/* ---- Overview (Summary + What readers say) ---- */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-highlight-hover mb-2.5">Summary</p>
                {description ? (
                  <div className="max-w-[68ch]">
                    <p className={`text-sm leading-relaxed text-ink-soft ${descExpanded ? '' : 'line-clamp-8'}`}>
                      {description}
                    </p>
                    {description.length > 400 && (
                      <button
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="text-xs text-highlight-hover hover:underline mt-2 cursor-pointer"
                      >
                        {descExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No summary available yet.</p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-highlight-hover mb-2.5">What readers say</p>
                {az?.aiSummary || az?.aiKeywords?.length > 0 ? (
                  <div>
                    {az?.aiSummary && (
                      <div className="border-l-2 border-border-strong pl-4 mb-6">
                        <p className="text-sm leading-relaxed italic">"{az.aiSummary}"</p>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-muted mt-2">
                          {book.amazon_reviews_count?.toLocaleString()} reviews
                        </p>
                      </div>
                    )}
                    {az?.aiKeywords?.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {az.aiKeywords.slice(0, 4).map((k, i) => (
                          <div
                            key={i}
                            onClick={() => setExpandedCard(expandedCard === i ? null : i)}
                            className="p-3 rounded-lg border border-border cursor-pointer hover:border-border-strong transition-colors"
                          >
                            <div className="flex items-center justify-between mb-1 gap-1">
                              <p className="text-xs font-medium">{k.name}</p>
                              {k.mentionCount && <p className="text-[10px] font-mono text-muted shrink-0">{k.mentionCount.total.toLocaleString()}</p>}
                            </div>
                            <p className={`text-xs text-ink-soft leading-relaxed ${expandedCard === i ? '' : 'line-clamp-3'}`}>{k.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No reader insights yet.</p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      <GeminiLiveModal
        open={voiceChapterIdx != null}
        onClose={() => setVoiceChapterIdx(null)}
        book={book}
        chapters={book.chapters || []}
        chapterIdx={voiceChapterIdx}
        setChapterIdx={setVoiceChapterIdx}
        chapter={voiceChapter}
      />
    </div>
  )
}
