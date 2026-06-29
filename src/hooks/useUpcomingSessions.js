import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useUpcomingSessions(limit = 5) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('sessions')
        .select(`
          *,
          book:books(id, title, author, cover_url),
          narrator:profiles!sessions_narrator_id_fkey(id, name, avatar_url),
          attendees:session_attendees(id, reader_id)
        `)
        .eq('type', 'group')
        .eq('status', 'open')
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(limit)

      const withSeats = (data || []).filter((s) => (s.attendees?.length || 0) < s.max_attendees)
      setSessions(withSeats)
    } catch {
      setSessions([])
    }
    setLoading(false)
  }

  return { sessions, loading, refetch: fetchSessions }
}
