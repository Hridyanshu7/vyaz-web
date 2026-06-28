import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useBookStore = create((set, get) => ({
  books: [],
  narrators: [],
  genres: [],
  loading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    await Promise.all([get().fetchBooks(), get().fetchNarrators()])
    set({ initialized: true })
  },

  fetchBooks: async () => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .order('title')

    if (!error && data) {
      const genres = [...new Set(
        data.flatMap((b) => b.goodreads_data?.genres || [])
          .filter((g) => !['Nonfiction', 'Fiction', 'Audiobook', 'Book Club', 'Novels', 'Buisness', 'Adult', 'School'].includes(g))
      )].sort()
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
      const matchesGenre = !selectedGenre ||
        book.goodreads_data?.genres?.includes(selectedGenre) ||
        book.genre === selectedGenre
      return matchesSearch && matchesGenre
    })
  },

  getFeaturedBooks: () => {
    return [...get().books]
      .sort((a, b) => (b.goodreads_data?.averageRating || 0) - (a.goodreads_data?.averageRating || 0))
      .slice(0, 6)
  },

  addBook: async (bookData) => {
    const { data, error } = await supabase
      .from('books')
      .insert({
        title: bookData.title,
        author: bookData.author,
        description: bookData.description,
        genre: bookData.genre,
        page_count: bookData.page_count,
        isbn: bookData.isbn,
        cover_url: bookData.cover_url,
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
}))
