import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export function getBookGenres(book) {
  if (book.genres?.length > 0) return book.genres
  return book.goodreads_data?.genres || []
}

export const useBookStore = create((set, get) => ({
  books: [],
  narrators: [],
  genres: [],
  filterPills: [],
  loading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    await Promise.all([get().fetchBooks(), get().fetchNarrators(), get().fetchFilterPills()])
    set({ initialized: true })
  },

  fetchFilterPills: async () => {
    const { data } = await supabase
      .from('genre_filters')
      .select('name, sort_order')
      .order('sort_order')
    if (data) set({ filterPills: data.map((r) => r.name) })
  },

  fetchBooks: async () => {
    set({ loading: true })
    // Light columns only — the heavy `chapters` JSONB (full book text, ~MBs across the
    // catalog) is lazy-loaded per book via fetchBookChapters when a BookDetail opens.
    const { data, error } = await supabase
      .from('books')
      .select('id, title, author, cover_url, description, genres, language, page_count, isbn, goodreads_data, amazon_data, goodreads_rating, goodreads_ratings_count, amazon_rating, amazon_reviews_count, cartesia_folder_id, is_published, book_authors(author:authors(id, name, photo_url))')
      .eq('is_published', true)
      .order('title')

    if (!error && data) {
      const pills = get().filterPills
      const hasMiscellaneous = data.some((b) =>
        !getBookGenres(b).some((g) => pills.includes(g))
      )
      const genres = [...pills, ...(hasMiscellaneous ? ['Miscellaneous'] : [])]
      set({ books: data, genres, loading: false })
    } else {
      set({ loading: false })
    }
  },

  fetchNarrators: async () => {
    const { data: narratorBooks } = await supabase
      .from('narrator_books')
      .select(`
        book_id,
        narrator:profiles!narrator_books_narrator_id_fkey(id, name, bio, avatar_url, role)
      `)

    if (!narratorBooks) return

    const narratorMap = {}
    narratorBooks.forEach((nb) => {
      const n = nb.narrator
      if (!n) return
      if (!narratorMap[n.id]) {
        narratorMap[n.id] = { ...n, book_ids: [] }
      }
      narratorMap[n.id].book_ids.push(nb.book_id)
    })

    set({ narrators: Object.values(narratorMap) })
  },

  getBook: (id) => get().books.find((b) => b.id === id),

  // Lazy-load a single book's heavy `chapters` blob (fetched only when its BookDetail
  // opens). Memoized — returns the cached chapters if already loaded. The Talk session
  // reads chapter.sections straight from here, so it inherits them once loaded.
  fetchBookChapters: async (bookId) => {
    const existing = get().books.find((b) => b.id === bookId)
    if (existing?.chapters) return existing.chapters
    const { data, error } = await supabase
      .from('books')
      .select('chapters')
      .eq('id', bookId)
      .single()
    if (!error && data) {
      set((state) => ({
        books: state.books.map((b) => (b.id === bookId ? { ...b, chapters: data.chapters } : b)),
      }))
      return data.chapters
    }
    return null
  },

  removeBook: (bookId) =>
    set((state) => ({ books: state.books.filter((b) => b.id !== bookId) })),

  getNarratorsForBook: (bookId) =>
    get().narrators.filter((n) => n.book_ids.includes(bookId)),

  // opts: { searchQuery, genre, language, author, sortBestsellers }
  getFilteredBooks: (opts = {}) => {
    const { searchQuery = '', genre = null, language = null, author = null, sortBestsellers = false } = opts
    const filtered = get().books.filter((book) => {
      const matchesSearch = !searchQuery ||
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(searchQuery.toLowerCase())

      let matchesGenre = true
      if (genre) {
        const bookGenres = getBookGenres(book)
        if (genre === 'Miscellaneous') {
          matchesGenre = !bookGenres.some((g) => get().filterPills.includes(g))
        } else {
          matchesGenre = bookGenres.includes(genre)
        }
      }

      const matchesLanguage = !language || book.language === language
      const matchesAuthor = !author || book.author === author

      return matchesSearch && matchesGenre && matchesLanguage && matchesAuthor
    })
    if (!sortBestsellers) return filtered
    return [...filtered].sort((a, b) => (b.goodreads_rating || 0) - (a.goodreads_rating || 0))
  },

  getLanguages: () => [...new Set(get().books.map((b) => b.language).filter(Boolean))].sort(),

  getAuthors: () => [...new Set(get().books.map((b) => b.author).filter(Boolean))].sort(),

  getFeaturedBooks: () => {
    return [...get().books]
      .sort((a, b) => (b.goodreads_rating || 0) - (a.goodreads_rating || 0))
      .slice(0, 6)
  },

  addBook: async (bookData) => {
    const genres = [
      ...(bookData.goodreads_data?.genres || []),
      ...(bookData.goodreads?.genres || []),
    ]

    const { data, error } = await supabase
      .from('books')
      .insert({
        title: bookData.title,
        author: bookData.author,
        description: bookData.description || bookData.goodreads_data?.description || bookData.amazon_data?.description || null,
        genres: [...new Set(genres)],
        page_count: bookData.page_count || bookData.goodreads_data?.pages || null,
        isbn: bookData.isbn || bookData.goodreads_data?.isbn13 || null,
        cover_url: bookData.cover_url,
        language: bookData.language || null,
        goodreads_rating: bookData.goodreads_data?.averageRating || bookData.goodreads?.averageRating || null,
        goodreads_ratings_count: bookData.goodreads_data?.ratingsCount || bookData.goodreads?.ratingsCount || null,
        amazon_rating: bookData.amazon_data?.stars || bookData.amazon?.stars || null,
        amazon_reviews_count: bookData.amazon_data?.reviewsCount || bookData.amazon?.reviewsCount || null,
        amazon_data: bookData.amazon_data || bookData.amazon || null,
        goodreads_data: bookData.goodreads_data || bookData.goodreads || null,
      })
      .select()
      .single()

    if (!error && data) {
      set((state) => ({ books: [...state.books, data] }))
      return data
    }
    if (error) throw error
  },

  updateBookGenres: async (bookId, genres) => {
    const { data, error } = await supabase
      .from('books')
      .update({ genres })
      .eq('id', bookId)
      .select()
      .single()

    if (!error && data) {
      set((state) => ({
        books: state.books.map((b) => b.id === bookId ? { ...b, genres } : b)
      }))
    }
    if (error) throw error
  },
}))

