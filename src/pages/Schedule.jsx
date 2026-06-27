import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, Video, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes, isAfter } from 'date-fns'
import { Button } from '../components/ui/Button'
import { SEED_BOOKS, SEED_NARRATORS } from '../data/seedBooks'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const TIME_SLOTS = [
  { hour: 9, minute: 0 },
  { hour: 10, minute: 0 },
  { hour: 11, minute: 0 },
  { hour: 14, minute: 0 },
  { hour: 15, minute: 0 },
  { hour: 16, minute: 0 },
  { hour: 18, minute: 0 },
  { hour: 19, minute: 0 },
  { hour: 20, minute: 0 },
]

function generateAvailability(narratorId, weekStart) {
  const seed = narratorId.charCodeAt(narratorId.length - 1)
  const slots = []
  for (let day = 0; day < 7; day++) {
    const date = addDays(weekStart, day)
    TIME_SLOTS.forEach((slot, i) => {
      const isAvailable = ((seed + day + i) % 3) !== 0
      if (isAvailable) {
        slots.push({
          date,
          hour: slot.hour,
          minute: slot.minute,
          time: setMinutes(setHours(date, slot.hour), slot.minute),
        })
      }
    })
  }
  return slots.filter((s) => isAfter(s.time, new Date()))
}

export function Schedule() {
  const { bookId, narratorId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [duration, setDuration] = useState(30)
  const [booking, setBooking] = useState(null)

  const book = SEED_BOOKS.find((b) => b.id === bookId)
  const narrator = SEED_NARRATORS.find((n) => n.id === narratorId)

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const availability = useMemo(
    () => generateAvailability(narratorId, weekStart),
    [narratorId, weekOffset]
  )

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
        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate('/login')}>Log in</Button>
          <Button variant="outline" onClick={() => navigate('/login')}>Sign up</Button>
        </div>
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
        <p className="text-sm text-muted mb-6">
          {format(booking.time, 'EEEE, MMMM d · h:mm a')} · {duration} min with {narrator.name}
        </p>
        <div className="bg-surface rounded-xl border border-border p-4 mb-6 text-left">
          <p className="text-xs text-muted mb-1">Meeting link</p>
          <p className="text-sm font-medium text-highlight break-all">{booking.meetingLink}</p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
          <Button variant="outline" onClick={() => navigate(`/books/${bookId}`)}>Back to book</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link to={`/books/${bookId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6">
        <ArrowLeft size={16} /> Back to {book.title}
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold">Schedule a session</h1>
        <p className="text-sm text-muted mt-1">
          {duration} min about <span className="font-medium text-foreground">{book.title}</span> with <span className="font-medium text-foreground">{narrator.name}</span>
        </p>
      </div>

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

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
          <button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} className="p-1 hover:bg-background rounded cursor-pointer" disabled={weekOffset === 0}>
            <ChevronLeft size={18} className={weekOffset === 0 ? 'text-border' : ''} />
          </button>
          <span className="text-sm font-medium">
            {format(weekDays[0], 'MMM d')} — {format(weekDays[6], 'MMM d, yyyy')}
          </span>
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
            const daySlots = availability.filter((s) => isSameDay(s.date, day))
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
            <p className="text-xs text-muted">{duration} min session</p>
          </div>
          <Button onClick={async () => {
            const meetLink = `https://meet.google.com/${crypto.randomUUID().slice(0, 3)}-${crypto.randomUUID().slice(0, 4)}-${crypto.randomUUID().slice(0, 3)}`
            const endTime = new Date(selectedSlot.time.getTime() + duration * 60000)

            const { data, error } = await supabase.from('bookings').insert({
              reader_id: user.id,
              narrator_id: narratorId,
              book_id: bookId,
              scheduled_at: selectedSlot.time.toISOString(),
              duration_minutes: duration,
              status: 'confirmed',
              meeting_link: meetLink,
            }).select().single()

            if (!error && data) {
              setBooking({ time: selectedSlot.time, meetingLink: meetLink })
            }
          }}>
            Confirm booking
          </Button>
        </div>
      )}
    </div>
  )
}
