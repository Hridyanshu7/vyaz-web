import { useState, useEffect } from 'react'
import { Users, BookOpen, Calendar, Check, X, Loader2, ExternalLink, User, Tag, Plus, Eye, EyeOff } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { supabase } from '../../lib/supabase'
import { importBookFromUrl } from '../../lib/bookImport'
import { useBookStore, getBookGenres } from '../../stores/bookStore'
import { generateChapters, generateOneliners } from '../../lib/gemini'
import { parseEpub } from '../../lib/epub'
import { splitIntoSections } from '../../lib/sections'

const TABS = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'sessions', label: 'Group Sessions', icon: Calendar },
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'chapters', label: 'Chapters', icon: BookOpen },
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
      .select('id, name, email, role, is_admin, is_active, created_at, avatar_url')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  const update = async (userId, patch) => {
    const key = Object.keys(patch)[0]
    setSaving((s) => ({ ...s, [`${userId}_${key}`]: true }))
    await supabase.from('profiles').update(patch).eq('id', userId)
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...patch } : u))
    setSaving((s) => ({ ...s, [`${userId}_${key}`]: false }))
  }

  const filtered = users.filter((u) =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  )

  const active = users.filter((u) => u.is_active !== false).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted">{active} active · {users.length} total</p>
        <input
          type="text"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none w-56"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted text-sm">Loading users...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const isActive = u.is_active !== false
            return (
              <div key={u.id} className={`p-3 rounded-xl border border-border transition-opacity ${!isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 overflow-hidden">
                    {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : <User size={14} className="text-muted" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{u.name || '—'}</p>
                      {u.is_admin && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-highlight/10 text-highlight font-medium">Admin</span>}
                      {!isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface border border-border text-muted">Suspended</span>}
                    </div>
                    <p className="text-xs text-muted truncate">{u.email}</p>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 mt-2 pl-11">
                  <select
                    value={u.role || 'reader'}
                    onChange={(e) => update(u.id, { role: e.target.value })}
                    disabled={saving[`${u.id}_role`]}
                    className="text-xs px-2 py-1 rounded-lg border border-border bg-background cursor-pointer focus:outline-none"
                  >
                    <option value="reader">Listener</option>
                    <option value="narrator">Narrator</option>
                    <option value="both">Both</option>
                  </select>

                  {/* Admin toggle */}
                  <button
                    onClick={() => update(u.id, { is_admin: !u.is_admin })}
                    disabled={!!saving[`${u.id}_is_admin`]}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                      u.is_admin ? 'bg-highlight/10 border-highlight text-highlight' : 'border-border text-muted hover:text-foreground'
                    }`}
                  >
                    {saving[`${u.id}_is_admin`] ? <Loader2 size={10} className="animate-spin" /> : u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                  </button>

                  {/* Suspend / Activate */}
                  <button
                    onClick={() => update(u.id, { is_active: !isActive })}
                    disabled={!!saving[`${u.id}_is_active`]}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                      isActive ? 'border-border text-muted hover:border-red-300 hover:text-red-600' : 'border-green-200 bg-green-50 text-green-700'
                    }`}
                  >
                    {saving[`${u.id}_is_active`] ? <Loader2 size={10} className="animate-spin" /> : isActive ? 'Suspend' : 'Activate'}
                  </button>
                </div>
              </div>
            )
          })}
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
// 5. GENRE TAGS
// ─────────────────────────────────────────

function FilterPillManager({ pills, onRefresh }) {
  const [newPill, setNewPill] = useState('')
  const [saving, setSaving] = useState(false)

  const addPill = async () => {
    const name = newPill.trim()
    if (!name || pills.includes(name)) return
    setSaving(true)
    await supabase.from('genre_filters').insert({ name, sort_order: pills.length + 1 })
    setNewPill('')
    setSaving(false)
    onRefresh()
  }

  const removePill = async (name) => {
    await supabase.from('genre_filters').delete().eq('name', name)
    onRefresh()
  }

  return (
    <div className="p-3 rounded-xl border border-border bg-surface mb-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted mb-2">Filter Pills (Browse page)</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {pills.map((p) => (
          <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-background border border-border text-xs font-medium">
            {p}
            <button onClick={() => removePill(p)} className="text-muted hover:text-highlight cursor-pointer">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={newPill}
          onChange={(e) => setNewPill(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPill()}
          placeholder="Add filter pill..."
          className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-highlight/20"
        />
        <Button size="sm" disabled={saving || !newPill.trim()} onClick={addPill}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <><Plus size={12} className="mr-1" /> Add</>}
        </Button>
      </div>
    </div>
  )
}

function GenreTags() {
  const [books, setBooks] = useState([])
  const [pills, setPills] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [newTag, setNewTag] = useState({})
  const [search, setSearch] = useState('')
  const updateBookGenres = useBookStore((s) => s.updateBookGenres)

  useEffect(() => { fetchBooks(); fetchPills() }, [])

  const fetchPills = async () => {
    const { data } = await supabase.from('genre_filters').select('name').order('sort_order')
    if (data) setPills(data.map((r) => r.name))
  }

  const fetchBooks = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('books')
      .select('id, title, author, cover_url, genres, goodreads_data, is_published')
      .order('title')
    setBooks(data || [])
    setLoading(false)
  }

  const togglePublished = async (book) => {
    setSaving((s) => ({ ...s, [`pub_${book.id}`]: true }))
    await supabase.from('books').update({ is_published: !book.is_published }).eq('id', book.id)
    setBooks((prev) => prev.map((b) => b.id === book.id ? { ...b, is_published: !b.is_published } : b))
    setSaving((s) => ({ ...s, [`pub_${book.id}`]: false }))
  }

  const removeTag = async (bookId, tag) => {
    const book = books.find((b) => b.id === bookId)
    const updated = (book.genres || []).filter((g) => g !== tag)
    setSaving((s) => ({ ...s, [bookId]: true }))
    try {
      await updateBookGenres(bookId, updated)
      setBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, genres: updated } : b))
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving((s) => ({ ...s, [bookId]: false }))
    }
  }

  const addTag = async (bookId) => {
    const tag = (newTag[bookId] || '').trim()
    if (!tag) return
    const book = books.find((b) => b.id === bookId)
    const existing = book.genres || []
    if (existing.includes(tag)) { setNewTag((n) => ({ ...n, [bookId]: '' })); return }
    const updated = [...existing, tag]
    setSaving((s) => ({ ...s, [bookId]: true }))
    try {
      await updateBookGenres(bookId, updated)
      setBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, genres: updated } : b))
      setNewTag((n) => ({ ...n, [bookId]: '' }))
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving((s) => ({ ...s, [bookId]: false }))
    }
  }

  const getDisplayGenres = (book) => getBookGenres(book)

  const filtered = books.filter((b) =>
    !search || b.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <FilterPillManager pills={pills} onRefresh={() => { fetchPills(); useBookStore.getState().fetchFilterPills() }} />

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted">{books.length} books</p>
        <input
          type="text"
          placeholder="Search books..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none w-48"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted text-sm">Loading books...</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((book) => {
            const bookGenres = getDisplayGenres(book)
            const matchingPills = pills.filter((p) => bookGenres.includes(p))
            const noMatch = matchingPills.length === 0
            return (
            <div key={book.id} className={`p-3 rounded-xl border border-border transition-opacity ${!book.is_published ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2 mb-1.5">
                {book.cover_url && (
                  <img src={book.cover_url} alt="" className="w-7 h-10 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{book.title}</p>
                  <p className="text-xs text-muted">{book.author}</p>
                </div>
                <button
                  onClick={() => togglePublished(book)}
                  disabled={saving[`pub_${book.id}`]}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium cursor-pointer shrink-0 transition-colors ${
                    book.is_published
                      ? 'border-border text-muted hover:border-highlight hover:text-highlight'
                      : 'border-green-200 bg-green-50 text-green-700'
                  }`}
                >
                  {saving[`pub_${book.id}`] ? <Loader2 size={10} className="animate-spin" /> :
                   book.is_published ? <><EyeOff size={10} /> De-list</> : <><Eye size={10} /> List</>}
                </button>
                {saving[book.id] && <Loader2 size={12} className="animate-spin text-muted shrink-0" />}
              </div>
              {/* Filter pill indicator */}
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px] text-muted uppercase tracking-wider">Under:</span>
                {matchingPills.length > 0 ? matchingPills.map((p) => (
                  <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-highlight/10 text-highlight font-medium">{p}</span>
                )) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-muted">Miscellaneous</span>
                )}
              </div>

              {/* Current tags */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {getDisplayGenres(book).map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface border border-border text-xs">
                    {tag}
                    <button
                      onClick={() => removeTag(book.id, tag)}
                      className="text-muted hover:text-highlight cursor-pointer"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {getDisplayGenres(book).length === 0 && (
                  <span className="text-xs text-muted italic">No tags set</span>
                )}
              </div>

              {/* Add tag */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newTag[book.id] || ''}
                  onChange={(e) => setNewTag((n) => ({ ...n, [book.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addTag(book.id)}
                  placeholder="Add genre tag..."
                  className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-highlight/20"
                />
                <button
                  onClick={() => addTag(book.id)}
                  className="px-2 py-1 rounded border border-border bg-surface hover:bg-background text-xs cursor-pointer"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// 5. CHAPTERS
// ─────────────────────────────────────────
const SETTINGS_KEYS = ['gemini_api_key', 'gemini_chapters_prompt', 'cartesia_api_key', 'cartesia_agent_id', 'cartesia_voice_id', 'voice_agent_system_prompt']

function GeminiSettings() {
  const [vals, setVals] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('platform_settings')
      .select('key, value')
      .in('key', SETTINGS_KEYS)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach((r) => { map[r.key] = r.value })
        setVals(map)
      })
  }, [])

  const set = (key, value) => setVals((v) => ({ ...v, [key]: value }))

  const save = async () => {
    setSaving(true)
    await Promise.all(
      SETTINGS_KEYS.map((key) =>
        supabase.from('platform_settings').upsert({ key, value: vals[key] || '', updated_at: new Date().toISOString() })
      )
    )
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const placeholders = (keys) => keys.map((k) => <code key={k} className="bg-background px-1 rounded mx-0.5">{`{${k}}`}</code>)

  return (
    <div className="p-3 rounded-xl border border-border bg-surface mb-4 space-y-4">

      {/* Gemini */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Gemini (Chapter Generation)</p>
        <div>
          <label className="text-xs text-muted mb-1 block">API Key</label>
          <input type="password" value={vals.gemini_api_key || ''} onChange={(e) => set('gemini_api_key', e.target.value)}
            placeholder="AIza..." className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono" />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Chapters Prompt — use {placeholders(['title', 'author'])}</label>
          <textarea value={vals.gemini_chapters_prompt || ''} onChange={(e) => set('gemini_chapters_prompt', e.target.value)}
            rows={4} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono resize-y" />
        </div>
      </div>

      <hr className="border-border" />

      {/* Cartesia */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Cartesia (Voice Agent)</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted mb-1 block">API Key</label>
            <input type="password" value={vals.cartesia_api_key || ''} onChange={(e) => set('cartesia_api_key', e.target.value)}
              placeholder="sk-..." className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Agent ID</label>
            <input type="text" value={vals.cartesia_agent_id || ''} onChange={(e) => set('cartesia_agent_id', e.target.value)}
              placeholder="agent uuid..." className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Voice ID</label>
            <input type="text" value={vals.cartesia_voice_id || ''} onChange={(e) => set('cartesia_voice_id', e.target.value)}
              placeholder="voice uuid..." className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">
            Voice Agent System Prompt — use {placeholders(['book_title', 'author', 'chapter_title', 'oneliner', 'content'])}
          </label>
          <textarea value={vals.voice_agent_system_prompt || ''} onChange={(e) => set('voice_agent_system_prompt', e.target.value)}
            rows={10} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono resize-y"
            placeholder={`You are a Socratic guide for the chapter "{chapter_title}" from {book_title} by {author}.\n\nChapter summary: {oneliner}\n\nChapter content:\n{content}\n\nHelp the reader explore the ideas...`} />
        </div>
      </div>

      <Button size="sm" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
        {saved ? '✓ Saved' : 'Save Settings'}
      </Button>
    </div>
  )
}

function Chapters() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState({})
  const [generatingAll, setGeneratingAll] = useState(false)

  useEffect(() => { fetchBooks() }, [])

  const fetchBooks = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('books')
      .select('id, title, author, cover_url, chapters')
      .order('title')
    setBooks(data || [])
    setLoading(false)
  }

  const saveChapters = async (bookId, chapters) => {
    await supabase.from('books').update({ chapters }).eq('id', bookId)
    setBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, chapters } : b))
  }

  const uploadEpub = async (book, file) => {
    setStatus((s) => ({ ...s, [book.id]: 'parsing' }))
    try {
      const epubChapters = await parseEpub(file)

      // Merge: if book already has chapters from Gemini, keep title+oneliner, add content
      const existing = book.chapters || []
      const merged = epubChapters.map((ec, i) => {
        const match = existing[i] || existing.find((e) =>
          e.title?.toLowerCase().includes(ec.title?.toLowerCase().slice(0, 10))
        )
        return {
          number: ec.number,
          title: match?.title || ec.title,
          oneliner: match?.oneliner || '',
          content: ec.content,
        }
      })

      await saveChapters(book.id, merged)
      setStatus((s) => ({ ...s, [book.id]: 'done' }))
    } catch (err) {
      setStatus((s) => ({ ...s, [book.id]: `error: ${err.message.slice(0, 60)}` }))
    }
  }

  const generate = async (book) => {
    setStatus((s) => ({ ...s, [book.id]: 'generating' }))
    try {
      const hasContent = book.chapters?.some((ch) => ch.content)

      if (hasContent) {
        // EPUB content available — generate oneliners grounded in actual text
        const oneliners = await generateOneliners(book.title, book.author, book.chapters)
        const merged = book.chapters.map((ch) => {
          const match = oneliners.find((o) => o.number === ch.number)
          return { ...ch, oneliner: match?.oneliner || ch.oneliner || '' }
        })
        await saveChapters(book.id, merged)
      } else {
        // No EPUB content — generate chapters + oneliners from model memory
        const chapters = await generateChapters(book.title, book.author)
        await saveChapters(book.id, chapters)
      }

      setStatus((s) => ({ ...s, [book.id]: 'done' }))
    } catch (err) {
      setStatus((s) => ({ ...s, [book.id]: `error: ${err.message.slice(0, 60)}` }))
    }
  }

  const splitSections = async (book) => {
    if (!book.chapters?.some((ch) => ch.content)) return
    setStatus((s) => ({ ...s, [book.id]: 'splitting' }))
    try {
      const updated = book.chapters.map((ch) => ({
        ...ch,
        sections: ch.content ? splitIntoSections(ch.content) : (ch.sections || []),
      }))
      await saveChapters(book.id, updated)
      setBooks((prev) => prev.map((b) => b.id === book.id ? { ...b, chapters: updated } : b))
      const totalSections = updated.reduce((acc, ch) => acc + (ch.sections?.length || 0), 0)
      setStatus((s) => ({ ...s, [book.id]: `split-done:${totalSections}` }))
    } catch (err) {
      setStatus((s) => ({ ...s, [book.id]: `error: ${err.message.slice(0, 60)}` }))
    }
  }

  const syncToKB = async (book) => {
    setStatus((s) => ({ ...s, [book.id]: 'syncing' }))
    try {
      const { data, error } = await supabase.functions.invoke('cartesia-kb-sync', {
        body: { bookId: book.id },
      })
      if (error) throw new Error(error.message)
      if (data.error) throw new Error(data.error)
      setBooks((prev) => prev.map((b) => b.id === book.id ? { ...b, cartesia_folder_id: data.folderId } : b))
      setStatus((s) => ({ ...s, [book.id]: `kb-done:${data.synced}/${data.synced + data.failed}` }))
      await fetchBooks()
    } catch (err) {
      setStatus((s) => ({ ...s, [book.id]: `error: ${err.message.slice(0, 60)}` }))
    }
  }

  const generateAll = async () => {
    setGeneratingAll(true)
    const pending = books.filter((b) => !b.chapters?.length)
    for (let i = 0; i < pending.length; i++) {
      const book = pending[i]
      await generate(book)
      if (i < pending.length - 1) {
        // 4.5s between requests to respect 15 req/min free tier
        await new Promise((r) => setTimeout(r, 4500))
      }
    }
    setGeneratingAll(false)
  }

  const pending = books.filter((b) => !b.chapters?.length)
  const done = books.filter((b) => b.chapters?.length > 0)

  return (
    <div>
      <GeminiSettings />
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted">{done.length}/{books.length} books have chapters</p>
          {pending.length > 0 && (
            <p className="text-xs text-muted">{pending.length} pending</p>
          )}
        </div>
        {pending.length > 0 && (
          <Button size="sm" disabled={generatingAll} onClick={generateAll}>
            {generatingAll ? <><Loader2 size={12} className="animate-spin mr-1" /> Generating...</> : `Generate All (${pending.length})`}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted text-sm">Loading books...</div>
      ) : (
        <div className="space-y-2">
          {books.map((book) => {
            const s = status[book.id]
            const hasChapters = book.chapters?.length > 0
            return (
              <div key={book.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                {book.cover_url && (
                  <img src={book.cover_url} alt="" className="w-7 h-10 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{book.title}</p>
                  <p className="text-xs text-muted">{book.author}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {hasChapters && (
                      <span className="text-[10px] text-muted">{book.chapters.length} chapters</span>
                    )}
                    {hasChapters && book.chapters.some((ch) => ch.sections?.length > 0) && (
                      <span className="text-[10px] text-muted">
                        · {book.chapters.reduce((a, ch) => a + (ch.sections?.length || 0), 0)} sections
                      </span>
                    )}
                    {book.cartesia_folder_id ? (
                      <span className="text-[10px] text-green-600">✓ KB synced</span>
                    ) : hasChapters && book.chapters.some((ch) => ch.content) ? (
                      <span className="text-[10px] text-amber-600">KB not synced</span>
                    ) : null}
                  </div>
                  {s && (
                    <p className={`text-xs mt-0.5 ${s === 'done' || s.startsWith('kb-done') || s.startsWith('split-done') ? 'text-green-600' : s.startsWith('error') ? 'text-highlight' : 'text-muted'}`}>
                      {s === 'done' ? `✓ chapters saved` :
                       s === 'generating' ? 'Generating via Gemini...' :
                       s === 'parsing' ? 'Parsing EPUB...' :
                       s === 'splitting' ? 'Splitting into sections...' :
                       s === 'syncing' ? 'Syncing to Cartesia KB...' :
                       s.startsWith('split-done') ? `✓ ${s.split(':')[1]} sections created` :
                       s.startsWith('kb-done') ? `✓ KB synced (${s.split(':')[1]})` : s}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Upload EPUB */}
                  <label className={`px-2 py-1 text-xs rounded border border-border bg-surface hover:bg-background cursor-pointer transition-colors ${(s === 'parsing' || generatingAll) ? 'opacity-50 pointer-events-none' : ''}`}>
                    {s === 'parsing' ? <Loader2 size={12} className="animate-spin" /> : 'EPUB'}
                    <input
                      type="file"
                      accept=".epub"
                      className="hidden"
                      onChange={(e) => { if (e.target.files[0]) uploadEpub(book, e.target.files[0]) }}
                    />
                  </label>
                  {/* Split into sections */}
                  {hasChapters && book.chapters.some((ch) => ch.content) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={s === 'splitting' || generatingAll}
                      onClick={() => splitSections(book)}
                    >
                      {s === 'splitting' ? <Loader2 size={12} className="animate-spin" /> : 'Split'}
                    </Button>
                  )}

                  {/* Sync to Cartesia KB */}
                  {hasChapters && book.chapters.some((ch) => ch.content) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={s === 'syncing' || generatingAll}
                      onClick={() => syncToKB(book)}
                    >
                      {s === 'syncing' ? <Loader2 size={12} className="animate-spin" /> : book.cartesia_folder_id ? 'Re-sync KB' : 'Sync KB'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={hasChapters ? 'outline' : 'primary'}
                    disabled={s === 'generating' || s === 'parsing' || generatingAll}
                    onClick={() => generate(book)}
                  >
                    {s === 'generating' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : hasChapters ? (
                      'Regenerate'
                    ) : (
                      'Generate'
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// BOOKS TAB (Catalog + Requested)
// ─────────────────────────────────────────
function BooksTab() {
  const [sub, setSub] = useState('catalog')
  return (
    <div>
      <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border mb-4">
        <button
          onClick={() => setSub('catalog')}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${sub === 'catalog' ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground'}`}
        >
          Catalog
        </button>
        <button
          onClick={() => setSub('requested')}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${sub === 'requested' ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground'}`}
        >
          Requested
        </button>
      </div>
      {sub === 'catalog' && <GenreTags />}
      {sub === 'requested' && <BookRequests />}
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
      {activeTab === 'books' && <BooksTab />}
      {activeTab === 'chapters' && <Chapters />}
    </div>
  )
}
