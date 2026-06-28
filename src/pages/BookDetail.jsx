import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { BookOpen, ArrowLeft, Clock, FileText, Star, ShoppingCart, ExternalLink, Users, Calendar, MessageSquare, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StarRating } from '../components/ui/StarRating'
import { NarratorCard } from '../components/narrators/NarratorCard'
import { SEED_BOOKS, SEED_NARRATORS } from '../data/seedBooks'
import { useBookSessions } from '../hooks/useSessions'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const book = SEED_BOOKS.find((b) => b.id === id)
  const narrators = SEED_NARRATORS.filter((n) => n.book_ids?.includes(id))

  const isUuid = UUID_RE.test(id)
  const { sessions: upcomingSessions } = useBookSessions(isUuid ? id : null)
  const [requestSent, setRequestSent] = useState(false)
  const [requesting, setRequesting] = useState(false)

  const az = book?.amazon_data
  const gr = book?.goodreads_data
  const hasEnrichedData = az || gr

  if (!book) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <p className="text-muted">Book not found.</p>
        <Link to="/books" className="text-highlight hover:underline text-sm mt-2 inline-block">Back to browse</Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <Link to="/books" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6">
        <ArrowLeft size={16} /> Back to books
      </Link>

      {/* Hero */}
      <div className="grid md:grid-cols-[240px_1fr] gap-8 mb-8">
        <div>
          <div className="aspect-[3/4] rounded-xl bg-surface flex items-center justify-center border border-border overflow-hidden">
            {book.cover_url ? (
              <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <BookOpen size={48} className="text-muted" />
            )}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {book.genre && <Badge>{book.genre}</Badge>}
            {gr?.genres?.filter((g) => g !== book.genre).slice(0, 3).map((g) => (
              <Badge key={g} variant="muted">{g}</Badge>
            ))}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold">{book.title}</h1>
          <p className="text-muted mt-1 text-lg">{book.author}</p>

          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-muted">
            {book.page_count && (
              <span className="flex items-center gap-1"><FileText size={14} /> {book.page_count} pages</span>
            )}
            {book.page_count && (
              <span className="flex items-center gap-1"><Clock size={14} /> ~{Math.ceil(book.page_count / 40)} hr read</span>
            )}
            {book.isbn && <span className="text-xs">ISBN: {book.isbn}</span>}
            {book.publisher && <span className="text-xs">· {book.publisher}</span>}
            {book.language && <span className="text-xs">· {book.language}</span>}
          </div>

          {(gr?.averageRating || az?.stars) && (
            <div className="flex flex-wrap gap-4 mt-4 p-3 bg-surface rounded-lg border border-border">
              {gr?.averageRating && (
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-green-600" />
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-lg">{gr.averageRating}</span>
                      <StarRating rating={Math.round(gr.averageRating)} size={14} />
                    </div>
                    <p className="text-xs text-muted">{gr.ratingsCount?.toLocaleString()} ratings on Goodreads</p>
                  </div>
                </div>
              )}
              {az?.stars && (
                <div className="flex items-center gap-2">
                  <ShoppingCart size={16} className="text-orange-500" />
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-lg">{az.stars}</span>
                      <StarRating rating={Math.round(az.stars)} size={14} />
                    </div>
                    <p className="text-xs text-muted">{az.reviewsCount?.toLocaleString()} reviews on Amazon</p>
                  </div>
                </div>
              )}
              {az?.price && (
                <div className="ml-auto text-right">
                  <p className="font-bold text-lg">{az.price}</p>
                  {az.listPrice && <p className="text-xs text-muted line-through">{az.listPrice}</p>}
                </div>
              )}
            </div>
          )}

          <p className="mt-4 text-sm leading-relaxed">{book.description}</p>

          <div className="flex gap-2 mt-4">
            {gr?.url && (
              <a href={gr.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline">
                <ExternalLink size={12} /> View on Goodreads
              </a>
            )}
            {az?.url && (
              <a href={az.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline">
                <ExternalLink size={12} /> View on Amazon
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Upcoming group sessions (only for UUID book IDs from Supabase) */}
      {upcomingSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">
            Upcoming sessions <span className="text-muted font-normal">({upcomingSessions.length})</span>
          </h2>
          <div className="space-y-3">
            {upcomingSessions.map((session) => {
              const attendeeCount = session.attendees?.length || 0
              const seatsLeft = session.max_attendees - attendeeCount
              const isFull = seatsLeft <= 0
              const alreadyJoined = session.attendees?.some((a) => a.reader_id === user?.id)
              return (
                <div key={session.id} className="p-4 rounded-xl border border-border flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{session.narrator?.name}</span>
                      <Badge variant={session.type === 'group' ? 'highlight' : 'muted'}>
                        {session.type === 'group' ? <><Users size={12} /> Group</> : '1:1'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {format(new Date(session.scheduled_at), 'EEE, MMM d · h:mm a')}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {session.duration_minutes} min</span>
                      {session.type === 'group' && (
                        <span className="flex items-center gap-1"><Users size={12} /> {attendeeCount}/{session.max_attendees}</span>
                      )}
                    </div>
                  </div>
                  {alreadyJoined ? (
                    <Badge variant="success">Joined</Badge>
                  ) : isFull ? (
                    <Badge variant="muted">Full</Badge>
                  ) : (
                    <Button size="sm" onClick={async () => {
                      if (!user) { navigate('/login'); return }
                      await supabase.from('session_attendees').insert({
                        session_id: session.id,
                        reader_id: user.id,
                      })
                      window.location.reload()
                    }}>
                      Join
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Request a session */}
      {user && isUuid && (
        <div className="mb-8 p-4 rounded-xl border border-dashed border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Want to discuss this book?</p>
            <p className="text-xs text-muted">Request a session and narrators will be notified.</p>
          </div>
          {requestSent ? (
            <Badge variant="success">Request sent</Badge>
          ) : (
            <Button size="sm" variant="outline" disabled={requesting} onClick={async () => {
              setRequesting(true)
              try {
                await supabase.from('session_requests').insert({
                  reader_id: user.id,
                  book_id: id,
                })
                setRequestSent(true)
              } catch { /* ignore */ }
              setRequesting(false)
            }}>
              {requesting ? <Loader2 size={14} className="animate-spin" /> : <><MessageSquare size={14} className="mr-1" /> Request session</>}
            </Button>
          )}
        </div>
      )}

      {/* Narrators section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Narrators <span className="text-muted font-normal">({narrators.length})</span>
          </h2>
        </div>

        {narrators.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <p className="text-muted text-sm">No narrators available for this book yet.</p>
            <p className="text-xs text-muted mt-1">Know this book well? Become a narrator.</p>
          </div>
        ) : (
          <div className="space-y-3">
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
        )}
      </div>
    </div>
  )
}
