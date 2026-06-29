import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

const CHANNEL_NAME = 'online-users'

export function usePresence() {
  const [onlineUsers, setOnlineUsers] = useState({})
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)

  useEffect(() => {
    const channel = supabase.channel(CHANNEL_NAME)

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const online = {}
        Object.values(state).forEach((presences) => {
          presences.forEach((p) => {
            if (p.user_id) online[p.user_id] = true
          })
        })
        setOnlineUsers(online)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && user) {
          await channel.track({
            user_id: user.id,
            name: profile?.name || '',
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [user, profile])

  const isOnline = (userId) => !!onlineUsers[userId]
  const onlineCount = Object.keys(onlineUsers).length

  return { onlineUsers, isOnline, onlineCount }
}
