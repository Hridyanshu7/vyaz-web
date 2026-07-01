import { useSearchParams } from 'react-router-dom'
import { BookGrid } from '../components/books/BookGrid'
import { BookSearch } from '../components/books/BookSearch'
import { useBookStore } from '../stores/bookStore'

export function BookBrowse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchQuery = searchParams.get('q') || ''
  const selectedGenre = searchParams.get('genre') || null
  const { loading, getFilteredBooks } = useBookStore()

  const setSearch = (val) => setSearchParams((p) => { val ? p.set('q', val) : p.delete('q'); return p }, { replace: true })
  const setGenre = (val) => setSearchParams((p) => { val ? p.set('genre', val) : p.delete('genre'); return p }, { replace: true })

  const filteredBooks = getFilteredBooks(searchQuery, selectedGenre)

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-1">Browse Books</h1>
      <p className="text-sm text-muted mb-6">Find a book and connect with someone who knows it inside out.</p>

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
    </div>
  )
}
