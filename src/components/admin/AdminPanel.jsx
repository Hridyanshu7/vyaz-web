import { useState, useEffect } from 'react'
import { Users, BookOpen, Calendar, Check, X, Loader2, ExternalLink, User, ChevronDown } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { supabase } from '../../lib/supabase'
import { importBookFromUrl } from '../../lib/bookImport'
import { useBookStore } from '../../stores/bookStore'

const TABS = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'sessions', label: 'Group Sessions', icon: Calendar },
  { id: 'books', label: 'Book Requests', icon: BookOpen },
]

// ─────────────────────────────────────────
// 1. USER ACCESS CONTROL
// ─────────────────────────────────────────
function UserAccess() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [search, setSearch] = useState('')

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, role, is_admin, created_at, avatar_url')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  const updateRole = async (userId, role) => {
    setSaving((s) => ({ ...s, [userId]: true }))
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u))
    setSaving((s) => ({ ...s, [userId]: false }))
  }

  const toggleAdmin = async (userId, current) => {
    setSaving((s) => ({ ...s, [`${userId}_admin`]: true }))
    await supabase.from('profiles').update({ is_admin: !current }).eq('id', userId)
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_admin: !current } : u))
    setSaving((s) => ({ ...s, [`${userId}_admin`]: false }))
  }

  const filtered = users.filter((u) =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted">{users.length} users</p>
        <input
          type="text"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-highlight/20 w-56"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted text-sm">Loading users...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
              <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 overflow-hidden">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={14} className="text-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.name || '—'}</p>
                <p className="text-xs text-muted truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Role dropdown */}
                <select
                  value={u.role || 'reader'}
                  onChange={(e) => updateRole(u.id, e.target.value)}
                  disabled={saving[u.id]}
                  className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-highlight/20"
                >
                  <option value="reader">Listener</option>
                  <option value="narrator">Narrator</option>
                  <option value="both">Both</option>
                </select>

                {/* Admin toggle */}
                <button
                  onClick={() => toggleAdmin(u.id, u.is_admin)}
                  disabled={saving[`${u.id}_admin`]}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
                    ${u.is_admin ? 'bg-highlight text-white' : 'bg-surface border border-border text-muted hover:text-foreground'}`}
                >
                  {saving[`${u.id}_admin`] ? <Loader2 size={10} className="animate-spin" /> : 'Admin'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// 2. MANAGE GROUP SESSIONS
// ─────────────────────────────────────────
function GroupSessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})

  useEffect(() => { fetchSessions() }, [])

  const fetchSessions = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sessions')
      .select(`
        *,
        book:books(id, title, cover_url),
        narrator:profiles!sessions_narrator_id_fkey(id, name),
        attendees:session_attendees(id)
      `)
      .eq('type', 'group')
      .in('status', ['open', 'scheduled'])
      .gt('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
    setSessions(data || [])
    setLoading(false)
  }

  const updateStatus = async (sessionId, status) => {
    setSaving((s) => ({ ...s, [sessionId]: true }))
    await supabase.from('sessions').update({ status }).eq('id', sessionId)
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status } : s))
    setSaving((s) => ({ ...s, [sessionId]: false }))
  }

  const formatDate = (dt) => {
    const d = new Date(dt)
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      <p className="text-xs text-muted mb-4">{sessions.length} upcoming group sessions</p>
      {loading ? (
        <div className="text-center py-8 text-muted text-sm">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-8 text-muted text-sm">No upcoming group sessions.</div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
              <div className="w-8 h-12 rounded bg-surface border border-border overflow-hidden shrink-0">
                {s.book?.cover_url ? (
                  <img src={s.book.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <BookOpen size={12} className="text-muted m-auto mt-2" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.book?.title}</p>
                <p className="text-xs text-muted">
                  {s.narrator?.name} · {formatDate(s.scheduled_at)} · {s.duration_minutes} min
                </p>
                <p className="text-xs text-muted">{s.attendees?.length || 0}/{s.max_attendees} seats filled</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={s.status === 'open' ? 'success' : 'muted'}>{s.status}</Badge>
                {s.status === 'open' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving[s.id]}
                    onClick={() => updateStatus(s.id, 'cancelled')}
                    className="text-highlight border-highlight/30"
                  >
                    {saving[s.id] ? <Loader2 size={12} className="animate-spin" /> : 'Cancel'}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving[s.id]}
                    onClick={() => updateStatus(s.id, 'open')}
                  >
                    {saving[s.id] ? <Loader2 size={12} className="animate-spin" /> : 'Restore'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// 3. BOOK REQUESTS
// ─────────────────────────────────────────
function BookRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState({})
  const addBook = useBookStore((s) => s.addBook)

  useEffect(() => { fetchRequests() }, [])

  const fetchRequests = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('book_requests')
      .select('*, requester:profiles!book_requests_user_id_fkey(name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  const handleApprove = async (req) => {
    if (!req.book_url) return
    setProcessing((p) => ({ ...p, [req.id]: 'approving' }))
    try {
      const bookData = await importBookFromUrl(req.book_url, () => {})
      await addBook(bookData)
      await supabase.from('book_requests').update({ status: 'approved' }).eq('id', req.id)
      setRequests((prev) => prev.filter((r) => r.id !== req.id))
    } catch (err) {
      alert(`Failed to import: ${err.message}`)
    }
    setProcessing((p) => ({ ...p, [req.id]: null }))
  }

  const handleReject = async (reqId) => {
    setProcessing((p) => ({ ...p, [reqId]: 'rejecting' }))
    await supabase.from('book_requests').update({ status: 'rejected' }).eq('id', reqId)
    setRequests((prev) => prev.filter((r) => r.id !== reqId))
    setProcessing((p) => ({ ...p, [reqId]: null }))
  }

  return (
    <div>
      <p className="text-xs text-muted mb-4">{requests.length} pending requests</p>
      {loading ? (
        <div className="text-center py-8 text-muted text-sm">Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-8 text-muted text-sm">No pending book requests.</div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="p-3 rounded-xl border border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.book_title || 'Untitled'}</p>
                  {r.book_author && <p className="text-xs text-muted">{r.book_author}</p>}
                  <p className="text-xs text-muted mt-0.5">
                    by {r.requester?.name || 'Unknown'} · {new Date(r.created_at).toLocaleDateString('en-IN')}
                  </p>
                  {r.book_url && (
                    <a href={r.book_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-highlight hover:underline flex items-center gap-0.5 mt-0.5">
                      <ExternalLink size={10} /> View source
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.book_url && (
                    <Button
                      size="sm"
                      disabled={!!processing[r.id]}
                      onClick={() => handleApprove(r)}
                    >
                      {processing[r.id] === 'approving' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <><Check size={12} className="mr-1" /> Approve</>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!processing[r.id]}
                    onClick={() => handleReject(r.id)}
                  >
                    {processing[r.id] === 'rejecting' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <><X size={12} className="mr-1" /> Reject</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// MAIN ADMIN PANEL
// ─────────────────────────────────────────
export function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users')

  return (
    <div>
      <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap
              ${activeTab === t.id ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground'}`}
          >
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UserAccess />}
      {activeTab === 'sessions' && <GroupSessions />}
      {activeTab === 'books' && <BookRequests />}
    </div>
  )
}
