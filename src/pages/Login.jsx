import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Phone, Mail, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

export function Login() {
  const [method, setMethod] = useState('email')
  const [phone, setPhone] = useState('+91')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const { sendOtp, verifyOtp, signInWithGoogle, user, profile } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (user && profile) {
      navigate(profile.onboarding_complete ? '/dashboard' : '/onboarding')
    }
  }, [user, profile])

  const handleSendOtp = async (e) => {
    e.preventDefault()
    if (!phone || phone.length < 10) return
    setError('')
    setLoading(true)
    try {
      await sendOtp(phone)
      setCodeSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    if (!otp || otp.length !== 6) return
    setError('')
    setLoading(true)
    try {
      await verifyOtp(phone, otp)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    if (!email) return
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/onboarding' },
      })
      if (error) throw error
      setMagicLinkSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <BookOpen size={32} className="text-highlight mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Welcome to Vyas</h1>
          <p className="text-sm text-muted mt-1">Sign in to get started</p>
        </div>

        {/* Method toggle */}
        <div className="flex gap-1 mb-6 bg-surface rounded-lg p-1 border border-border">
          <button
            onClick={() => { setMethod('email'); setError(''); setCodeSent(false) }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer
              ${method === 'email' ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground'}`}
          >
            <Mail size={14} /> Email
          </button>
          <button
            onClick={() => { setMethod('phone'); setError(''); setMagicLinkSent(false) }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer
              ${method === 'phone' ? 'bg-background shadow-sm' : 'text-muted hover:text-foreground'}`}
          >
            <Phone size={14} /> Phone
          </button>
        </div>

        {error && (
          <div className="bg-highlight/10 text-highlight text-sm px-3 py-2 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Email magic link */}
        {method === 'email' && (
          magicLinkSent ? (
            <div className="text-center py-8">
              <Mail size={32} className="text-highlight mx-auto mb-3" />
              <h2 className="text-lg font-semibold mb-1">Check your email</h2>
              <p className="text-sm text-muted">
                We sent a login link to <span className="font-medium text-foreground">{email}</span>
              </p>
              <p className="text-xs text-muted mt-3">Click the link in the email to sign in. You can close this tab.</p>
              <button
                onClick={() => setMagicLinkSent(false)}
                className="text-xs text-highlight hover:underline mt-4 cursor-pointer"
              >
                Try a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Email address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm
                      placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted mt-1.5">We'll send you a magic link to sign in</p>
              </div>
              <Button className="w-full" disabled={loading || !email}>
                {loading ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" /> Sending...</>
                ) : (
                  <>Send magic link <ArrowRight size={16} className="ml-1" /></>
                )}
              </Button>
            </form>
          )
        )}

        {/* Phone OTP */}
        {method === 'phone' && (
          !codeSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Phone number</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm
                      placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted mt-1.5">We'll send a 6-digit code via SMS</p>
              </div>
              <Button className="w-full" disabled={loading || phone.length < 10}>
                {loading ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" /> Sending...</>
                ) : (
                  <>Send OTP <ArrowRight size={16} className="ml-1" /></>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full text-center text-2xl tracking-[0.5em] py-3 rounded-lg border border-border bg-background
                    placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                  autoFocus
                />
                <p className="text-xs text-muted mt-1.5">
                  Sent to {phone} ·{' '}
                  <button type="button" onClick={() => setCodeSent(false)} className="text-highlight hover:underline cursor-pointer">
                    Change number
                  </button>
                </p>
              </div>
              <Button className="w-full" disabled={loading || otp.length !== 6}>
                {loading ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" /> Verifying...</>
                ) : (
                  'Verify & Continue'
                )}
              </Button>
            </form>
          )
        )}

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted">or</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={signInWithGoogle}>
          Continue with Google
        </Button>
      </div>
    </div>
  )
}
