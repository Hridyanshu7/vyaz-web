import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Users, BookOpen, Calendar, Check, X, Loader2, ExternalLink, User, Tag, Plus, Eye, EyeOff, Bot } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { supabase } from '../../lib/supabase'
import { importBookFromUrl } from '../../lib/bookImport'
import { useBookStore, getBookGenres } from '../../stores/bookStore'
import { useAdminStore } from '../../stores/adminStore'
import { useAdminDataStore } from '../../stores/adminDataStore'
import { generateChapters, generateOneliners } from '../../lib/gemini'
import { parseEpub } from '../../lib/epub'
import { splitIntoSections } from '../../lib/sections'

const TABS = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'sessions', label: 'Group Sessions', icon: Calendar },
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'agents', label: 'Agents', icon: Bot },
]

// ─────────────────────────────────────────
// 1. USER ACCESS CONTROL
// ─────────────────────────────────────────
function UserAccess() {
  const { users: original, updateUser, loading } = useAdminDataStore()
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const { userChanges, setUserChange, clearUserChanges } = useAdminStore()

  // Merge original DB data with any pending changes from store
  const users = original.map((u) => ({ ...u, ...(userChanges[u.id] || {}) }))

  const patch = (userId, changes) => setUserChange(userId, changes)

  const dirty = Object.keys(userChanges)
  const dirtyCount = dirty.length

  const saveAll = async () => {
    setSaving(true)
    const results = await Promise.all(
      dirty.map(async (userId) => {
        const u = users.find((x) => x.id === userId)
        const { error } = await supabase.from('profiles').update({
          role: u.role, is_admin: u.is_admin, is_active: u.is_active,
        }).eq('id', userId)
        if (!error) updateUser(userId, { role: u.role, is_admin: u.is_admin, is_active: u.is_active })
        return { userId, error }
      })
    )
    const failed = results.filter((r) => r.error)
    if (failed.length > 0) {
      alert(`${failed.length} update(s) failed: ${failed[0].error.message}`)
    } else {
      clearUserChanges()
    }
    setSaving(false)
  }

  const filtered = users.filter((u) =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted">{users.filter((u) => u.is_active !== false).length} active · {users.length} total</p>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <Button size="sm" onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
              Save {dirtyCount} change{dirtyCount > 1 ? 's' : ''}
            </Button>
          )}
          <input type="text" placeholder="Search..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none w-44" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted text-sm">Loading users...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const isActive = u.is_active !== false
            const isDirty = !!userChanges[u.id]
            return (
              <div key={u.id} className={`p-3 rounded-xl border transition-opacity ${!isActive ? 'opacity-50' : ''} ${isDirty ? 'border-highlight/40 bg-highlight/5' : 'border-border'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 overflow-hidden">
                    {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : <User size={14} className="text-muted" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{u.name || '—'}</p>
                      {u.is_admin && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-highlight/10 text-highlight font-medium">Admin</span>}
                      {!isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface border border-border text-muted">Suspended</span>}
                      {isDirty && <span className="text-[10px] text-highlight">● unsaved</span>}
                    </div>
                    <p className="text-xs text-muted truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 pl-11">
                  <select value={u.role || 'reader'} onChange={(e) => patch(u.id, { role: e.target.value })}
                    className="text-xs px-2 py-1 rounded-lg border border-border bg-background cursor-pointer focus:outline-none">
                    <option value="reader">Listener</option>
                    <option value="narrator">Narrator</option>
                    <option value="both">Both</option>
                  </select>
                  <button onClick={() => patch(u.id, { is_admin: !u.is_admin })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${u.is_admin ? 'bg-highlight/10 border-highlight text-highlight' : 'border-border text-muted hover:text-foreground'}`}>
                    {u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                  </button>
                  <button onClick={() => patch(u.id, { is_active: !isActive })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${isActive ? 'border-border text-muted hover:border-red-300 hover:text-red-600' : 'border-green-200 bg-green-50 text-green-700'}`}>
                    {isActive ? 'Suspend' : 'Activate'}
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
  const { groupSessions, loading, updateSession } = useAdminDataStore()
  const [saving, setSaving] = useState({})

  // Filter to upcoming group sessions
  const sessions = groupSessions.filter((s) =>
    s.type === 'group' &&
    ['open', 'scheduled'].includes(s.status) &&
    new Date(s.scheduled_at) > new Date()
  ).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))

  const updateStatus = async (sessionId, status) => {
    setSaving((s) => ({ ...s, [sessionId]: true }))
    await supabase.from('sessions').update({ status }).eq('id', sessionId)
    updateSession(sessionId, { status })
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
// 5. BOOKS CATALOG
// ─────────────────────────────────────────

function FilterPillManager() {
  const { filterPills: pills, addFilterPill, removeFilterPill } = useAdminDataStore()
  const [newPill, setNewPill] = useState('')
  const [saving, setSaving] = useState(false)

  const addPill = async () => {
    const name = newPill.trim()
    if (!name || pills.includes(name)) return
    setSaving(true)
    await supabase.from('genre_filters').insert({ name, sort_order: pills.length + 1 })
    addFilterPill(name)
    useBookStore.getState().fetchFilterPills()
    setNewPill('')
    setSaving(false)
  }

  const removePill = async (name) => {
    await supabase.from('genre_filters').delete().eq('name', name)
    removeFilterPill(name)
    useBookStore.getState().fetchFilterPills()
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

function BooksCatalog() {
  const { adminBooks: original, filterPills: pills, loading, updateBook, addFilterPill, removeFilterPill } = useAdminDataStore()
  const [savingAll, setSavingAll] = useState(false)
  const [search, setSearch] = useState('')
  const {
    bookChanges, setBookChange, clearBookChanges,
    opStatus, opProgress, setOpStatus, setOpProgress, clearOpProgress,
    newTag, setNewTag,
  } = useAdminStore()

  // Merge DB data with pending changes
  const books = original.map((b) => ({ ...b, ...(bookChanges[b.id] || {}) }))
  const dirtyBookIds = Object.keys(bookChanges)

  const saveAll = async () => {
    setSavingAll(true)
    const results = await Promise.all(
      dirtyBookIds.map(async (bookId) => {
        const b = books.find((x) => x.id === bookId)
        const { error } = await supabase.from('books').update({ genres: b.genres, is_published: b.is_published }).eq('id', bookId)
        return { bookId, error }
      })
    )
    const failed = results.filter((r) => r.error)
    if (failed.length > 0) {
      alert(`${failed.length} update(s) failed: ${failed[0].error.message}`)
    } else {
      dirtyBookIds.forEach((bookId) => {
        const b = books.find((x) => x.id === bookId)
        updateBook(bookId, { genres: b.genres, is_published: b.is_published })
      })
      clearBookChanges()
    }
    setSavingAll(false)
  }

  const togglePublished = (book) =>
    setBookChange(book.id, { is_published: !book.is_published, genres: book.genres })

  // ── Chapter actions ──
  const setOp = (bookId, val) => setOpStatus(bookId, val)
  const setProgress = (bookId, value, label) => setOpProgress(bookId, value, label)
  const clearProgress = (bookId) => clearOpProgress(bookId)

  const saveChapters = async (bookId, chapters) => {
    await supabase.from('books').update({ chapters }).eq('id', bookId)
    updateBook(bookId, { chapters })
  }

  const uploadEpub = async (book, file) => {
    setOp(book.id, 'parsing')
    try {
      const epubChapters = await parseEpub(file)
      const existing = book.chapters || []
      const merged = epubChapters.map((ec, i) => {
        const match = existing[i] || existing.find((e) => e.title?.toLowerCase().includes(ec.title?.toLowerCase().slice(0, 10)))
        return { number: ec.number, title: match?.title || ec.title, oneliner: match?.oneliner || '', content: ec.content }
      })
      await saveChapters(book.id, merged)
      setOp(book.id, 'done')
    } catch (err) { setOp(book.id, `error: ${err.message.slice(0, 50)}`) }
  }

  const generate = async (book) => {
    setOp(book.id, 'generating')
    setProgress(book.id, null, 'Asking Gemini...')
    try {
      const hasContent = book.chapters?.some((ch) => ch.content)
      if (hasContent) {
        const results = await generateOneliners(book.title, book.author, book.chapters)
        const merged = book.chapters.map((ch) => {
          const match = results.find((o) => o.number === ch.number)
          const updatedSections = (ch.sections || []).map((s) => {
            const secMatch = match?.sections?.find((ms) => ms.number === s.number)
            return secMatch?.title ? { ...s, title: secMatch.title } : s
          })
          return { ...ch, oneliner: match?.oneliner || ch.oneliner || '', sections: updatedSections }
        })
        await saveChapters(book.id, merged)
      } else {
        const chapters = await generateChapters(book.title, book.author)
        await saveChapters(book.id, chapters)
      }
      clearProgress(book.id)
      setOp(book.id, 'done')
    } catch (err) {
      clearProgress(book.id)
      setOp(book.id, `error: ${err.message.slice(0, 50)}`)
    }
  }

  const splitSections = async (book) => {
    if (!book.chapters?.some((ch) => ch.content)) return
    setOp(book.id, 'splitting')
    const chapters = book.chapters.filter((ch) => ch.content)
    try {
      const updated = book.chapters.map((ch, i) => {
        if (!ch.content) return { ...ch, sections: ch.sections || [] }
        const sections = splitIntoSections(ch.content)
        const pct = Math.round(((i + 1) / chapters.length) * 100)
        setProgress(book.id, pct, `Splitting ch ${i + 1}/${chapters.length}`)
        return { ...ch, sections }
      })
      await saveChapters(book.id, updated)
      const total = updated.reduce((a, ch) => a + (ch.sections?.length || 0), 0)
      clearProgress(book.id)
      setOp(book.id, `split-done:${total}`)
    } catch (err) {
      clearProgress(book.id)
      setOp(book.id, `error: ${err.message.slice(0, 50)}`)
    }
  }

  const syncToKB = async (book) => {
    setOp(book.id, 'syncing')
    const chapters = book.chapters?.filter((ch) => ch.content || ch.sections?.length) || []
    try {
      // Sync chapter by chapter so we can show real progress
      let folderId = book.cartesia_folder_id
      let synced = 0
      for (let i = 0; i < chapters.length; i++) {
        setProgress(book.id, Math.round(((i) / chapters.length) * 100), `Syncing ch ${i + 1}/${chapters.length}`)
        const { data, error } = await supabase.functions.invoke('cartesia-kb-sync', {
          body: { bookId: book.id, chapterNumber: chapters[i].number }
        })
        if (error) throw new Error(error.message)
        if (data?.error) throw new Error(data.error)
        if (data?.folderId) folderId = data.folderId
        synced += data?.synced || 0
      }
      updateBook(book.id, { cartesia_folder_id: folderId })
      clearProgress(book.id)
      setOp(book.id, `kb-done:${synced}`)
    } catch (err) {
      clearProgress(book.id)
      setOp(book.id, `error: ${err.message.slice(0, 50)}`)
    }
  }

  const removeTag = (bookId, tag) => {
    const book = books.find((b) => b.id === bookId)
    setBookChange(bookId, { genres: (book.genres || []).filter((g) => g !== tag), is_published: book.is_published })
  }

  const addTag = (bookId) => {
    const tag = (newTag[bookId] || '').trim()
    if (!tag) return
    const book = books.find((b) => b.id === bookId)
    if ((book.genres || []).includes(tag)) return
    setBookChange(bookId, { genres: [...(book.genres || []), tag], is_published: book.is_published })
    setNewTag((n) => ({ ...n, [bookId]: '' }))
  }

  const getDisplayGenres = (book) => getBookGenres(book)

  const filtered = books.filter((b) =>
    !search || b.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <FilterPillManager />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted">{books.length} books</p>
          {dirtyBookIds.length > 0 && (
            <Button size="sm" onClick={saveAll} disabled={savingAll}>
              {savingAll ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
              Save {dirtyBookIds.length} change{dirtyBookIds.length > 1 ? 's' : ''}
            </Button>
          )}
        </div>
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
            const isBookDirty = !!bookChanges[book.id]
            return (
            <div key={book.id} className={`p-3 rounded-xl border transition-opacity ${!book.is_published ? 'opacity-50' : ''} ${isBookDirty ? 'border-highlight/40 bg-highlight/5' : 'border-border'}`}>
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
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium cursor-pointer shrink-0 transition-colors ${
                    book.is_published
                      ? 'border-border text-muted hover:border-highlight hover:text-highlight'
                      : 'border-green-200 bg-green-50 text-green-700'
                  }`}
                >
                  {book.is_published ? <><EyeOff size={10} /> De-list</> : <><Eye size={10} /> List</>}
                </button>
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
                <button onClick={() => addTag(book.id)} className="px-2 py-1 rounded border border-border bg-surface hover:bg-background text-xs cursor-pointer">
                  <Plus size={12} />
                </button>
              </div>

              {/* Chapter actions */}
              {(() => {
                const op = opStatus[book.id]
                const prog = opProgress[book.id]
                const isRunning = op === 'generating' || op === 'parsing' || op === 'splitting' || op === 'syncing'
                const hasChapters = book.chapters?.length > 0
                const hasContent = book.chapters?.some((ch) => ch.content)
                const chCount = book.chapters?.length || 0
                const secCount = book.chapters?.reduce((a, ch) => a + (ch.sections?.length || 0), 0) || 0
                return (
                  <div className="border-t border-border pt-2 mt-1">
                    {/* Progress bar */}
                    {isRunning && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-muted">{prog?.label || (op === 'generating' ? 'Asking Gemini...' : op === 'parsing' ? 'Parsing EPUB...' : op === 'splitting' ? 'Splitting...' : 'Syncing KB...')}</span>
                          {prog?.value != null && <span className="text-[10px] text-muted">{prog.value}%</span>}
                        </div>
                        <div className="w-full h-1 bg-surface rounded-full overflow-hidden">
                          {prog?.value != null ? (
                            <div className="h-full bg-highlight rounded-full transition-all duration-300" style={{ width: `${prog.value}%` }} />
                          ) : (
                            <div className="h-full bg-highlight rounded-full animate-pulse" style={{ width: '100%' }} />
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {chCount > 0 && <span className="text-[10px] text-muted">{chCount} ch{secCount > 0 ? ` · ${secCount} sec` : ''}</span>}
                        {book.cartesia_folder_id ? <span className="text-[10px] text-green-600">✓ KB</span> :
                         hasContent ? <span className="text-[10px] text-amber-600">KB not synced</span> : null}
                        {op && !isRunning && <span className={`text-[10px] ${op === 'done' || op.startsWith('kb-done') || op.startsWith('split-done') ? 'text-green-600' : op.startsWith('error') ? 'text-red-500' : 'text-muted'}`}>
                          {op === 'done' ? '✓ saved' : op.startsWith('split-done') ? `✓ ${op.split(':')[1]} sections` : op.startsWith('kb-done') ? `✓ KB synced` : op}
                        </span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className={`px-2 py-1 text-[10px] rounded border border-border bg-surface hover:bg-background cursor-pointer ${op === 'parsing' ? 'opacity-50 pointer-events-none' : ''}`}>
                          {op === 'parsing' ? <Loader2 size={10} className="animate-spin" /> : 'EPUB'}
                          <input type="file" accept=".epub" className="hidden" onChange={(e) => { if (e.target.files[0]) uploadEpub(book, e.target.files[0]) }} />
                        </label>
                        {hasContent && (
                          <button onClick={() => splitSections(book)} disabled={op === 'splitting'} className="px-2 py-1 text-[10px] rounded border border-border bg-surface hover:bg-background cursor-pointer disabled:opacity-40">
                            {op === 'splitting' ? <Loader2 size={10} className="animate-spin" /> : 'Split'}
                          </button>
                        )}
                        {hasContent && (
                          <button onClick={() => syncToKB(book)} disabled={op === 'syncing'} className="px-2 py-1 text-[10px] rounded border border-border bg-surface hover:bg-background cursor-pointer disabled:opacity-40">
                            {op === 'syncing' ? <Loader2 size={10} className="animate-spin" /> : book.cartesia_folder_id ? 'Re-sync' : 'Sync KB'}
                          </button>
                        )}
                        <button onClick={() => generate(book)} disabled={op === 'generating' || op === 'parsing'} className="px-2 py-1 text-[10px] rounded border border-border bg-surface hover:bg-background cursor-pointer disabled:opacity-40">
                          {op === 'generating' ? <Loader2 size={10} className="animate-spin" /> : hasChapters ? 'Regen' : 'Generate'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// 5. AGENTS
// ─────────────────────────────────────────
function useProviderSettings(keys) {
  const { platformSettings, updateSetting } = useAdminDataStore()
  const [localVals, setLocalVals] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Seed local state from store on first render
  useEffect(() => {
    const map = {}
    keys.forEach((k) => { map[k] = platformSettings[k] || '' })
    setLocalVals(map)
  }, [platformSettings])

  const vals = localVals
  const set = (key, value) => setLocalVals((v) => ({ ...v, [key]: value }))

  const save = async () => {
    setSaving(true)
    await Promise.all(keys.map((key) =>
      supabase.from('platform_settings').upsert({ key, value: vals[key] || '', updated_at: new Date().toISOString() })
    ))
    keys.forEach((key) => updateSetting(key, vals[key] || ''))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return { vals, set, save, saving, saved }
}

function ProviderCard({ title, icon: Icon, secretsContent, promptsContent }) {
  const [view, setView] = useState('secrets')
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-muted" />
          <p className="text-sm font-medium">{title}</p>
        </div>
        <div className="flex gap-1 bg-background rounded-lg p-0.5 border border-border">
          {['secrets', 'prompts'].map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer capitalize
                ${view === v ? 'bg-foreground text-background' : 'text-muted hover:text-foreground'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        {view === 'secrets' ? secretsContent : promptsContent}
      </div>
    </div>
  )
}

function ph(keys) {
  return keys.map((k) => <code key={k} className="bg-surface px-1 rounded mx-0.5 text-[10px]">{`{${k}}`}</code>)
}

function GeminiCard() {
  const { vals, set, save, saving, saved } = useProviderSettings(['gemini_api_key', 'gemini_chapters_prompt'])
  return (
    <ProviderCard
      title="Gemini"
      icon={Bot}
      secretsContent={
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">API Key</label>
            <input type="password" value={vals.gemini_api_key || ''} onChange={(e) => set('gemini_api_key', e.target.value)}
              placeholder="AIza..." className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono" />
          </div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
            {saved ? '✓ Saved' : 'Save'}
          </Button>
        </div>
      }
      promptsContent={
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Chapters Prompt — use {ph(['title', 'author'])}</label>
            <textarea value={vals.gemini_chapters_prompt || ''} onChange={(e) => set('gemini_chapters_prompt', e.target.value)}
              rows={6} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono resize-y" />
          </div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
            {saved ? '✓ Saved' : 'Save'}
          </Button>
        </div>
      }
    />
  )
}

function CartesiaCard() {
  const { vals, set, save, saving, saved } = useProviderSettings(['cartesia_api_key', 'cartesia_agent_id', 'cartesia_voice_id', 'voice_agent_system_prompt'])
  return (
    <ProviderCard
      title="Cartesia"
      icon={Bot}
      secretsContent={
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">API Key</label>
              <input type="password" value={vals.cartesia_api_key || ''} onChange={(e) => set('cartesia_api_key', e.target.value)}
                placeholder="sk-..." className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Agent ID</label>
              <input type="text" value={vals.cartesia_agent_id || ''} onChange={(e) => set('cartesia_agent_id', e.target.value)}
                placeholder="agent_..." className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Voice ID</label>
              <input type="text" value={vals.cartesia_voice_id || ''} onChange={(e) => set('cartesia_voice_id', e.target.value)}
                placeholder="voice uuid..." className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono" />
            </div>
          </div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
            {saved ? '✓ Saved' : 'Save'}
          </Button>
        </div>
      }
      promptsContent={
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">
              Voice Agent System Prompt — use {ph(['book_title', 'author', 'chapter_title', 'oneliner', 'content'])}
            </label>
            <textarea value={vals.voice_agent_system_prompt || ''} onChange={(e) => set('voice_agent_system_prompt', e.target.value)}
              rows={12} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background focus:outline-none font-mono resize-y" />
          </div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
            {saved ? '✓ Saved' : 'Save'}
          </Button>
        </div>
      }
    />
  )
}

function Agents() {
  return (
    <div className="space-y-4">
      <GeminiCard />
      <CartesiaCard />
    </div>
  )
}

// ─────────────────────────────────────────
// BOOKS TAB (Catalog + Requested)
// ─────────────────────────────────────────
function BooksTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sub = searchParams.get('asub') || 'catalog'

  const setSub = (s) => setSearchParams((p) => { p.set('asub', s); return p }, { replace: true })

  return (
    <div>
      <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border mb-4">
        {['catalog', 'requested'].map((s) => (
          <button key={s} onClick={() => setSub(s)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer capitalize ${sub === s ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground'}`}>
            {s}
          </button>
        ))}
      </div>
      <div style={{ display: sub === 'catalog' ? 'block' : 'none' }}><BooksCatalog /></div>
      <div style={{ display: sub === 'requested' ? 'block' : 'none' }}><BookRequests /></div>
    </div>
  )
}

// ─────────────────────────────────────────
// MAIN ADMIN PANEL
// ─────────────────────────────────────────
export function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('atab') || 'users'

  const setTab = (id) => setSearchParams((p) => { p.set('atab', id); p.delete('asub'); return p }, { replace: true })

  return (
    <div className="flex gap-6">
      {/* Left sidebar */}
      <div className="w-36 shrink-0 pt-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors cursor-pointer text-left
              ${activeTab === t.id ? 'bg-surface font-medium text-foreground' : 'text-muted hover:text-foreground hover:bg-surface/50'}`}
          >
            <t.icon size={14} className="shrink-0" /> {t.label}
          </button>
        ))}
      </div>

      {/* Content — all tabs kept mounted, no re-fetch on switch */}
      <div className="flex-1 min-w-0">
        <div style={{ display: activeTab === 'users' ? 'block' : 'none' }}><UserAccess /></div>
        <div style={{ display: activeTab === 'sessions' ? 'block' : 'none' }}><GroupSessions /></div>
        <div style={{ display: activeTab === 'books' ? 'block' : 'none' }}><BooksTab /></div>
        <div style={{ display: activeTab === 'agents' ? 'block' : 'none' }}><Agents /></div>
      </div>
    </div>
  )
}
