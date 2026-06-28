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

  const upcoming = sessions.filter((s) =>
    ['scheduled', 'open'].includes(s.status) && new Date(s.scheduled_at) > new Date()
  )
  const completed = sessions.filter((s) => s.status === 'completed')

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

export function useBookSessions(bookId) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bookId) return
    fetchBookSessions()
  }, [bookId])

  const fetchBookSessions = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sessions')
      .select(`
        *,
        narrator:profiles!sessions_narrator_id_fkey(id, name, avatar_url),
        attendees:session_attendees(id, reader_id)
      `)
      .eq('book_id', bookId)
      .in('status', ['scheduled', 'open'])
      .gt('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })

    setSessions(data || [])
    setLoading(false)
  }

  return { sessions, loading, refetch: fetchBookSessions }
}
