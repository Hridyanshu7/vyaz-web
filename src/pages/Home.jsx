import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Mic, MessageSquare } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { StarRating } from '../components/ui/StarRating'
import { BookGrid } from '../components/books/BookGrid'
import { BookSearch } from '../components/books/BookSearch'
import { useBookStore } from '../stores/bookStore'
import { useAuthStore } from '../stores/authStore'

export function Home() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchQuery = searchParams.get('q') || ''
  const selectedGenre = searchParams.get('genre') || null
  const setSearch = (val) => setSearchParams((p) => { val ? p.set('q', val) : p.delete('q'); return p }, { replace: true })
  const setGenre = (val) => setSearchParams((p) => { val ? p.set('genre', val) : p.delete('genre'); return p }, { replace: true })
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { loading, getFilteredBooks, getFeaturedBooks } = useBookStore()

  const filteredBooks = getFilteredBooks(searchQuery, selectedGenre)
  const featuredBooks = getFeaturedBooks()

  return (
    <div>
      {/* ===== HERO ===== */}
      {/* The one ambient hero glow the signature gradient is allowed to appear behind
          (design-language.html §5) — blurred, low-opacity, a light source, not a shape. */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-16 w-[820px] h-[520px] rounded-full opacity-30 blur-[90px]"
          style={{ background: 'linear-gradient(135deg, #4A3ECB 0%, #1F9EA8 55%, #F5A623 100%)' }}
        />
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16 relative">
          <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight max-w-2xl">
            Books are long and lonely. <span className="text-highlight">Conversations aren't.</span>
          </h1>
          <p className="text-ink-soft mt-4 text-lg max-w-xl">
            Talk to the book. An AI narrator reads it aloud — word for word — and answers your questions, out loud, as you go.
          </p>
          <div className="flex gap-3 mt-6">
            <Button size="lg" onClick={() => navigate(user ? '/books' : '/login?redirectTo=/books')}>
              Get started <ArrowRight size={18} className="ml-1" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => {
              document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })
            }}>
              How it works
            </Button>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <h2 className="text-xl font-bold text-center mb-8">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent-wash flex items-center justify-center mx-auto mb-4">
                <BookOpen size={24} className="text-highlight" />
              </div>
              <h3 className="font-semibold mb-1">Pick a book</h3>
              <p className="text-sm text-ink-soft">Browse the catalog. See ratings, reviews, and what readers say — all in one place.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent-wash flex items-center justify-center mx-auto mb-4">
                <Mic size={24} className="text-highlight" />
              </div>
              <h3 className="font-semibold mb-1">Press Talk</h3>
              <p className="text-sm text-ink-soft">The AI narrator begins reading the chapter aloud — verbatim, in the author's actual words. No summaries, no slop.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent-wash flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={24} className="text-highlight" />
              </div>
              <h3 className="font-semibold mb-1">Ask anything</h3>
              <p className="text-sm text-ink-soft">Interrupt any time. Ask a question, get an answer grounded in the book — then pick up right where you left off.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURED BOOKS ===== */}
      {featuredBooks.length > 0 && (
        <section className="border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-12">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 mb-6">
              <div>
                <h2 className="text-xl font-bold">Top rated books</h2>
                <p className="text-sm text-ink-soft mt-1">Highest rated on Goodreads — ready to talk to</p>
              </div>
              <Link to="/books" className="text-sm text-highlight hover:underline flex items-center gap-1 shrink-0">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
              {featuredBooks.map((book) => (
                <Link key={book.id} to={`/books/${book.id}`} className="shrink-0 w-[160px] group">
                  <div className="aspect-[3/4] rounded-xl bg-surface border border-border overflow-hidden mb-2 group-hover:border-foreground/20 transition-colors">
                    {book.cover_url ? (
                      <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><BookOpen size={24} className="text-muted" /></div>
                    )}
                  </div>
                  <h3 className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-highlight transition-colors">{book.title}</h3>
                  <p className="text-xs text-muted mt-0.5">{book.author}</p>
                  {book.goodreads_rating && (
                    <div className="flex items-center gap-1 mt-1">
                      <StarRating rating={Math.round(book.goodreads_rating)} size={10} />
                      <span className="text-xs text-muted">{book.goodreads_rating}</span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== WHY VYAZ ===== */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <h2 className="text-xl font-bold text-center mb-8">Why Vyaz?</h2>
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <div className="p-5 rounded-xl border border-border bg-surface shadow-raised">
              <h3 className="font-semibold text-sm mb-1">Not a summary. The real thing.</h3>
              <p className="text-xs text-ink-soft leading-relaxed">Blinkist gives you bullet points. Vyaz reads you the author's actual words — verbatim — and answers your questions along the way.</p>
            </div>
            <div className="p-5 rounded-xl border border-border bg-surface shadow-raised">
              <h3 className="font-semibold text-sm mb-1">Ask what a page can't answer.</h3>
              <p className="text-xs text-ink-soft leading-relaxed">"How does this apply to my startup?" "Is chapter 7 worth it?" The narrator answers, grounded in the book. A page doesn't.</p>
            </div>
            <div className="p-5 rounded-xl border border-border bg-surface shadow-raised">
              <h3 className="font-semibold text-sm mb-1">Listen, don't slog.</h3>
              <p className="text-xs text-ink-soft leading-relaxed">The average nonfiction book takes 6+ hours to read. Listen and ask instead — on your commute, at the gym, hands-free.</p>
            </div>
            <div className="p-5 rounded-xl border border-border bg-surface shadow-raised">
              <h3 className="font-semibold text-sm mb-1">Decide if it's worth reading.</h3>
              <p className="text-xs text-ink-soft leading-relaxed">Not sure a book is for you? Talk to it first. You'll know fast whether to commit or move on.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FULL CATALOG ===== */}
      <section id="browse" className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">Explore all books</h2>
            <p className="text-sm text-ink-soft mt-1">Find a book and talk to it</p>
          </div>
        </div>

        <BookSearch
          searchQuery={searchQuery}
          onSearchChange={setSearch}
          selectedGenre={selectedGenre}
          onGenreChange={setGenre}
        />

        <div className="mt-6">
          {loading ? (
            <div className="text-center py-12 text-muted text-sm">Loading books...</div>
          ) : (
            <BookGrid books={filteredBooks} />
          )}
        </div>
      </section>
    </div>
  )
}
