import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { BookGrid } from '../components/books/BookGrid'
import { BookSearch } from '../components/books/BookSearch'
import { SEED_BOOKS } from '../data/seedBooks'
import { useAuthStore } from '../stores/authStore'

export function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGenre, setSelectedGenre] = useState(null)
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const filteredBooks = SEED_BOOKS.filter((book) => {
    const matchesSearch = !searchQuery ||
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesGenre = !selectedGenre || book.genre === selectedGenre
    return matchesSearch && matchesGenre
  })

  return (
    <div>
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <h1 className="text-3xl md:text-5xl font-bold leading-tight max-w-2xl">
            Talk to someone who's <span className="text-highlight">read the book</span>
          </h1>
          <p className="text-muted mt-4 text-lg max-w-xl">
            Skip the summary. Have a real conversation with someone who deeply understands the book you're curious about.
          </p>
          <div className="flex gap-3 mt-8">
            <Button size="lg" onClick={() => navigate(user ? '/books' : '/login')}>
              Get started <ArrowRight size={18} className="ml-1" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => {
              document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' })
            }}>
              Browse books
            </Button>
          </div>
        </div>
      </section>

      <section id="browse" className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">Explore books</h2>
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
          <BookGrid books={filteredBooks} />
        </div>
      </section>
    </div>
  )
}
