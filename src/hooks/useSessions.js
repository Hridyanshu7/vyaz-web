import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export function useSessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchSessions()
  }, [user])

  const fetchSessions = async () => {
    setLoading(true)

    // sessions where user is narrator
    const { data: narratorSessions } = await supabase
      .from('sessions')
      .select(`
        *,
        book:books(id, title, author, cover_url, genre),
        narrator:profiles!sessions_narrator_id_fkey(id, name, avatar_url),
        attendees:session_attendees(id, reader_id, status, reader:profiles!session_attendees_reader_id_fkey(id, name))
      `)
      .eq('narrator_id', user.id)
      .order('scheduled_at', { ascending: false })

    // sessions where user is attendee
    const { data: attendeeRows } = await supabase
      .from('session_attendees')
      .select('session_id')
      .eq('reader_id', user.id)

    const attendeeSessionIds = (attendeeRows || []).map((r) => r.session_id)

    let attendeeSessions = []
    if (attendeeSessionIds.length > 0) {
      const { data } = await supabase
        .from('sessions')
        .select(`
          *,
          book:books(id, title, author, cover_url, genre),
          narrator:profiles!sessions_narrator_id_fkey(id, name, avatar_url),
          attendees:session_attendees(id, reader_id, status, reader:profiles!session_attendees_reader_id_fkey(id, name))
        `)
        .in('id', attendeeSessionIds)
        .order('scheduled_at', { ascending: false })
      attendeeSessions = data || []
    }

    // merge and deduplicate
    const all = [...(narratorSessions || []), ...attendeeSessions]
    const unique = all.reduce((acc, s) => {
      if (!acc.find((x) => x.id === s.id)) acc.push(s)
      return acc
    }, [])
    unique.sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))

    setSessions(unique)
    setLoading(false)
  }

  const asNarrator = sessions.filter((s) => s.narrator_id === user?.id)
  const asListener = sessions.filter((s) =>
    s.attendees?.some((a) => a.reader_id === user?.id)
  )

  const now = new Date()
  const upcoming = sessions.filter((s) => {
    if (s.status === 'cancelled') return false
    const sessionEnd = new Date(new Date(s.scheduled_at).getTime() + s.duration_minutes * 60000)
    return sessionEnd > now
  })
  const completed = sessions.filter((s) => {
    if (s.status === 'cancelled') return false
    const sessionEnd = new Date(new Date(s.scheduled_at).getTime() + s.duration_minutes * 60000)
    return sessionEnd <= now
  })

  const narratorStats = {
    totalSessions: asNarrator.length,
    uniqueReaders: new Set(asNarrator.flatMap((s) => (s.attendees || []).map((a) => a.reader_id))).size,
    totalAttendees: asNarrator.reduce((sum, s) => sum + (s.attendees?.length || 0), 0),
  }

  const listenerStats = {
    totalSessions: asListener.length,
    booksDiscussed: new Set(asListener.map((s) => s.book_id)).size,
  }

  return {
    sessions, loading, upcoming, completed,
    asNarrator, asListener, narratorStats, listenerStats,
    refetch: fetchSessions,
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function useBookSessions(bookId) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bookId || !UUID_REGEX.test(bookId)) { setLoading(false); return }
    fetchBookSessions()
  }, [bookId])

  const fetchBookSessions = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('sessions')
        .select(`
          *,
          narrator:profiles!sessions_narrator_id_fkey(id, name, avatar_url),
          attendees:session_attendees(id, reader_id)
        `)
        .eq('book_id', bookId)
        .eq('type', 'group')
        .eq('status', 'open')
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })

      const withSeats = (data || []).filter((s) => (s.attendees?.length || 0) < s.max_attendees)
      setSessions(withSeats)
    } catch {
      setSessions([])
    }
    setLoading(false)
  }

  return { sessions, loading, refetch: fetchBookSessions }
}
