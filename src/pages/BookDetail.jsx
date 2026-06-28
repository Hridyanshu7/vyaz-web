import { useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { BookOpen, ArrowLeft, Clock, FileText, Star, Users, Calendar, MessageSquare, Loader2, ChevronDown, ChevronUp, ExternalLink, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StarRating } from '../components/ui/StarRating'
import { NarratorCard } from '../components/narrators/NarratorCard'
import { SEED_BOOKS, SEED_NARRATORS } from '../data/seedBooks'
import { useBookSessions } from '../hooks/useSessions'
import { useAuthStore } from '../stores/authStore'
import { useSignupModal } from '../hooks/useSignupModal'
import { supabase } from '../lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NOISE_GENRES = new Set(['Nonfiction', 'Fiction', 'Audiobook', 'Book Club', 'Novels', 'Buisness', 'Adult', 'School'])

function getTopGenres(gr) {
  if (!gr?.genres) return []
  return gr.genres.filter((g) => !NOISE_GENRES.has(g))
}

export function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const showSignup = useSignupModal((s) => s.show)
  const book = SEED_BOOKS.find((b) => b.id === id)
  const narrators = SEED_NARRATORS.filter((n) => n.book_ids?.includes(id))

  const isUuid = UUID_RE.test(id)
  const { sessions: upcomingSessions } = useBookSessions(isUuid ? id : null)
  const [requestSent, setRequestSent] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [expandedCard, setExpandedCard] = useState(null)
  const sessionsRef = useRef(null)

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
  const topGenres = getTopGenres(gr)
  const description = gr?.description || az?.description || book.description || ''
  const hasNarrators = narrators.length > 0 || upcomingSessions.length > 0
  const firstNarrator = narrators[0]

  const scrollToSessions = () => {
    sessionsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleBookNow = () => {
    if (!user) { showSignup(); return }
    if (firstNarrator) {
      navigate(`/book/${id}/narrator/${firstNarrator.id}/schedule`)
    } else {
      scrollToSessions()
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link to="/books" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6">
        <ArrowLeft size={16} /> Back to books
      </Link>

      {/* ===== SECTION 1: HERO + CTA ===== */}
      <div className="flex gap-6 mb-8">
        <div className="w-[160px] shrink-0">
          <div className="aspect-[3/4] rounded-xl bg-surface flex items-center justify-center border border-border overflow-hidden shadow-sm">
            {book.cover_url ? (
              <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <BookOpen size={40} className="text-muted" />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {topGenres[0] && <Badge>{topGenres[0]}</Badge>}
          </div>

          <h1 className="text-2xl font-bold leading-tight">{book.title}</h1>
          <p className="text-muted mt-1">{book.author}</p>

          {(gr?.averageRating || az?.stars) && (
            <div className="flex items-center gap-4 mt-3">
              {gr?.averageRating && (
                <div className="flex items-center gap-1.5">
                  <StarRating rating={Math.round(gr.averageRating)} size={14} />
                  <span className="font-semibold text-sm">{gr.averageRating}</span>
                  <span className="text-xs text-muted">({gr.ratingsCount?.toLocaleString()})</span>
                  <span className="text-xs text-green-700">Goodreads</span>
                </div>
              )}
              {az?.stars && (
                <div className="flex items-center gap-1.5">
                  <StarRating rating={Math.round(az.stars)} size={14} />
                  <span className="font-semibold text-sm">{az.stars}</span>
                  <span className="text-xs text-muted">({az.reviewsCount?.toLocaleString()})</span>
                  <span className="text-xs text-orange-600">Amazon</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-3 text-sm text-muted">
            {book.page_count && (
              <span className="flex items-center gap-1"><FileText size={14} /> {book.page_count} pages</span>
            )}
            {book.page_count && (
              <span className="flex items-center gap-1"><Clock size={14} /> ~{Math.ceil(book.page_count / 40)} hr read</span>
            )}
          </div>

          {/* Intent 1: Immediate CTA */}
          <div className="flex gap-2 mt-4">
            <Button onClick={handleBookNow}>
              Book a session <ArrowRight size={16} className="ml-1" />
            </Button>
            <Button variant="outline" onClick={scrollToSessions}>
              View narrators
            </Button>
          </div>
        </div>
      </div>

      {/* ===== SECTION 2: CONVINCE (Intent 2) ===== */}
      <div className="mb-8">
        <p
          onClick={() => setDescExpanded(!descExpanded)}
          className={`text-sm leading-relaxed cursor-pointer transition-all hover:line-clamp-none ${descExpanded ? '' : 'line-clamp-4'}`}
        >{description}</p>

        {topGenres.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {topGenres.slice(1).map((g) => (
              <span key={g} className="px-2.5 py-1 rounded-full bg-surface border border-border text-xs text-muted">
                {g}
              </span>
            ))}
          </div>
        )}

        {az?.aiSummary && (
          <div className="mt-6">
            <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">What readers say</p>

            <div className="p-4 rounded-xl bg-surface border border-border mb-4">
              <p className="text-sm leading-relaxed italic text-foreground">"{az.aiSummary}"</p>
              <p className="text-[10px] text-muted mt-2">Based on {az.reviewsCount?.toLocaleString()} reviews</p>
            </div>

            {az.aiKeywords?.length > 0 && (
              <div className="overflow-hidden">
                <div className="flex gap-4 animate-[scroll_30s_linear_infinite] hover:[animation-play-state:paused] w-max">
                  {[...az.aiKeywords, ...az.aiKeywords].map((k, i) => {
                    const isOpen = expandedCard === i
                    return (
                      <div
                        key={i}
                        onClick={() => setExpandedCard(isOpen ? null : i)}
                        className={`group shrink-0 w-[280px] p-4 rounded-xl border border-border bg-background flex flex-col justify-between transition-all duration-200 cursor-pointer
                          hover:shadow-lg hover:border-foreground/20 hover:z-10
                          ${isOpen ? 'h-auto min-h-[130px] shadow-lg border-foreground/20 z-10' : 'h-[130px]'}`}
                      >
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5">{k.name}</p>
                          <p className={`text-xs leading-relaxed text-muted group-hover:line-clamp-none ${isOpen ? '' : 'line-clamp-3'}`}>{k.text}</p>
                        </div>
                        {k.mentionCount && (
                          <p className="text-[10px] text-muted mt-2">
                            {k.mentionCount.total.toLocaleString()} reviewers mentioned this
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapsible details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-muted hover:text-foreground mt-4 cursor-pointer"
        >
          {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showDetails ? 'Hide details' : 'More details'}
        </button>

        {showDetails && (
          <div className="mt-3 p-4 rounded-xl bg-surface border border-border text-xs text-muted space-y-2">
            {book.publisher && <p>Publisher: {book.publisher}</p>}
            {book.pub_date && <p>Published: {book.pub_date}</p>}
            {book.isbn && <p>ISBN: {book.isbn}</p>}
            {book.language && <p>Language: {book.language}</p>}
            {az?.bestsellerRanks?.length > 0 && (
              <div>
                <p className="font-medium text-foreground mb-1">Bestseller Ranks</p>
                {az.bestsellerRanks.map((r, i) => (
                  <p key={i}>#{r.rank.toLocaleString()} in {r.category}</p>
                ))}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              {gr?.url && (
                <a href={gr.url} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline flex items-center gap-1">
                  <ExternalLink size={12} /> Goodreads
                </a>
              )}
              {az?.url && (
                <a href={az.url} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline flex items-center gap-1">
                  <ExternalLink size={12} /> Amazon
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== SECTION 3: NARRATORS + SESSIONS (Intent 2 converts here) ===== */}
      <div ref={sessionsRef} className="border-t border-border pt-8">
        <h2 className="text-xl font-bold mb-1">Talk about this book</h2>
        <p className="text-sm text-muted mb-6">
          {hasNarrators
            ? 'Book a session with someone who knows this book inside out.'
            : 'No narrators available yet — request a session and we\'ll notify you when one is.'}
        </p>

        {/* Upcoming group sessions */}
        {upcomingSessions.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Open group sessions</p>
            <div className="space-y-2">
              {upcomingSessions.map((session) => {
                const attendeeCount = session.attendees?.length || 0
                const alreadyJoined = session.attendees?.some((a) => a.reader_id === user?.id)
                return (
                  <div key={session.id} className="p-4 rounded-xl border border-highlight/20 bg-highlight/5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{session.narrator?.name}</span>
                        <Badge variant="highlight"><Users size={12} /> {attendeeCount}/{session.max_attendees} joined</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span className="flex items-center gap-1"><Calendar size={12} /> {format(new Date(session.scheduled_at), 'EEE, MMM d · h:mm a')}</span>
                        <span className="flex items-center gap-1"><Clock size={12} /> {session.duration_minutes} min</span>
                      </div>
                    </div>
                    {alreadyJoined ? (
                      <Badge variant="success">Joined</Badge>
                    ) : (
                      <Button size="sm" onClick={async () => {
                        if (!user) { showSignup(); return }
                        await supabase.from('session_attendees').insert({
                          session_id: session.id,
                          reader_id: user.id,
                        })
                        window.location.reload()
                      }}>
                        Join session
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Narrators */}
        {narrators.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Available narrators</p>
            <div className="space-y-2">
              {narrators.map((narrator, i) => (
                <NarratorCard
                  key={narrator.id}
                  narrator={narrator}
                  bookId={id}
                  isOnline={i % 2 === 0}
                  rating={4.2 + (i * 0.15)}
                  reviewCount={8 + i * 3}
                />
              ))}
            </div>
          </div>
        )}

        {/* Request a session */}
        {user && isUuid && (
          <div className={`p-5 rounded-xl border flex items-center justify-between
            ${hasNarrators ? 'border-border' : 'border-highlight/30 bg-highlight/5'}`}>
            <div>
              <p className="text-sm font-medium">
                {hasNarrators ? 'Want a different time or narrator?' : 'Be the first to request a session'}
              </p>
              <p className="text-xs text-muted mt-0.5">
                We'll notify narrators who know this book.
              </p>
            </div>
            {requestSent ? (
              <Badge variant="success">Request sent</Badge>
            ) : (
              <Button
                size="sm"
                variant={hasNarrators ? 'outline' : 'primary'}
                disabled={requesting}
                onClick={async () => {
                  setRequesting(true)
                  try {
                    await supabase.from('session_requests').insert({
                      reader_id: user.id,
                      book_id: id,
                    })
                    setRequestSent(true)
                  } catch { /* ignore */ }
                  setRequesting(false)
                }}
              >
                {requesting ? <Loader2 size={14} className="animate-spin" /> : <><MessageSquare size={14} className="mr-1" /> Request session</>}
              </Button>
            )}
          </div>
        )}

      </div>

    </div>
  )
}
