import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, BookOpen, Loader2, Check, AlertCircle, Info, Star, ShoppingCart } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { importBookFromUrl } from '../lib/bookImport'
import { SEED_BOOKS } from '../data/seedBooks'

export function AddBook() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [book, setBook] = useState(null)
  const [added, setAdded] = useState(false)

  const handleImport = async (e) => {
    e.preventDefault()
    if (!url.trim()) return

    setLoading(true)
    setError('')
    setBook(null)
    setStatus('Parsing URL...')

    try {
      const result = await importBookFromUrl(url, setStatus)
      setBook(result)
      setStatus('')
    } catch (err) {
      setError(err.message)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    if (!book) return
    const { _partial, amazon, goodreads, ...basics } = book
    const newBook = {
      ...basics,
      amazon_data: amazon || null,
      goodreads_data: goodreads || null,
      id: String(SEED_BOOKS.length + 1 + Math.floor(Math.random() * 1000)),
    }
    SEED_BOOKS.push(newBook)
    setAdded(true)
  }

  const az = book?.amazon
  const gr = book?.goodreads

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-1">Add a book</h1>
      <p className="text-sm text-muted mb-6">
        Paste an Amazon or Goodreads link — we'll pull data from both platforms automatically.
      </p>

      <form onSubmit={handleImport} className="space-y-3">
        <div className="relative">
          <Link2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="url"
            placeholder="https://amazon.in/dp/... or https://goodreads.com/book/show/..."
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(''); setBook(null); setAdded(false) }}
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-sm
              placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
          />
        </div>
        <Button className="w-full" disabled={loading || !url.trim()}>
          {loading ? (
            <><Loader2 size={16} className="mr-2 animate-spin" /> {status || 'Fetching...'}</>
          ) : (
            'Import book'
          )}
        </Button>
      </form>

      {error && (
        <div className="mt-4 flex items-start gap-2 bg-highlight/10 text-highlight text-sm px-4 py-3 rounded-lg">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {book && (
        <div className="mt-6 space-y-4">
          {book._partial && (
            <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-sm px-4 py-3 rounded-lg">
              <Info size={16} className="mt-0.5 shrink-0" />
              Auto-fetch returned limited data — edit details below before adding.
            </div>
          )}

          {/* Book header */}
          <div className="border border-border rounded-xl p-4">
            <div className="flex gap-4">
              <div className="w-24 h-36 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0 overflow-hidden">
                {book.cover_url ? (
                  <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                ) : null}
                <div className={`items-center justify-center ${book.cover_url ? 'hidden' : 'flex'} w-full h-full`}>
                  <BookOpen size={24} className="text-muted" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg leading-tight">{book.title || 'Untitled'}</h3>
                <p className="text-sm text-muted mt-0.5">{book.author || 'Unknown author'}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {book.genre && <Badge>{book.genre}</Badge>}
                  {gr?.genres?.slice(0, 3).map((g) => <Badge key={g} variant="muted">{g}</Badge>)}
                  {book.page_count && <Badge variant="muted">{book.page_count} pages</Badge>}
                  {book.isbn && <Badge variant="muted">{book.isbn}</Badge>}
                </div>
                {/* Ratings comparison */}
                <div className="flex gap-4 mt-3">
                  {gr?.averageRating && (
                    <div className="flex items-center gap-1 text-xs">
                      <BookOpen size={12} className="text-green-600" />
                      <span className="font-medium">{gr.averageRating}</span>
                      <span className="text-muted">({gr.ratingsCount?.toLocaleString()} on Goodreads)</span>
                    </div>
                  )}
                  {az?.stars && (
                    <div className="flex items-center gap-1 text-xs">
                      <ShoppingCart size={12} className="text-orange-500" />
                      <span className="font-medium">{az.stars}</span>
                      <span className="text-muted">({az.reviewsCount?.toLocaleString()} on Amazon)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Side-by-side platform data */}
          {(az || gr) && (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Goodreads section */}
              <div className={`border rounded-xl overflow-hidden ${gr ? 'border-green-200' : 'border-border'}`}>
                <div className="px-4 py-2.5 bg-green-50 border-b border-green-200 flex items-center gap-2">
                  <BookOpen size={14} className="text-green-700" />
                  <span className="text-xs font-semibold text-green-800">Goodreads</span>
                  {!gr && <span className="text-xs text-green-600 ml-auto">Not found</span>}
                </div>
                {gr ? (
                  <div className="p-4 space-y-3 text-sm">
                    {gr.description && <p className="text-muted line-clamp-4">{gr.description}</p>}
                    {gr.publishedAt && <p className="text-xs text-muted">Published: {gr.publishedAt}</p>}
                    {gr.series && <p className="text-xs text-muted">Series: {gr.series}</p>}
                    {gr.awards?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {gr.awards.slice(0, 3).map((a, i) => <Badge key={i} variant="highlight">{a}</Badge>)}
                      </div>
                    )}
                    {gr.ratingsDistribution && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Rating distribution</p>
                        {Object.entries(gr.ratingsDistribution).reverse().map(([stars, count]) => (
                          <div key={stars} className="flex items-center gap-2 text-xs">
                            <span className="w-3 text-right">{stars}</span>
                            <Star size={10} className="text-highlight fill-highlight" />
                            <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                              <div className="h-full bg-highlight rounded-full"
                                style={{ width: `${(count / Math.max(gr.ratingsCount, 1)) * 100}%` }} />
                            </div>
                            <span className="text-muted w-12 text-right">{count?.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {gr.reviews?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-2">Top reviews</p>
                        {gr.reviews.slice(0, 2).map((r, i) => (
                          <div key={i} className="mb-2 p-2 bg-surface rounded-lg">
                            <div className="flex items-center gap-1 text-xs mb-1">
                              <span className="font-medium">{r.reviewer}</span>
                              <span className="text-muted">· {r.rating}/5</span>
                            </div>
                            <p className="text-xs text-muted line-clamp-3">{r.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-xs text-muted">No Goodreads data available.</div>
                )}
              </div>

              {/* Amazon section */}
              <div className={`border rounded-xl overflow-hidden ${az ? 'border-orange-200' : 'border-border'}`}>
                <div className="px-4 py-2.5 bg-orange-50 border-b border-orange-200 flex items-center gap-2">
                  <ShoppingCart size={14} className="text-orange-700" />
                  <span className="text-xs font-semibold text-orange-800">Amazon</span>
                  {!az && <span className="text-xs text-orange-600 ml-auto">Not found</span>}
                </div>
                {az ? (
                  <div className="p-4 space-y-3 text-sm">
                    {az.aiSummary && (
                      <div className="p-2.5 bg-orange-50/50 rounded-lg">
                        <p className="text-xs font-medium mb-1">AI Review Summary</p>
                        <p className="text-xs text-muted">{az.aiSummary}</p>
                      </div>
                    )}
                    {az.description && <p className="text-muted line-clamp-4">{az.description}</p>}
                    {az.price && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{az.price}</span>
                        {az.listPrice && <span className="text-xs text-muted line-through">{az.listPrice}</span>}
                        {az.inStockText && <span className="text-xs text-green-600">{az.inStockText}</span>}
                      </div>
                    )}
                    {az.starsBreakdown && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Ratings</p>
                        {Object.entries(az.starsBreakdown).reverse().map(([label, pct]) => (
                          <div key={label} className="flex items-center gap-2 text-xs">
                            <span className="w-8 text-right text-muted">{label}</span>
                            <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                              <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct * 100}%` }} />
                            </div>
                            <span className="text-muted w-8 text-right">{Math.round(pct * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {az.publisher && <span>Publisher: {az.publisher}</span>}
                      {az.pubDate && <span>Published: {az.pubDate}</span>}
                      {az.language && <span>Language: {az.language}</span>}
                      {az.edition && <span>Edition: {az.edition}</span>}
                      {az.asin && <span>ASIN: {az.asin}</span>}
                      {az.isbn13 && <span>ISBN-13: {az.isbn13}</span>}
                    </div>
                    {az.bestsellerRanks?.length > 0 && (
                      <div className="text-xs text-muted">
                        <p className="font-medium text-foreground mb-1">Bestseller Ranks</p>
                        {az.bestsellerRanks.map((r, i) => (
                          <p key={i}>#{r.rank.toLocaleString()} in {r.category}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-xs text-muted">No Amazon data available.</div>
                )}
              </div>
            </div>
          )}

          {/* Editable fields */}
          <div className="border border-border rounded-xl p-4 space-y-2">
            <p className="text-xs text-muted font-medium mb-2">Edit before adding</p>
            <EditableField label="Title" value={book.title} onChange={(v) => setBook({ ...book, title: v })} />
            <EditableField label="Author" value={book.author} onChange={(v) => setBook({ ...book, author: v })} />
            <EditableField label="Genre" value={book.genre} onChange={(v) => setBook({ ...book, genre: v })} />
            <EditableField label="Pages" value={book.page_count ? String(book.page_count) : ''} onChange={(v) => setBook({ ...book, page_count: parseInt(v) || null })} />
          </div>

          {/* Add button */}
          <div>
            {added ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" disabled>
                  <Check size={16} className="mr-1" /> Added to catalog
                </Button>
                <Button variant="outline" onClick={() => navigate(`/books/${SEED_BOOKS[SEED_BOOKS.length - 1]?.id}`)}>
                  View book
                </Button>
                <Button variant="ghost" onClick={() => { setBook(null); setUrl(''); setAdded(false) }}>
                  Add another
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={handleAdd} disabled={!book.title}>
                Add to catalog
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 p-4 rounded-xl bg-surface border border-border">
        <p className="text-xs text-muted font-medium mb-2">Supported links</p>
        <div className="space-y-1.5 text-xs text-muted">
          <p>Amazon (any region): <code className="bg-background px-1.5 py-0.5 rounded text-foreground">amazon.in/dp/1668204541</code></p>
          <p>Goodreads: <code className="bg-background px-1.5 py-0.5 rounded text-foreground">goodreads.com/book/show/40121378-atomic-habits</code></p>
        </div>
        <p className="text-xs text-muted mt-2">Both platforms are checked automatically for every import.</p>
      </div>
    </div>
  )
}

function EditableField({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted w-14 shrink-0">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-sm px-2 py-1 rounded border border-border bg-background
          focus:outline-none focus:ring-1 focus:ring-highlight/20 focus:border-highlight" />
    </div>
  )
}
