import { useState } from 'react'
import { BookGrid } from '../components/books/BookGrid'
import { BookSearch } from '../components/books/BookSearch'
import { SEED_BOOKS } from '../data/seedBooks'

export function BookBrowse() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGenre, setSelectedGenre] = useState(null)

  const filteredBooks = SEED_BOOKS.filter((book) => {
    const matchesSearch = !searchQuery ||
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesGenre = !selectedGenre || book.genre === selectedGenre
    return matchesSearch && matchesGenre
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-1">Browse Books</h1>
      <p className="text-sm text-muted mb-6">Find a book and connect with someone who knows it inside out.</p>

      <BookSearch
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedGenre={selectedGenre}
        onGenreChange={setSelectedGenre}
      />

      <div className="mt-6">
        <BookGrid books={filteredBooks} />
      </div>
    </div>
  )
}
