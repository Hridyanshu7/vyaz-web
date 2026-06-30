import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const DEFAULT_AVAILABILITY = DAYS.map((_, i) => ({
  day_of_week: i + 1,
  enabled: i < 5,
  start_time: '18:00',
  end_time: '21:00',
}))

export function useAvailability(narratorId) {
  const [availability, setAvailability] = useState(DEFAULT_AVAILABILITY)
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [loading, setLoading] = useState(true)
  const [hasAvailability, setHasAvailability] = useState(false)

  useEffect(() => {
    if (!narratorId) { setLoading(false); return }
    fetchAvailability()
  }, [narratorId])

  const fetchAvailability = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('availability')
      .select('*')
      .eq('narrator_id', narratorId)

    if (data && data.length > 0) {
      setHasAvailability(true)
      setTimezone(data[0].timezone || timezone)
      const mapped = DAYS.map((_, i) => {
        const row = data.find((d) => d.day_of_week === i + 1)
        return {
          day_of_week: i + 1,
          enabled: !!row,
          start_time: row?.start_time?.slice(0, 5) || '18:00',
          end_time: row?.end_time?.slice(0, 5) || '21:00',
        }
      })
      setAvailability(mapped)
    } else {
      setHasAvailability(false)
      setAvailability(DEFAULT_AVAILABILITY)
    }
    setLoading(false)
  }

  const saveAvailability = async (narratorId, slots, tz) => {
    await supabase.from('availability').delete().eq('narrator_id', narratorId)
    const inserts = slots
      .filter((s) => s.enabled)
      .map((s) => ({
        narrator_id: narratorId,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        timezone: tz,
      }))
    if (inserts.length > 0) {
      await supabase.from('availability').insert(inserts)
    }
    setHasAvailability(inserts.length > 0)
    await fetchAvailability()
  }

  return { availability, setAvailability, timezone, setTimezone, loading, hasAvailability, saveAvailability }
}

export function generateSlotsFromAvailability(availabilityRows, weekStart, timezone) {
  const slots = []
  const now = new Date()

  availabilityRows.forEach((row) => {
    if (!row.enabled) return
    const dayIndex = (row.day_of_week - 1 + 7) % 7
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + dayIndex)

    const [startH, startM] = row.start_time.split(':').map(Number)
    const [endH, endM] = row.end_time.split(':').map(Number)

    let current = new Date(date)
    current.setHours(startH, startM, 0, 0)
    const end = new Date(date)
    end.setHours(endH, endM, 0, 0)

    while (current < end) {
      if (current > now) {
        slots.push({
          date,
          hour: current.getHours(),
          minute: current.getMinutes(),
          time: new Date(current),
        })
      }
      current = new Date(current.getTime() + 30 * 60000)
    }
  })

  return slots.sort((a, b) => a.time - b.time)
}

export { DAYS }
