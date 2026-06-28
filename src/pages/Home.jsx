import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Users, Calendar, Star, User } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { StarRating } from '../components/ui/StarRating'
import { BookGrid } from '../components/books/BookGrid'
import { BookSearch } from '../components/books/BookSearch'
import { useBookStore } from '../stores/bookStore'
import { useAuthStore } from '../stores/authStore'
import { useSignupModal } from '../hooks/useSignupModal'

export function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGenre, setSelectedGenre] = useState(null)
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const showSignup = useSignupModal((s) => s.show)
  const { books, narrators, loading, getFilteredBooks, getFeaturedBooks } = useBookStore()

  const filteredBooks = getFilteredBooks(searchQuery, selectedGenre)
  const featuredBooks = getFeaturedBooks()
  const founderNarrator = narrators[0]

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <h1 className="text-3xl md:text-5xl font-bold leading-tight max-w-2xl">
            Books are long and lonely. <span className="text-highlight">Conversations aren't.</span>
          </h1>
          <p className="text-muted mt-4 text-lg max-w-xl">
            Skip the reading. Have a narration from someone who understands the next title you're dying to read.
          </p>
          <div className="flex gap-3 mt-8">
            <Button size="lg" onClick={() => user ? navigate('/books') : showSignup()}>
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
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-xl font-bold text-center mb-10">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-highlight/10 flex items-center justify-center mx-auto mb-4">
                <BookOpen size={24} className="text-highlight" />
              </div>
              <h3 className="font-semibold mb-1">Pick a book</h3>
              <p className="text-sm text-muted">Browse our catalog. See ratings, reviews, and what readers say — all in one place.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-highlight/10 flex items-center justify-center mx-auto mb-4">
                <Users size={24} className="text-highlight" />
              </div>
              <h3 className="font-semibold mb-1">Choose a narrator</h3>
              <p className="text-sm text-muted">Find someone who's read the book deeply. Check their ratings, availability, and book a slot that works for you.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-highlight/10 flex items-center justify-center mx-auto mb-4">
                <Calendar size={24} className="text-highlight" />
              </div>
              <h3 className="font-semibold mb-1">Join a 30-min session</h3>
              <p className="text-sm text-muted">Get on a call. Ask questions, discuss ideas, get the gist. A Google Meet link is created automatically.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURED BOOKS ===== */}
      {featuredBooks.length > 0 && (
        <section className="border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-16">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold">Top rated books</h2>
                <p className="text-sm text-muted mt-1">Highest rated on Goodreads, available for narration</p>
              </div>
              <Link to="/books" className="text-sm text-highlight hover:underline flex items-center gap-1">
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
                  {book.goodreads_data?.averageRating && (
                    <div className="flex items-center gap-1 mt-1">
                      <StarRating rating={Math.round(book.goodreads_data.averageRating)} size={10} />
                      <span className="text-xs text-muted">{book.goodreads_data.averageRating}</span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== WHY VYAS ===== */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-xl font-bold text-center mb-10">Why Vyaz?</h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="p-5 rounded-xl border border-border">
              <h3 className="font-semibold text-sm mb-1">Not a summary. A conversation.</h3>
              <p className="text-xs text-muted leading-relaxed">Blinkist gives you bullet points. YouTube gives you a monologue. Vyaz gives you a real person who answers your specific questions.</p>
            </div>
            <div className="p-5 rounded-xl border border-border">
              <h3 className="font-semibold text-sm mb-1">Ask what a book can't answer.</h3>
              <p className="text-xs text-muted leading-relaxed">"How does this apply to my startup?" "Is chapter 7 worth reading?" A narrator adapts to you. A book doesn't.</p>
            </div>
            <div className="p-5 rounded-xl border border-border">
              <h3 className="font-semibold text-sm mb-1">30 minutes, not 30 hours.</h3>
              <p className="text-xs text-muted leading-relaxed">The average nonfiction book takes 6+ hours to read. A Vyaz session gets you the substance in one focused conversation.</p>
            </div>
            <div className="p-5 rounded-xl border border-border">
              <h3 className="font-semibold text-sm mb-1">Decide if it's worth reading.</h3>
              <p className="text-xs text-muted leading-relaxed">Not sure a book is for you? Talk to someone who's read it. You'll know in 30 minutes whether to commit or move on.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== NARRATOR SPOTLIGHT ===== */}
      {founderNarrator && (
        <section className="border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-16">
            <h2 className="text-xl font-bold text-center mb-2">Meet a narrator</h2>
            <p className="text-sm text-muted text-center mb-8">Real people who've read the books and love discussing them</p>
            <div className="max-w-md mx-auto p-6 rounded-xl border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center overflow-hidden">
                  {founderNarrator.avatar_url ? (
                    <img src={founderNarrator.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={20} className="text-muted" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">{founderNarrator.name}</h3>
                  <p className="text-xs text-muted">{founderNarrator.bio}</p>
                </div>
              </div>
              <p className="text-xs text-muted mb-3">Can narrate:</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {founderNarrator.book_ids.map((bookId) => {
                  const book = books.find((b) => b.id === bookId)
                  return book ? (
                    <Link key={bookId} to={`/books/${bookId}`}>
                      <Badge variant="muted" className="hover:text-highlight cursor-pointer">{book.title.split(':')[0]}</Badge>
                    </Link>
                  ) : null
                })}
              </div>
              <Button size="sm" className="w-full" onClick={() => {
                const firstBook = founderNarrator.book_ids[0]
                if (firstBook) navigate(`/book/${firstBook}/narrator/${founderNarrator.id}/schedule`)
              }}>
                Book a session with {founderNarrator.name.split(' ')[0]} <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ===== FULL CATALOG ===== */}
      <section id="browse" className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">Explore all books</h2>
            <p className="text-sm text-muted mt-1">Find a book and connect with someone who knows it inside out</p>
          </div>
        </div>

        <BookSearch
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedGenre={selectedGenre}
          onGenreChange={setSelectedGenre}
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
