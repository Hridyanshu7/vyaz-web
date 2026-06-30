import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DEFAULT_RANGE = { start_time: '18:00', end_time: '21:00' }

export const DEFAULT_AVAILABILITY = DAYS.map((_, i) => ({
  day_of_week: i + 1,
  enabled: true,
  ranges: [{ ...DEFAULT_RANGE }],
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
      .order('day_of_week')
      .order('start_time')

    if (data && data.length > 0) {
      setHasAvailability(true)
      setTimezone(data[0].timezone || timezone)

      // group rows by day_of_week
      const mapped = DAYS.map((_, i) => {
        const dayRows = data.filter((d) => d.day_of_week === i + 1)
        return {
          day_of_week: i + 1,
          enabled: dayRows.length > 0,
          ranges: dayRows.length > 0
            ? dayRows.map((r) => ({
                start_time: r.start_time?.slice(0, 5) || '18:00',
                end_time: r.end_time?.slice(0, 5) || '21:00',
              }))
            : [{ ...DEFAULT_RANGE }],
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

    const inserts = []
    slots.forEach((day) => {
      if (!day.enabled) return
      day.ranges.forEach((range) => {
        if (range.start_time && range.end_time && range.start_time < range.end_time) {
          inserts.push({
            narrator_id: narratorId,
            day_of_week: day.day_of_week,
            start_time: range.start_time,
            end_time: range.end_time,
            timezone: tz,
          })
        }
      })
    })

    if (inserts.length > 0) {
      await supabase.from('availability').insert(inserts)
    }

    setHasAvailability(inserts.length > 0)
    await fetchAvailability()
  }

  return { availability, setAvailability, timezone, setTimezone, loading, hasAvailability, saveAvailability }
}

export function generateSlotsFromAvailability(availabilityRows, weekStart) {
  const slots = []
  const now = new Date()

  availabilityRows.forEach((day) => {
    if (!day.enabled) return
    const dayIndex = (day.day_of_week - 1 + 7) % 7
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + dayIndex)

    day.ranges.forEach((range) => {
      if (!range.start_time || !range.end_time) return

      const [startH, startM] = range.start_time.split(':').map(Number)
      const [endH, endM] = range.end_time.split(':').map(Number)

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
  })

  return slots.sort((a, b) => a.time - b.time)
}
