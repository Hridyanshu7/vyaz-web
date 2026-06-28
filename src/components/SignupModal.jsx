import { useState, useEffect } from 'react'
import { X, Phone, ArrowRight, Loader2, Calendar, Link2, Check, BookOpen, Plus, Search } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Badge } from './ui/Badge'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { getGoogleAuthUrl, isGCalCallback, getGCalAuthCode, exchangeGCalToken } from '../lib/calendar'
import { importBookFromUrl } from '../lib/bookImport'
import { useBookStore } from '../stores/bookStore'

export function SignupModal({ open, onClose }) {
  const { user, profile, sendOtp, verifyOtp, signInWithGoogle, updateProfile } = useAuthStore()
  const { books, addBook: addBookToStore } = useBookStore()
  const [countryCode, setCountryCode] = useState('+91')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [name, setName] = useState('')
  const [calendlyLink, setCalendlyLink] = useState('')
  const [gcalConnected, setGcalConnected] = useState(false)
  const [wantNarrate, setWantNarrate] = useState(false)
  const [selectedBooks, setSelectedBooks] = useState([])
  const [bookSearch, setBookSearch] = useState('')
  const [showBookDropdown, setShowBookDropdown] = useState(false)
  const [addBookUrl, setAddBookUrl] = useState('')
  const [addingBook, setAddingBook] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('tome_signup')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.name) setName(data.name)
        if (data.calendlyLink) setCalendlyLink(data.calendlyLink)
        if (data.wantNarrate) setWantNarrate(true)
        if (data.selectedBooks?.length) setSelectedBooks(data.selectedBooks)
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    if (user && profile) {
      if (profile.name && !name) setName(profile.name)
      if (profile.gcal_connected) setGcalConnected(true)
      if (profile.calendly_link && !calendlyLink) setCalendlyLink(profile.calendly_link)

      if (localStorage.getItem('tome_signup')) {
        handleComplete()
      } else if (profile.onboarding_complete) {
        onClose()
      }
    }
  }, [user, profile])

  useEffect(() => {
    if (isGCalCallback() && user) {
      const code = getGCalAuthCode()
      if (code) {
        setGcalConnected(true)
        exchangeGCalToken(code).catch(() => {})
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [user])

  if (!open) return null

  const isLoggedIn = !!user

  const fullPhone = `${countryCode}${phoneNumber.replace(/\s/g, '')}`

  const handleSendOtp = async () => {
    if (phoneNumber.length < 6) return
    setError('')
    setLoginError('')
    setLoading(true)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', fullPhone)
        .maybeSingle()
      if (!data) {
        setLoginError('This phone number is not registered. Fill in your details below to sign up.')
        setLoading(false)
        return
      }
      await sendOtp(fullPhone)
      setOtpSent(true)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return
    setError('')
    setLoading(true)
    try {
      await verifyOtp(fullPhone, otp)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleAddBookUrl = async () => {
    if (!addBookUrl.trim()) return
    setAddingBook(true)
    try {
      const book = await importBookFromUrl(addBookUrl, () => {})
      const saved = await addBookToStore(book)
      setSelectedBooks((prev) => [...prev, saved.id])
      setAddBookUrl('')
    } catch (err) {
      setError(err.message)
    }
    setAddingBook(false)
  }

  const saveFormToStorage = () => {
    localStorage.setItem('tome_signup', JSON.stringify({
      name: name.trim(),
      calendlyLink: calendlyLink.trim(),
      wantNarrate,
      selectedBooks,
    }))
  }

  const handleComplete = async () => {
    if (!name.trim()) { setError('Please enter your name'); return }

    if (!isLoggedIn) {
      saveFormToStorage()
      signInWithGoogle()
      return
    }

    setLoading(true)
    setError('')
    try {
      await updateProfile({
        name: name.trim(),
        role: wantNarrate ? 'both' : 'reader',
        gcal_connected: gcalConnected,
        calendly_link: calendlyLink.trim() || null,
        onboarding_complete: true,
      })
      if (wantNarrate && selectedBooks.length > 0) {
        const inserts = selectedBooks.map((bookId) => ({
          narrator_id: user.id,
          book_id: bookId,
        }))
        await supabase.from('narrator_books').upsert(inserts, { onConflict: 'narrator_id,book_id' })
      }
      localStorage.removeItem('tome_signup')
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const filteredCatalog = books.filter((b) =>
    !selectedBooks.includes(b.id) &&
    (bookSearch === '' || b.title.toLowerCase().includes(bookSearch.toLowerCase()) || b.author.toLowerCase().includes(bookSearch.toLowerCase()))
  ).slice(0, 6)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-foreground/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background flex items-center justify-between px-5 py-4 border-b border-border z-10">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-highlight" />
            <h2 className="font-bold">Join Vyas</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface rounded-lg cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-highlight/10 text-highlight text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          {/* ===== SECTION 1: LOG IN ===== */}
          <div>
            <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
              {isLoggedIn ? '✓ Logged in' : 'Log in'}
            </p>

            {isLoggedIn ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                <Check size={16} className="text-green-600" />
                <span className="text-sm text-green-800">{profile?.email || profile?.phone || 'Signed in'}</span>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted">Returning users only</p>
                {loginError && (
                  <div className="bg-highlight/10 text-highlight text-xs px-3 py-2 rounded-lg">{loginError}</div>
                )}
                <button
                  onClick={signInWithGoogle}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-white hover:bg-gray-50 transition-colors cursor-pointer shadow-sm"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  <span className="text-sm font-medium text-gray-700">Continue with Google</span>
                </button>

                {!otpSent ? (
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-[90px] shrink-0 px-2 py-2 rounded-lg border border-border bg-background text-sm
                        focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight cursor-pointer"
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+61">🇦🇺 +61</option>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+65">🇸🇬 +65</option>
                      <option value="+49">🇩🇪 +49</option>
                      <option value="+81">🇯🇵 +81</option>
                      <option value="+86">🇨🇳 +86</option>
                      <option value="+55">🇧🇷 +55</option>
                      <option value="+33">🇫🇷 +33</option>
                      <option value="+82">🇰🇷 +82</option>
                      <option value="+234">🇳🇬 +234</option>
                      <option value="+27">🇿🇦 +27</option>
                      <option value="+7">🇷🇺 +7</option>
                      <option value="+62">🇮🇩 +62</option>
                      <option value="+52">🇲🇽 +52</option>
                      <option value="+39">🇮🇹 +39</option>
                      <option value="+34">🇪🇸 +34</option>
                      <option value="+60">🇲🇾 +60</option>
                    </select>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                      placeholder="98765 43210"
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm
                        placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                    />
                    <Button size="sm" disabled={loading || phoneNumber.replace(/\s/g, '').length < 6} onClick={handleSendOtp}>
                      {loading ? <Loader2 size={14} className="animate-spin" /> : 'Send OTP'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full text-center text-xl tracking-[0.5em] py-2.5 rounded-lg border border-border bg-background
                        placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                    />
                    <div className="flex gap-2">
                      <Button className="flex-1" disabled={loading || otp.length !== 6} onClick={handleVerifyOtp}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : 'Verify'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setOtpSent(false)}>Change</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ===== DIVIDER ===== */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-background px-3 text-muted uppercase tracking-wider">New here? Set up your profile</span></div>
          </div>

          {/* ===== SECTION 2: PROFILE / ONBOARDING ===== */}
          <div className="space-y-4">
            {/* Name */}
            <Input
              label="Your name"
              placeholder="e.g., Priya Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            {/* Calendar */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Calendar</label>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-muted" />
                  <span className="text-sm">Google Calendar</span>
                </div>
                {gcalConnected ? (
                  <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Connected</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { window.location.href = getGoogleAuthUrl() }}>
                    Connect
                  </Button>
                )}
              </div>
              <div className="relative">
                <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="url"
                  placeholder="Or paste Calendly link"
                  value={calendlyLink}
                  onChange={(e) => setCalendlyLink(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm
                    placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                />
              </div>
            </div>

            {/* Narrator toggle */}
            <div
              onClick={() => setWantNarrate(!wantNarrate)}
              className={`p-3 rounded-lg border cursor-pointer transition-colors
                ${wantNarrate ? 'border-highlight bg-highlight/5' : 'border-border hover:border-foreground/20'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">I want to narrate books</p>
                  <p className="text-xs text-muted">Share your knowledge with others</p>
                </div>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                  ${wantNarrate ? 'bg-highlight border-highlight' : 'border-border'}`}>
                  {wantNarrate && <Check size={12} className="text-white" />}
                </div>
              </div>
            </div>

            {/* Book selection */}
            {wantNarrate && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">Which books can you narrate?</label>

                {selectedBooks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedBooks.map((bookId) => {
                      const book = books.find((b) => b.id === bookId)
                      return book ? (
                        <Badge key={bookId} variant="highlight" className="cursor-pointer" onClick={() =>
                          setSelectedBooks((prev) => prev.filter((id) => id !== bookId))
                        }>
                          {book.title.split(':')[0]} ✕
                        </Badge>
                      ) : null
                    })}
                  </div>
                )}

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    placeholder="Search books..."
                    value={bookSearch}
                    onChange={(e) => { setBookSearch(e.target.value); setShowBookDropdown(true) }}
                    onFocus={() => setShowBookDropdown(true)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm
                      placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                  />
                  {showBookDropdown && filteredCatalog.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-20 max-h-[200px] overflow-y-auto">
                      {filteredCatalog.map((book) => (
                        <button
                          key={book.id}
                          onClick={() => {
                            setSelectedBooks((prev) => [...prev, book.id])
                            setBookSearch('')
                            setShowBookDropdown(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-surface transition-colors cursor-pointer border-b border-border last:border-b-0"
                        >
                          <span className="font-medium">{book.title.split(':')[0]}</span>
                          <span className="text-muted"> — {book.author}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Plus size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="url"
                      placeholder="Add book via Amazon/Goodreads URL"
                      value={addBookUrl}
                      onChange={(e) => setAddBookUrl(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm
                        placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                    />
                  </div>
                  <Button size="sm" variant="outline" disabled={!addBookUrl.trim() || addingBook} onClick={handleAddBookUrl}>
                    {addingBook ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
                  </Button>
                </div>
              </div>
            )}

            {/* Complete */}
            <Button className="w-full" disabled={!name.trim() || loading} onClick={handleComplete}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <>Join the wave! <ArrowRight size={16} className="ml-1" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
