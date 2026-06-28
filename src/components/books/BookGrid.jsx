import { BookCard } from './BookCard'
import { useBookStore } from '../../stores/bookStore'

export function BookGrid({ books }) {
  const narrators = useBookStore((s) => s.narrators)

  if (books.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted">No books found matching your search.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {books.map((book) => {
        const narratorCount = narrators.filter((n) => n.book_ids.includes(book.id)).length
        return (
          <BookCard
            key={book.id}
            book={book}
            narratorCount={narratorCount}
            onlineCount={0}
          />
        )
      })}
    </div>
  )
}
