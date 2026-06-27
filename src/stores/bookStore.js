import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useBookStore = create((set) => ({
  books: [],
  loading: false,
  searchQuery: '',
  selectedGenre: null,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedGenre: (genre) => set({ selectedGenre: genre }),

  fetchBooks: async () => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('books')
      .select('*, narrator_books(count)')
      .order('title')
    if (!error) set({ books: data || [] })
    set({ loading: false })
  },

  getFilteredBooks: () => {
    const { books, searchQuery, selectedGenre } = useBookStore.getState()
    return books.filter((book) => {
      const matchesSearch = !searchQuery ||
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesGenre = !selectedGenre || book.genre === selectedGenre
      return matchesSearch && matchesGenre
    })
  },
}))
