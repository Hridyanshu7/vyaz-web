import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Video, Star, Clock, BookOpen, Calendar, User, Headphones, Mic, Settings, Users } from 'lucide-react'
import { format, isPast, isToday, isTomorrow } from 'date-fns'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useAuthStore } from '../stores/authStore'
import { useSignupModal } from '../hooks/useSignupModal'
import { useSessions } from '../hooks/useSessions'
import { supabase } from '../lib/supabase'

function SessionCard({ session, currentUserId, onRefresh }) {
  const isNarrator = session.narrator_id === currentUserId
  const sessionEnd = new Date(new Date(session.scheduled_at).getTime() + session.duration_minutes * 60000)
  const isOver = isPast(sessionEnd)
  const isUpcoming = !isOver && session.status !== 'cancelled'
  const attendeeCount = session.attendees?.length || 0

  const myAttendance = session.attendees?.find((a) => a.reader_id === currentUserId)
  const didAttend = myAttendance?.status === 'attended'
  const isCompleted = isOver && session.status !== 'cancelled'
  const canReview = isCompleted && !isNarrator && didAttend

  const handleJoin = async () => {
    if (isNarrator) {
      await supabase.from('sessions').update({ status: 'completed' }).eq('id', session.id).eq('status', 'scheduled')
    } else if (myAttendance) {
      await supabase.from('session_attendees').update({ status: 'attended' }).eq('id', myAttendance.id)
    }
    window.open(session.meeting_link, '_blank')
    if (onRefresh) setTimeout(onRefresh, 1000)
  }

  const dateLabel = (() => {
    const d = new Date(session.scheduled_at)
    if (isToday(d)) return 'Today'
    if (isTomorrow(d)) return 'Tomorrow'
    return format(d, 'EEE, MMM d')
  })()

  const statusLabel = isCompleted ? 'Completed' : isUpcoming ? 'Upcoming' : session.status
  const statusVariant = isCompleted ? 'muted' : isUpcoming ? 'success' : 'default'

  return (
    <div className="p-4 rounded-xl border border-border">
      <div className="flex items-start gap-3">
        <div className="w-10 h-14 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0 overflow-hidden">
          {session.book?.cover_url ? (
            <img src={session.book.cover_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <BookOpen size={16} className="text-muted" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-medium text-sm truncate">{session.book?.title || 'Unknown Book'}</h3>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            {session.type === 'group' && (
              <Badge variant="highlight"><Users size={10} /> {attendeeCount}/{session.max_attendees}</Badge>
            )}
          </div>
          <p className="text-xs text-muted">
            {isNarrator
              ? `Narrating · ${attendeeCount} attendee${attendeeCount !== 1 ? 's' : ''}`
              : `with ${session.narrator?.name || 'Unknown'} · Listening`
            }
          </p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Calendar size={12} /> {dateLabel}, {format(new Date(session.scheduled_at), 'h:mm a')}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} /> {session.duration_minutes} min
            </span>
            {isCompleted && didAttend && (
              <span className="text-green-600 flex items-center gap-1">✓ Attended</span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {isUpcoming && session.meeting_link ? (
            <Button size="sm" onClick={handleJoin}><Video size={14} className="mr-1" /> Join</Button>
          ) : canReview ? (
            <Link to={`/dashboard/review/${session.id}`}>
              <Button size="sm" variant="outline"><Star size={14} className="mr-1" /> Review</Button>
            </Link>
          ) : isCompleted && !isNarrator && !didAttend ? (
            <Badge variant="muted">Missed</Badge>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="p-3 rounded-lg bg-surface border border-border text-center">
      <Icon size={16} className="mx-auto text-muted mb-1" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function EmptyState({ message, cta, onClick }) {
  return (
    <div className="text-center py-12 border border-dashed border-border rounded-xl">
      <Calendar size={32} className="mx-auto text-muted mb-3" />
      <p className="text-muted text-sm">{message}</p>
      {cta && <Button size="sm" className="mt-3" onClick={onClick}>{cta}</Button>}
    </div>
  )
}

export function Dashboard() {
  const { user, profile } = useAuthStore()
  const { sessions, loading, upcoming, completed, asListener, asNarrator, narratorStats, listenerStats } = useSessions()
  const navigate = useNavigate()

  const showNarrator = profile?.role === 'narrator' || profile?.role === 'both'
  const showListener = profile?.role === 'reader' || profile?.role === 'both'

  const tabs = [
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    ...(showListener ? [{ id: 'listener', label: 'As Listener', icon: Headphones }] : []),
    ...(showNarrator ? [{ id: 'narrator', label: 'As Narrator', icon: Mic }] : []),
  ]

  const [tab, setTab] = useState('schedule')

  if (!user) {
    useSignupModal.getState().show({ type: 'signin' })
    return null
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">
            Welcome back{profile?.name ? `, ${profile.name}` : ''}.
            {profile?.role && (
              <Badge variant="muted" className="ml-2">
                {profile.role === 'both' ? 'Narrator & Listener' : profile.role === 'narrator' ? 'Narrator' : 'Listener'}
              </Badge>
            )}
          </p>
        </div>
        <Link to="/profile">
          <Button variant="ghost" size="sm"><Settings size={14} className="mr-1" /> Profile</Button>
        </Link>
      </div>

      <div className="flex gap-1 mb-6 bg-surface rounded-lg p-1 border border-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer whitespace-nowrap
              ${tab === t.id ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground'}`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted text-sm">Loading sessions...</div>
      ) : (
        <>
          {tab === 'schedule' && (
            <div className="space-y-3">
              {sessions.length === 0 ? (
                <EmptyState message="No sessions yet" cta="Browse books" onClick={() => navigate('/books')} />
              ) : (
                <>
                  {upcoming.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Upcoming</p>
                      <div className="space-y-2">
                        {upcoming.map((s) => <SessionCard key={s.id} session={s} currentUserId={user.id} onRefresh={refetch} />)}
                      </div>
                    </div>
                  )}
                  {completed.length > 0 && (
                    <div className="mt-6">
                      <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Completed</p>
                      <div className="space-y-2">
                        {completed.map((s) => <SessionCard key={s.id} session={s} currentUserId={user.id} onRefresh={refetch} />)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'listener' && (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <StatCard icon={Headphones} label="Sessions" value={listenerStats.totalSessions} />
                <StatCard icon={BookOpen} label="Books" value={listenerStats.booksDiscussed} />
              </div>
              <div className="space-y-2">
                {asListener.length === 0 ? (
                  <EmptyState message="No listening sessions yet" cta="Browse books" onClick={() => navigate('/books')} />
                ) : (
                  asListener.map((s) => <SessionCard key={s.id} session={s} currentUserId={user.id} onRefresh={refetch} />)
                )}
              </div>
            </div>
          )}

          {tab === 'narrator' && (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <StatCard icon={Mic} label="Sessions" value={narratorStats.totalSessions} />
                <StatCard icon={User} label="Readers" value={narratorStats.uniqueReaders} />
                <StatCard icon={Users} label="Attendees" value={narratorStats.totalAttendees} />
              </div>
              <div className="space-y-2">
                {asNarrator.length === 0 ? (
                  <EmptyState message="No narration sessions yet" />
                ) : (
                  asNarrator.map((s) => <SessionCard key={s.id} session={s} currentUserId={user.id} onRefresh={refetch} />)
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
