import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Phone, ArrowRight, Loader2, Calendar, Check, BookOpen } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { useAuthStore } from '../stores/authStore'
import { useSignupModal } from '../hooks/useSignupModal'
import { supabase } from '../lib/supabase'
import { getGoogleAuthUrl, isGCalCallback, getGCalAuthCode, exchangeGCalToken } from '../lib/calendar'
import { AvailabilityPicker } from './AvailabilityPicker'
import { useAvailability, DEFAULT_AVAILABILITY } from '../hooks/useAvailability'

const NEEDS_CALENDAR = ['gist', 'chapter', 'join']

export function SignupModal({ open, onClose }) {
  const navigate = useNavigate()
  const { user, profile, sendOtp, verifyOtp, signInWithGoogle, signInWithLinkedIn, updateProfile } = useAuthStore()
  const context = useSignupModal((s) => s.context)

  const [countryCode, setCountryCode] = useState('+91')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [gcalConnected, setGcalConnected] = useState(false)
  const [showAvailability, setShowAvailability] = useState(false)
  const [availSlots, setAvailSlots] = useState(DEFAULT_AVAILABILITY)
  const [availTimezone, setAvailTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [savingAvail, setSavingAvail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loginError, setLoginError] = useState('')

  const needsCalendar = NEEDS_CALENDAR.includes(context?.type)
  const isLoggedIn = !!user

  // Restore context from localStorage after OAuth redirect
  useEffect(() => {
    const saved = localStorage.getItem('vyaz_signup_context')
    if (saved && !context) {
      try {
        const data = JSON.parse(saved)
        useSignupModal.getState().show(data)
      } catch {}
    }
  }, [])

  // Handle post-auth flow
  useEffect(() => {
    if (!user || !profile) return

    if (profile.gcal_connected) setGcalConnected(true)

    const savedContext = context || JSON.parse(localStorage.getItem('vyaz_signup_context') || 'null')

    if (savedContext && profile.onboarding_complete) {
      completeFlow(savedContext)
    } else if (savedContext && !profile.onboarding_complete && !NEEDS_CALENDAR.includes(savedContext.type)) {
      // signin/getstarted — mark onboarded and redirect immediately
      updateProfile({ onboarding_complete: true }).then(() => completeFlow(savedContext))
    } else if (savedContext && !profile.onboarding_complete && NEEDS_CALENDAR.includes(savedContext.type) && profile.gcal_connected) {
      // gist/chapter/join but GCal already connected — mark onboarded and redirect
      updateProfile({ onboarding_complete: true }).then(() => completeFlow(savedContext))
    } else if (profile.onboarding_complete && !savedContext) {
      onClose()
    }
  }, [user, profile])

  // Handle GCal callback
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

  const saveContext = () => {
    if (context) localStorage.setItem('vyaz_signup_context', JSON.stringify(context))
  }

  const handleGoogleSignIn = () => {
    saveContext()
    signInWithGoogle()
  }

  const handleLinkedInSignIn = () => {
    saveContext()
    signInWithLinkedIn()
  }

  const isNarrator = profile?.role === 'narrator' || profile?.role === 'both'

  const handleComplete = async () => {
    if (needsCalendar && !gcalConnected) {
      setError('Please connect Google Calendar to book sessions')
      return
    }

    // For narrators: show availability step before completing
    if (isNarrator && gcalConnected && !showAvailability) {
      setShowAvailability(true)
      return
    }

    setLoading(true)
    setError('')
    try {
      const updates = { onboarding_complete: true }
      if (gcalConnected) updates.gcal_connected = true

      await updateProfile(updates)
      completeFlow(context)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleSaveAvailability = async () => {
    if (!user) return
    setSavingAvail(true)
    try {
      await supabase.from('availability').delete().eq('narrator_id', user.id)
      const inserts = availSlots
        .filter((s) => s.enabled)
        .map((s) => ({
          narrator_id: user.id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          timezone: availTimezone,
        }))
      if (inserts.length > 0) {
        await supabase.from('availability').insert(inserts)
      }
    } catch {}
    setSavingAvail(false)
    setShowAvailability(false)
    // Now complete the flow
    setLoading(true)
    try {
      const updates = { onboarding_complete: true }
      if (gcalConnected) updates.gcal_connected = true
      await updateProfile(updates)
      localStorage.removeItem('vyaz_signup_context')
      completeFlow(context)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const completeFlow = async (ctx) => {
    localStorage.removeItem('vyaz_signup_context')

    if (!ctx) { onClose(); return }

    switch (ctx.type) {
      case 'signin':
        onClose()
        navigate('/dashboard')
        break
      case 'getstarted':
        onClose()
        navigate('/books')
        break
      case 'gist':
      case 'chapter':
        onClose()
        navigate(`/books/${ctx.bookId}`)
        break
      case 'join':
        if (ctx.sessionId && user) {
          await supabase.from('session_attendees').insert({
            session_id: ctx.sessionId,
            reader_id: user.id,
          })
        }
        onClose()
        window.location.reload()
        break
      default:
        onClose()
    }
  }

  // If logged in + onboarding complete + no calendar needed → auto-complete
  const shouldAutoComplete = isLoggedIn && profile?.onboarding_complete && !needsCalendar
  if (shouldAutoComplete && context) {
    completeFlow(context)
    return null
  }

  // If logged in + onboarding complete + calendar needed → show calendar step
  // If logged in + NOT onboarded → show calendar step (for booking flows) or auto-complete (for browse flows)
  const showCalendarStep = isLoggedIn && needsCalendar && !gcalConnected
  const showAuthOnly = !isLoggedIn

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-foreground/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background flex items-center justify-between px-5 py-4 border-b border-border z-10">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-highlight" />
            <h2 className="font-bold">Welcome to Vyaz.ai</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface rounded-lg cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-highlight/10 text-highlight text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          {/* ===== AUTH SECTION ===== */}
          {showAuthOnly && (
            <>
              {isLoggedIn ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                  <Check size={16} className="text-green-600" />
                  <span className="text-sm text-green-800">{profile?.email || 'Signed in'}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted">Sign in to continue</p>
                  {loginError && (
                    <div className="bg-highlight/10 text-highlight text-xs px-3 py-2 rounded-lg">{loginError}</div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleGoogleSignIn}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-white hover:bg-gray-50 transition-colors cursor-pointer shadow-sm"
                    >
                      <svg width="16" height="16" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                      </svg>
                      <span className="text-sm font-medium text-gray-700">Google</span>
                    </button>
                    <button
                      onClick={handleLinkedInSignIn}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-white hover:bg-gray-50 transition-colors cursor-pointer shadow-sm"
                    >
                      <svg width="16" height="16" viewBox="0 0 48 48">
                        <path fill="#0A66C2" d="M44.45 0H3.55A3.5 3.5 0 000 3.46v41.08A3.5 3.5 0 003.55 48h40.9A3.5 3.5 0 0048 44.54V3.46A3.5 3.5 0 0044.45 0zM14.24 40.9H7.12V18h7.12v22.9zM10.68 14.82a4.12 4.12 0 110-8.24 4.12 4.12 0 010 8.24zM40.9 40.9h-7.09V29.77c0-2.66-.05-6.08-3.7-6.08-3.7 0-4.27 2.9-4.27 5.89V40.9h-7.1V18h6.83v3.13h.1a7.48 7.48 0 016.73-3.7c7.2 0 8.53 4.74 8.53 10.9v12.57z"/>
                      </svg>
                      <span className="text-sm font-medium text-gray-700">LinkedIn</span>
                    </button>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                    <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted">or via WhatsApp</span></div>
                  </div>

                  {!otpSent ? (
                    <div>
                      <div className="flex gap-2">
                        <select
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                          className="w-[90px] shrink-0 px-2 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight cursor-pointer"
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
                          placeholder="WhatsApp number"
                          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                        />
                        <Button size="sm" disabled={loading || phoneNumber.replace(/\s/g, '').length < 6} onClick={handleSendOtp}>
                          {loading ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted mt-1 flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        OTP will be sent on WhatsApp
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        WhatsApp OTP sent to {countryCode} {phoneNumber}
                      </p>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter OTP"
                        className="w-full text-center text-xl tracking-[0.5em] py-2.5 rounded-lg border border-border bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
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
            </>
          )}

          {/* ===== CALENDAR STEP (only for booking flows) ===== */}
          {isLoggedIn && showCalendarStep && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 mb-2">
                <Check size={16} className="text-green-600" />
                <span className="text-sm text-green-800">Signed in as {profile?.name || profile?.email}</span>
              </div>

              <p className="text-sm font-medium">Connect your calendar to book sessions</p>
              <p className="text-xs text-muted mb-2">So we can create events and send you reminders.</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-muted" />
                    <span className="text-sm">Google Calendar</span>
                  </div>
                  {gcalConnected ? (
                    <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Connected</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => {
                      if (context) localStorage.setItem('vyaz_signup_context', JSON.stringify(context))
                      window.location.href = getGoogleAuthUrl()
                    }}>
                      Connect
                    </Button>
                  )}
                </div>
                </div>

              {/* Availability step for narrators */}
              {showAvailability ? (
                <div>
                  <p className="text-sm font-medium mb-1">Set your availability</p>
                  <p className="text-xs text-muted mb-3">When are you free for sessions? Listeners will only see these hours.</p>
                  <AvailabilityPicker
                    availability={availSlots}
                    setAvailability={setAvailSlots}
                    timezone={availTimezone}
                    setTimezone={setAvailTimezone}
                    saving={savingAvail}
                    onSave={handleSaveAvailability}
                    onSkip={async () => {
                      setShowAvailability(false)
                      setLoading(true)
                      try {
                        await updateProfile({ onboarding_complete: true, gcal_connected: gcalConnected })
                        localStorage.removeItem('vyaz_signup_context')
                        completeFlow(context)
                      } catch {}
                      setLoading(false)
                    }}
                  />
                </div>
              ) : (
                <Button className="w-full" disabled={loading} onClick={handleComplete}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} className="ml-1" /></>}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
