import { BookCard } from './BookCard'
import { SEED_NARRATORS } from '../../data/seedBooks'

function getNarratorCount(bookId) {
  return SEED_NARRATORS.filter((n) => n.book_ids.includes(bookId)).length
}

function getOnlineCount(bookId) {
  const narrators = SEED_NARRATORS.filter((n) => n.book_ids.includes(bookId))
  return Math.min(narrators.length, Math.floor(Math.random() * (narrators.length + 1)))
}

export function BookGrid({ books }) {
  if (books.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted">No books found matching your search.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          narratorCount={getNarratorCount(book.id)}
          onlineCount={getOnlineCount(book.id)}
        />
      ))}
    </div>
  )
}
