const SIZES = { sm: 'w-9 h-9', md: 'w-12 h-12', lg: 'w-16 h-16' }

// Small circular author photo straddling a book cover's bottom-right corner, with a
// name tooltip on hover. Renders nothing until the linked author has a photo_url — no
// initials/placeholder.
export function AuthorBadge({ book, size = 'md' }) {
  const author = book.book_authors?.[0]?.author
  if (!author?.photo_url) return null

  return (
    <div className={`group/badge absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 ${SIZES[size]}`}>
      <img
        src={author.photo_url}
        alt={author.name}
        className="w-full h-full rounded-full border-[3px] border-background object-cover shadow-raised"
      />
      <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-raised transition-opacity duration-200 group-hover/badge:opacity-100">
        {author.name}
      </span>
    </div>
  )
}
