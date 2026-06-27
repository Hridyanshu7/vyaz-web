import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Video, Star, Clock, BookOpen, Calendar } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useAuthStore } from '../stores/authStore'

const MOCK_UPCOMING = [
  {
    id: 'b1',
    book: 'Sapiens',
    narrator: 'Priya Sharma',
    date: 'Tomorrow, 3:00 PM',
    duration: 30,
    meetingLink: 'https://meet.google.com/abc-defg-xyz',
    status: 'confirmed',
  },
  {
    id: 'b2',
    book: 'Zero to One',
    narrator: 'James Chen',
    date: 'Jul 2, 6:00 PM',
    duration: 45,
    meetingLink: 'https://meet.google.com/xyz-abcd-efg',
    status: 'confirmed',
  },
]

const MOCK_PAST = [
  {
    id: 'b3',
    book: 'Atomic Habits',
    narrator: 'Ravi Mehta',
    date: 'Jun 20, 4:00 PM',
    duration: 30,
    reviewed: false,
  },
  {
    id: 'b4',
    book: 'The Alchemist',
    narrator: 'Amara Obi',
    date: 'Jun 15, 2:00 PM',
    duration: 30,
    reviewed: true,
    rating: 5,
  },
]

export function Dashboard() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState('upcoming')

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold mb-2">Sign in to view your dashboard</h2>
        <div className="flex gap-3 justify-center mt-4">
          <Button onClick={() => navigate('/login')}>Log in</Button>
          <Button variant="outline" onClick={() => navigate('/signup')}>Sign up</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-1">Dashboard</h1>
      <p className="text-sm text-muted mb-6">Welcome back{profile?.name ? `, ${profile.name}` : ''}.</p>

      <div className="flex gap-1 mb-6 bg-surface rounded-lg p-1 border border-border w-fit">
        {['upcoming', 'past'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer capitalize
              ${tab === t ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'upcoming' && (
        <div className="space-y-3">
          {MOCK_UPCOMING.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-xl">
              <Calendar size={32} className="mx-auto text-muted mb-3" />
              <p className="text-muted text-sm">No upcoming sessions</p>
              <Button size="sm" className="mt-3" onClick={() => navigate('/books')}>Browse books</Button>
            </div>
          ) : (
            MOCK_UPCOMING.map((session) => (
              <div key={session.id} className="p-4 rounded-xl border border-border">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm">{session.book}</h3>
                      <Badge variant="success">Confirmed</Badge>
                    </div>
                    <p className="text-xs text-muted">with {session.narrator}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {session.date}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {session.duration} min</span>
                    </div>
                  </div>
                  <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                    <Button size="sm">
                      <Video size={14} className="mr-1" /> Join
                    </Button>
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'past' && (
        <div className="space-y-3">
          {MOCK_PAST.map((session) => (
            <div key={session.id} className="p-4 rounded-xl border border-border">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-sm">{session.book}</h3>
                  <p className="text-xs text-muted">with {session.narrator} · {session.date}</p>
                </div>
                {session.reviewed ? (
                  <Badge variant="muted">
                    <Star size={12} className="fill-highlight text-highlight" />
                    {session.rating}
                  </Badge>
                ) : (
                  <Link to={`/dashboard/review/${session.id}`}>
                    <Button size="sm" variant="outline">
                      <Star size={14} className="mr-1" /> Review
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
