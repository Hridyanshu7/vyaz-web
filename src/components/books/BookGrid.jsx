import { BookCard } from './BookCard'

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
        <BookCard key={book.id} book={book} />
      ))}
    </div>
  )
}
