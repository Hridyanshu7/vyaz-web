import { useState, useMemo, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, Video, ChevronLeft, ChevronRight, Users, Loader2 } from 'lucide-react'
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes, isAfter } from 'date-fns'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { SEED_BOOKS, SEED_NARRATORS } from '../data/seedBooks'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { createSessionEvent, getNarratorAvailability } from '../lib/calendar'

const TIME_SLOTS = [
  { hour: 9, minute: 0 }, { hour: 10, minute: 0 }, { hour: 11, minute: 0 },
  { hour: 14, minute: 0 }, { hour: 15, minute: 0 }, { hour: 16, minute: 0 },
  { hour: 18, minute: 0 }, { hour: 19, minute: 0 }, { hour: 20, minute: 0 },
]

function generateBaseSlots(weekStart) {
  const slots = []
  for (let day = 0; day < 7; day++) {
    const date = addDays(weekStart, day)
    TIME_SLOTS.forEach((slot) => {
      const time = setMinutes(setHours(date, slot.hour), slot.minute)
      if (isAfter(time, new Date())) {
        slots.push({ date, hour: slot.hour, minute: slot.minute, time })
      }
    })
  }
  return slots
}

function isSlotBusy(slotTime, duration, busySlots) {
  const slotEnd = new Date(slotTime.getTime() + duration * 60000)
  return busySlots.some((busy) => {
    const busyStart = new Date(busy.start)
    const busyEnd = new Date(busy.end)
    return slotTime < busyEnd && slotEnd > busyStart
  })
}

export function Schedule() {
  const { bookId, narratorId } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [duration, setDuration] = useState(30)
  const [sessionType, setSessionType] = useState('one_on_one')
  const [maxAttendees, setMaxAttendees] = useState(1)
  const [booking, setBooking] = useState(null)
  const [creating, setCreating] = useState(false)
  const [busySlots, setBusySlots] = useState([])
  const [loadingAvail, setLoadingAvail] = useState(false)

  const book = SEED_BOOKS.find((b) => b.id === bookId)
  const narrator = SEED_NARRATORS.find((n) => n.id === narratorId)

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const baseSlots = useMemo(() => generateBaseSlots(weekStart), [weekOffset])

  const availableSlots = useMemo(
    () => baseSlots.filter((s) => !isSlotBusy(s.time, duration, busySlots)),
    [baseSlots, busySlots, duration]
  )

  useEffect(() => {
    if (!narratorId) return
    setLoadingAvail(true)
    const start = weekDays[0].toISOString()
    const end = addDays(weekDays[6], 1).toISOString()
    getNarratorAvailability(narratorId, start, end)
      .then((data) => setBusySlots(data.busySlots || []))
      .catch(() => setBusySlots([]))
      .finally(() => setLoadingAvail(false))
  }, [narratorId, weekOffset])

  if (!book || !narrator) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <p className="text-muted">Book or narrator not found.</p>
        <Link to="/books" className="text-highlight hover:underline text-sm mt-2 inline-block">Back to books</Link>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold mb-2">Sign in to book a session</h2>
        <p className="text-sm text-muted mb-6">Create a free account to schedule sessions with narrators.</p>
        <Button onClick={() => useSignupModal.getState().show()}>Sign up</Button>
      </div>
    )
  }

  if (booking) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <Video size={28} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold mb-1">Session booked!</h2>
        <p className="text-sm text-muted mb-2">
          {format(booking.time, 'EEEE, MMMM d · h:mm a')} · {duration} min with {narrator.name}
        </p>
        {booking.type === 'group' && (
          <Badge variant="muted" className="mb-4"><Users size={12} /> Group session · up to {maxAttendees}</Badge>
        )}
        {booking.meetingLink && (
          <div className="bg-surface rounded-xl border border-border p-4 mb-6 text-left">
            <p className="text-xs text-muted mb-1">Meeting link</p>
            <a href={booking.meetingLink} className="text-sm font-medium text-highlight break-all hover:underline" target="_blank" rel="noopener noreferrer">
              {booking.meetingLink}
            </a>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
          <Button variant="outline" onClick={() => navigate(`/books/${bookId}`)}>Back to book</Button>
        </div>
      </div>
    )
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isRealData = UUID_RE.test(narratorId) && UUID_RE.test(bookId)

  const handleBook = async () => {
    setCreating(true)
    try {
      const isGroup = sessionType === 'group'
      const fallbackMeetLink = `https://meet.google.com/${crypto.randomUUID().slice(0, 3)}-${crypto.randomUUID().slice(0, 4)}-${crypto.randomUUID().slice(0, 3)}`

      if (!isRealData) {
        setBooking({ time: selectedSlot.time, meetingLink: fallbackMeetLink, type: sessionType })
        return
      }

      const { data: session, error } = await supabase.from('sessions').insert({
        narrator_id: narratorId,
        book_id: bookId,
        type: sessionType,
        status: isGroup ? 'open' : 'scheduled',
        scheduled_at: selectedSlot.time.toISOString(),
        duration_minutes: duration,
        max_attendees: isGroup ? maxAttendees : 1,
      }).select().single()

      if (error) throw error

      await supabase.from('session_attendees').insert({
        session_id: session.id,
        reader_id: user.id,
      })

      let meetingLink = ''
      try {
        const eventResult = await createSessionEvent(session.id)
        meetingLink = eventResult.meetingLink || ''
      } catch {
        meetingLink = fallbackMeetLink
        await supabase.from('sessions').update({ meeting_link: meetingLink }).eq('id', session.id)
      }

      setBooking({ time: selectedSlot.time, meetingLink, type: sessionType })
    } catch (err) {
      console.error('Booking failed:', err)
      setBooking({
        time: selectedSlot.time,
        meetingLink: `https://meet.google.com/${crypto.randomUUID().slice(0, 3)}-${crypto.randomUUID().slice(0, 4)}-${crypto.randomUUID().slice(0, 3)}`,
        type: sessionType,
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link to={`/books/${bookId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6">
        <ArrowLeft size={16} /> Back to {book.title}
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold">Schedule a session</h1>
        <p className="text-sm text-muted mt-1">
          About <span className="font-medium text-foreground">{book.title}</span> with <span className="font-medium text-foreground">{narrator.name}</span>
        </p>
      </div>

      {/* Session type toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setSessionType('one_on_one'); setMaxAttendees(1) }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer
            ${sessionType === 'one_on_one' ? 'bg-foreground text-white' : 'bg-surface border border-border text-muted hover:text-foreground'}`}
        >
          1:1 Session
        </button>
        <button
          onClick={() => { setSessionType('group'); setMaxAttendees(10) }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-1
            ${sessionType === 'group' ? 'bg-foreground text-white' : 'bg-surface border border-border text-muted hover:text-foreground'}`}
        >
          <Users size={14} /> Group Session
        </button>
      </div>

      {/* Group capacity */}
      {sessionType === 'group' && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm text-muted">Max attendees:</label>
          <select
            value={maxAttendees}
            onChange={(e) => setMaxAttendees(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm cursor-pointer"
          >
            {[5, 10, 15, 20, 30, 50].map((n) => (
              <option key={n} value={n}>{n} people</option>
            ))}
          </select>
        </div>
      )}

      {/* Duration */}
      <div className="flex gap-2 mb-6">
        {[30, 45, 60].map((d) => (
          <button
            key={d}
            onClick={() => setDuration(d)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer
              ${d === duration ? 'bg-foreground text-white' : 'bg-surface border border-border text-muted hover:text-foreground'}`}
          >
            <Clock size={14} className="inline mr-1 -mt-0.5" />
            {d} min
          </button>
        ))}
      </div>

      {/* Calendar */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
          <button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} className="p-1 hover:bg-background rounded cursor-pointer" disabled={weekOffset === 0}>
            <ChevronLeft size={18} className={weekOffset === 0 ? 'text-border' : ''} />
          </button>
          <div className="text-center">
            <span className="text-sm font-medium">
              {format(weekDays[0], 'MMM d')} — {format(weekDays[6], 'MMM d, yyyy')}
            </span>
            {loadingAvail && <Loader2 size={14} className="inline ml-2 animate-spin text-muted" />}
          </div>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="p-1 hover:bg-background rounded cursor-pointer">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-border">
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="text-center py-2 text-xs border-r border-border last:border-r-0">
              <div className="text-muted">{format(day, 'EEE')}</div>
              <div className={`font-medium mt-0.5 ${isSameDay(day, new Date()) ? 'text-highlight' : ''}`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 min-h-[280px]">
          {weekDays.map((day) => {
            const daySlots = availableSlots.filter((s) => isSameDay(s.date, day))
            return (
              <div key={day.toISOString()} className="border-r border-border last:border-r-0 p-1 space-y-1">
                {daySlots.map((slot) => {
                  const isSelected = selectedSlot && slot.time.getTime() === selectedSlot.time.getTime()
                  return (
                    <button
                      key={slot.time.toISOString()}
                      onClick={() => setSelectedSlot(slot)}
                      className={`w-full text-xs py-1.5 rounded-md font-medium transition-colors cursor-pointer
                        ${isSelected
                          ? 'bg-highlight text-white'
                          : 'bg-surface hover:bg-highlight/10 hover:text-highlight text-muted'
                        }`}
                    >
                      {format(slot.time, 'h:mm')}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {selectedSlot && (
        <div className="mt-6 p-4 rounded-xl border border-border bg-surface flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{format(selectedSlot.time, 'EEEE, MMMM d · h:mm a')}</p>
            <p className="text-xs text-muted">
              {duration} min · {sessionType === 'group' ? `Group (up to ${maxAttendees})` : '1:1 session'}
            </p>
          </div>
          <Button onClick={handleBook} disabled={creating}>
            {creating ? <Loader2 size={16} className="animate-spin" /> : 'Confirm booking'}
          </Button>
        </div>
      )}
    </div>
  )
}
