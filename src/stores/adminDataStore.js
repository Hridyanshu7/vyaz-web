import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAdminDataStore = create((set, get) => ({
  initialized: false,
  loading: false,

  users: [],
  groupSessions: [],
  adminBooks: [],          // ALL books including unpublished
  platformSettings: {},    // { gemini_api_key: '...', ... }
  filterPills: [],
  authors: [],
  bookAuthors: [],         // [{ book_id, author_id }] — link rows

  initialize: async () => {
    if (get().initialized) return
    set({ loading: true })

    const [
      { data: users },
      { data: sessions },
      { data: books },
      { data: settings },
      { data: pills },
      { data: authors },
      { data: bookAuthors },
    ] = await Promise.all([
      supabase.from('profiles')
        .select('id, name, email, role, is_admin, is_active, created_at, avatar_url')
        .order('created_at', { ascending: false }),
      supabase.from('sessions')
        .select(`*, book:books(id, title, cover_url), narrator:profiles!sessions_narrator_id_fkey(id, name, avatar_url), attendees:session_attendees(id, reader_id, status)`)
        .order('scheduled_at', { ascending: false }),
      supabase.from('books')
        .select('id, title, author, cover_url, genres, is_published, cartesia_folder_id, goodreads_rating, goodreads_ratings_count')
        .order('title'),
      supabase.from('platform_settings').select('key, value'),
      supabase.from('genre_filters').select('name').order('sort_order'),
      supabase.from('authors').select('id, name, bio, photo_url, created_at').order('name'),
      supabase.from('book_authors').select('book_id, author_id'),
    ])

    const settingsMap = {}
    ;(settings || []).forEach((r) => { settingsMap[r.key] = r.value })

    set({
      initialized: true,
      loading: false,
      users: users || [],
      groupSessions: sessions || [],
      adminBooks: books || [],
      platformSettings: settingsMap,
      filterPills: (pills || []).map((r) => r.name),
      authors: authors || [],
      bookAuthors: bookAuthors || [],
    })
  },

  // Users
  updateUser: (userId, patch) =>
    set((s) => ({ users: s.users.map((u) => u.id === userId ? { ...u, ...patch } : u) })),

  // Sessions
  updateSession: (sessionId, patch) =>
    set((s) => ({ groupSessions: s.groupSessions.map((s2) => s2.id === sessionId ? { ...s2, ...patch } : s2) })),

  // Books
  updateBook: (bookId, patch) =>
    set((s) => ({ adminBooks: s.adminBooks.map((b) => b.id === bookId ? { ...b, ...patch } : b) })),

  removeBook: (bookId) =>
    set((s) => ({ adminBooks: s.adminBooks.filter((b) => b.id !== bookId) })),

  // Platform settings
  updateSetting: (key, value) =>
    set((s) => ({ platformSettings: { ...s.platformSettings, [key]: value } })),

  // Filter pills
  addFilterPill: (name) =>
    set((s) => ({ filterPills: [...s.filterPills, name] })),
  removeFilterPill: (name) =>
    set((s) => ({ filterPills: s.filterPills.filter((p) => p !== name) })),

  // Authors
  addAuthorLocal: (author) =>
    set((s) => ({ authors: [...s.authors, author].sort((a, b) => a.name.localeCompare(b.name)) })),
  updateAuthor: (authorId, patch) =>
    set((s) => ({ authors: s.authors.map((a) => a.id === authorId ? { ...a, ...patch } : a) })),
  removeAuthor: (authorId) =>
    set((s) => ({
      authors: s.authors.filter((a) => a.id !== authorId),
      bookAuthors: s.bookAuthors.filter((ba) => ba.author_id !== authorId),
    })),
  linkBookAuthor: (bookId, authorId) =>
    set((s) => (s.bookAuthors.some((ba) => ba.book_id === bookId && ba.author_id === authorId)
      ? s
      : { bookAuthors: [...s.bookAuthors, { book_id: bookId, author_id: authorId }] })),
  unlinkBookAuthor: (bookId, authorId) =>
    set((s) => ({ bookAuthors: s.bookAuthors.filter((ba) => !(ba.book_id === bookId && ba.author_id === authorId)) })),
}))
