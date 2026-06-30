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
    const { data, error } = await supabase
      .from('books')
      .select('*')
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

  getNarratorsForBook: (bookId) =>
    get().narrators.filter((n) => n.book_ids.includes(bookId)),

  getFilteredBooks: (searchQuery, selectedGenre) => {
    return get().books.filter((book) => {
      const matchesSearch = !searchQuery ||
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(searchQuery.toLowerCase())

      let matchesGenre = true
      if (selectedGenre) {
        const bookGenres = getBookGenres(book)
        if (selectedGenre === 'Miscellaneous') {
          matchesGenre = !bookGenres.some((g) => get().filterPills.includes(g))
        } else {
          matchesGenre = bookGenres.includes(selectedGenre)
        }
      }
      return matchesSearch && matchesGenre
    })
  },

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
        publisher: bookData.publisher || null,
        pub_date: bookData.pub_date || bookData.goodreads_data?.publishedAt || null,
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

