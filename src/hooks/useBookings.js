import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export function useBookings() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchBookings()
  }, [user])

  const fetchBookings = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        book:books(id, title, author, cover_url, genre),
        reader:profiles!bookings_reader_id_fkey(id, name, avatar_url),
        narrator:profiles!bookings_narrator_id_fkey(id, name, avatar_url),
        review:reviews(id, rating, comment)
      `)
      .or(`reader_id.eq.${user.id},narrator_id.eq.${user.id}`)
      .order('scheduled_at', { ascending: false })

    if (!error) setBookings(data || [])
    setLoading(false)
  }

  const asListener = bookings.filter((b) => b.reader_id === user?.id)
  const asNarrator = bookings.filter((b) => b.narrator_id === user?.id)

  const upcoming = bookings.filter((b) =>
    b.status === 'confirmed' && new Date(b.scheduled_at) > new Date()
  )
  const completed = bookings.filter((b) => b.status === 'completed')

  const listenerStats = {
    totalSessions: asListener.length,
    booksDiscussed: new Set(asListener.map((b) => b.book_id)).size,
    avgRating: asListener.filter((b) => b.review?.length > 0)
      .reduce((sum, b) => sum + (b.review[0]?.rating || 0), 0) /
      (asListener.filter((b) => b.review?.length > 0).length || 1),
  }

  const narratorStats = {
    totalSessions: asNarrator.length,
    uniqueReaders: new Set(asNarrator.map((b) => b.reader_id)).size,
    avgRating: asNarrator.filter((b) => b.review?.length > 0)
      .reduce((sum, b) => sum + (b.review[0]?.rating || 0), 0) /
      (asNarrator.filter((b) => b.review?.length > 0).length || 1),
  }

  return {
    bookings, loading, upcoming, completed,
    asListener, asNarrator, listenerStats, narratorStats,
    refetch: fetchBookings,
  }
}
