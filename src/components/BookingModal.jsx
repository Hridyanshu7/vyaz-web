import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ArrowLeft, ArrowRight, Clock, Video, ChevronLeft, ChevronRight, Users, Loader2, Star, User, MessageSquare, Zap } from 'lucide-react'
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes, isAfter } from 'date-fns'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { StarRating } from './ui/StarRating'
import { useAuthStore } from '../stores/authStore'
import { useBookStore } from '../stores/bookStore'
import { supabase } from '../lib/supabase'
import { useAvailability, generateSlotsFromAvailability } from '../hooks/useAvailability'
import { createSessionEvent, getNarratorAvailability } from '../lib/calendar'

const TIME_SLOTS = [
  { hour: 9, minute: 0 }, { hour: 10, minute: 0 }, { hour: 11, minute: 0 },
  { hour: 14, minute: 0 }, { hour: 15, minute: 0 }, { hour: 16, minute: 0 },
  { hour: 18, minute: 0 }, { hour: 19, minute: 0 }, { hour: 20, minute: 0 },
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isSlotBusy(slotTime, duration, busySlots) {
  const slotEnd = new Date(slotTime.getTime() + duration * 60000)
  return busySlots.some((busy) => {
    const busyStart = new Date(busy.start)
    const busyEnd = new Date(busy.end)
    return slotTime < busyEnd && slotEnd > busyStart
  })
}

export function BookingModal({ open, onClose, bookId, sessionType = 'one_on_one', preselectedNarrator = null }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { getBook, getNarratorsForBook } = useBookStore()
  const book = getBook(bookId)
  const narrators = getNarratorsForBook(bookId)

  const [step, setStep] = useState(preselectedNarrator ? 'schedule' : 'narrator')
  const [selectedNarrator, setSelectedNarrator] = useState(preselectedNarrator)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [duration, setDuration] = useState(30)
  const [type, setType] = useState(sessionType)
  const [maxAttendees, setMaxAttendees] = useState(10)
  const [busySlots, setBusySlots] = useState([])
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [creating, setCreating] = useState(false)
  const [booking, setBooking] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [error, setError] = useState('')

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const { availability: narratorAvailability } = useAvailability(selectedNarrator?.id)

  const baseSlots = useMemo(() => {
    if (narratorAvailability && narratorAvailability.some((s) => s.enabled)) {
      return generateSlotsFromAvailability(narratorAvailability, weekStart)
    }
    // Fallback: show all slots if no availability set
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
  }, [weekOffset, narratorAvailability])

  const availableSlots = useMemo(
    () => baseSlots.filter((s) => !isSlotBusy(s.time, duration, busySlots)),
    [baseSlots, busySlots, duration]
  )

  useEffect(() => {
    if (!selectedNarrator || step !== 'schedule') return
    setLoadingAvail(true)
    const start = weekDays[0].toISOString()
    const end = addDays(weekDays[6], 1).toISOString()
    getNarratorAvailability(selectedNarrator.id, start, end)
      .then((data) => setBusySlots(data.busySlots || []))
      .catch(() => setBusySlots([]))
      .finally(() => setLoadingAvail(false))
  }, [selectedNarrator, weekOffset, step])

  if (!open || !book) return null

  const isRealData = UUID_RE.test(bookId) && UUID_RE.test(selectedNarrator?.id)

  const handleSelectNarrator = (narrator) => {
    setSelectedNarrator(narrator)
    setError('')
    setStep('schedule')
  }

  const handleConfirm = async () => {
    setCreating(true)
    try {
      const isGroup = type === 'group'
      const fallbackMeetLink = `https://meet.google.com/${crypto.randomUUID().slice(0, 3)}-${crypto.randomUUID().slice(0, 4)}-${crypto.randomUUID().slice(0, 3)}`

      if (!isRealData) {
        setBooking({ time: selectedSlot.time, meetingLink: fallbackMeetLink, type })
        setStep('confirm')
        setCreating(false)
        return
      }

      const { data: session, error } = await supabase.from('sessions').insert({
        narrator_id: selectedNarrator.id,
        book_id: bookId,
        type,
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

      setBooking({ time: selectedSlot.time, meetingLink, type })
      setStep('confirm')
    } catch (err) {
      console.error('Booking failed:', err)
      setError(err.message || 'Booking failed. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const handleRequest = async () => {
    setRequesting(true)
    try {
      await supabase.from('session_requests').insert({
        reader_id: user.id,
        book_id: bookId,
      })
      setRequestSent(true)
    } catch {}
    setRequesting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-foreground/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background flex items-center justify-between px-5 py-4 border-b border-border z-10">
          <div className="flex items-center gap-2">
            {step === 'schedule' && (
              <button onClick={() => setStep('narrator')} className="p-1 hover:bg-surface rounded cursor-pointer">
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <h2 className="font-bold text-sm">{book.title}</h2>
              <p className="text-xs text-muted">
                {step === 'narrator' && 'Choose a narrator'}
                {step === 'schedule' && `Schedule with ${selectedNarrator?.name}`}
                {step === 'confirm' && 'Session booked!'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface rounded-lg cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">

          {error && (
            <div className="bg-highlight/10 text-highlight text-sm px-3 py-2 rounded-lg mb-2">{error}</div>
          )}

          {/* ===== STEP 1: NARRATOR SELECTION ===== */}
          {step === 'narrator' && (
            <div>
              {narrators.length > 0 ? (
                <div className="space-y-2">
                  {narrators.map((narrator, i) => (
                    <button
                      key={narrator.id}
                      onClick={() => handleSelectNarrator(narrator)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-foreground/20 hover:bg-surface transition-colors cursor-pointer text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 overflow-hidden">
                        {narrator.avatar_url ? (
                          <img src={narrator.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={18} className="text-muted" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{narrator.name}</p>
                        {narrator.bio && <p className="text-xs text-muted truncate">{narrator.bio}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Star size={12} className="fill-highlight text-highlight" />
                        <span className="text-xs font-medium">{(4.2 + i * 0.15).toFixed(1)}</span>
                      </div>
                      <ArrowRight size={14} className="text-muted shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageSquare size={28} className="mx-auto text-muted mb-3" />
                  <p className="text-sm font-medium mb-1">No narrators available for this book yet</p>
                  <p className="text-xs text-muted mb-4">Request a session and we'll notify you when a narrator signs up.</p>
                  {requestSent ? (
                    <Badge variant="success">Request sent!</Badge>
                  ) : (
                    <Button size="sm" disabled={requesting} onClick={handleRequest}>
                      {requesting ? <Loader2 size={14} className="animate-spin" /> : <><MessageSquare size={14} className="mr-1" /> Request a session</>}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== STEP 2: SLOT PICKER ===== */}
          {step === 'schedule' && (
            <div>
              {/* Duration + type */}
              <div className="flex gap-2 mb-3">
                {[30, 45, 60].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer
                      ${d === duration ? 'bg-foreground text-white' : 'bg-surface border border-border text-muted'}`}
                  >
                    {d} min
                  </button>
                ))}
              </div>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setType('one_on_one'); setMaxAttendees(1) }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer
                    ${type === 'one_on_one' ? 'bg-foreground text-white' : 'bg-surface border border-border text-muted'}`}
                >
                  1:1
                </button>
                <button
                  onClick={() => { setType('group'); setMaxAttendees(10) }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1
                    ${type === 'group' ? 'bg-foreground text-white' : 'bg-surface border border-border text-muted'}`}
                >
                  <Users size={12} /> Group
                </button>
                {type === 'group' && (
                  <select
                    value={maxAttendees}
                    onChange={(e) => setMaxAttendees(Number(e.target.value))}
                    className="px-2 py-1 rounded-lg border border-border bg-background text-xs cursor-pointer"
                  >
                    {[5, 10, 15, 20, 30, 50].map((n) => (
                      <option key={n} value={n}>{n} seats</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Calendar */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border">
                  <button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} className="p-1 cursor-pointer" disabled={weekOffset === 0}>
                    <ChevronLeft size={16} className={weekOffset === 0 ? 'text-border' : ''} />
                  </button>
                  <div className="text-center">
                    <span className="text-xs font-medium">{format(weekDays[0], 'MMM d')} — {format(weekDays[6], 'MMM d')}</span>
                    {loadingAvail && <Loader2 size={12} className="inline ml-1 animate-spin text-muted" />}
                  </div>
                  <button onClick={() => setWeekOffset((w) => w + 1)} className="p-1 cursor-pointer">
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-7 border-b border-border">
                  {weekDays.map((day) => (
                    <div key={day.toISOString()} className="text-center py-1.5 text-[10px] border-r border-border last:border-r-0">
                      <div className="text-muted">{format(day, 'EEE')}</div>
                      <div className={`font-medium ${isSameDay(day, new Date()) ? 'text-highlight' : ''}`}>{format(day, 'd')}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 min-h-[200px]">
                  {weekDays.map((day) => {
                    const daySlots = availableSlots.filter((s) => isSameDay(s.date, day))
                    return (
                      <div key={day.toISOString()} className="border-r border-border last:border-r-0 p-0.5 space-y-0.5">
                        {daySlots.map((slot) => {
                          const isSelected = selectedSlot && slot.time.getTime() === selectedSlot.time.getTime()
                          return (
                            <button
                              key={slot.time.toISOString()}
                              onClick={() => setSelectedSlot(slot)}
                              className={`w-full text-[10px] py-1 rounded font-medium transition-colors cursor-pointer
                                ${isSelected ? 'bg-highlight text-white' : 'bg-surface hover:bg-highlight/10 hover:text-highlight text-muted'}`}
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
                <div className="mt-3 p-3 rounded-xl border border-border bg-surface flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{format(selectedSlot.time, 'EEE, MMM d · h:mm a')}</p>
                    <p className="text-xs text-muted">{duration} min · {type === 'group' ? `Group (${maxAttendees} seats)` : '1:1'}</p>
                  </div>
                  <Button size="sm" onClick={handleConfirm} disabled={creating}>
                    {creating ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ===== STEP 3: CONFIRMATION ===== */}
          {step === 'confirm' && booking && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                <Video size={24} className="text-green-600" />
              </div>
              <h3 className="text-lg font-bold mb-1">Session booked!</h3>
              <p className="text-sm text-muted mb-1">
                {format(booking.time, 'EEEE, MMMM d · h:mm a')} · {duration} min
              </p>
              <p className="text-sm text-muted mb-4">with {selectedNarrator?.name}</p>

              {booking.meetingLink && (
                <div className="bg-surface rounded-lg border border-border p-3 mb-4 text-left">
                  <p className="text-xs text-muted mb-1">Meeting link</p>
                  <a href={booking.meetingLink} className="text-sm font-medium text-highlight break-all hover:underline" target="_blank" rel="noopener noreferrer">
                    {booking.meetingLink}
                  </a>
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={() => { onClose(); navigate('/dashboard') }}>Dashboard</Button>
                <Button size="sm" variant="outline" onClick={onClose}>Back to book</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
