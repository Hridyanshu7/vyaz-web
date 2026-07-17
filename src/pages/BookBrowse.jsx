import { useSearchParams } from 'react-router-dom'
import { BookGrid } from '../components/books/BookGrid'
import { BookSearch } from '../components/books/BookSearch'
import { useBookStore } from '../stores/bookStore'
import { useScrollDepth } from '../hooks/useScrollDepth'

function pillClass(active) {
  return `shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
    active ? 'bg-foreground text-white' : 'bg-surface text-muted hover:text-foreground border border-border'
  }`
}

export function BookBrowse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchQuery = searchParams.get('q') || ''
  const selectedGenre = searchParams.get('genre') || null
  const sort = searchParams.get('sort') // 'bestsellers' | null — from Explore > Bestsellers
  const by = searchParams.get('by') // 'language' | 'author' | null — from Explore > By language/By Authors
  const selectedLanguage = searchParams.get('language') || null
  const selectedAuthor = searchParams.get('author') || null

  const { loading, getFilteredBooks, getLanguages, getAuthors } = useBookStore()

  useScrollDepth('books_browse')

  const setSearch = (val) => setSearchParams((p) => { val ? p.set('q', val) : p.delete('q'); return p }, { replace: true })
  const setGenre = (val) => setSearchParams((p) => { val ? p.set('genre', val) : p.delete('genre'); return p }, { replace: true })
  const setLanguage = (val) => setSearchParams((p) => { val ? p.set('language', val) : p.delete('language'); return p }, { replace: true })
  const setAuthor = (val) => setSearchParams((p) => { val ? p.set('author', val) : p.delete('author'); return p }, { replace: true })

  const filteredBooks = getFilteredBooks({
    searchQuery,
    genre: selectedGenre,
    language: selectedLanguage,
    author: selectedAuthor,
    sortBestsellers: sort === 'bestsellers',
  })

  const languages = by === 'language' ? getLanguages() : []
  const authors = by === 'author' ? getAuthors() : []

  const heading = sort === 'bestsellers' ? 'Bestsellers'
    : by === 'language' ? 'Browse by language'
    : by === 'author' ? 'Browse by author'
    : 'Browse Books'
  const subtitle = sort === 'bestsellers' ? 'The highest-rated books in the catalog.'
    : by === 'language' ? 'Find books in the language you want to read in.'
    : by === 'author' ? "Pick an author to see everything they've written."
    : 'Search the full catalog — every book here is ready to talk.'

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">{heading}</h1>
      <p className="text-sm text-ink-soft mb-6">{subtitle}</p>

      <BookSearch
        searchQuery={searchQuery}
        onSearchChange={setSearch}
        selectedGenre={selectedGenre}
        onGenreChange={setGenre}
      />

      {by === 'language' && languages.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" onClick={() => setLanguage(null)} className={pillClass(!selectedLanguage)}>All languages</button>
          {languages.map((l) => (
            <button type="button" key={l} onClick={() => setLanguage(l === selectedLanguage ? null : l)} className={pillClass(l === selectedLanguage)}>
              {l}
            </button>
          ))}
        </div>
      )}

      {by === 'author' && authors.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" onClick={() => setAuthor(null)} className={pillClass(!selectedAuthor)}>All authors</button>
          {authors.map((a) => (
            <button type="button" key={a} onClick={() => setAuthor(a === selectedAuthor ? null : a)} className={pillClass(a === selectedAuthor)}>
              {a}
            </button>
          ))}
        </div>
      )}

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
