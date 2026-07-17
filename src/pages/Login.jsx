import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Logo } from '../components/ui/Logo'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

export function Login() {
  const [method, setMethod] = useState('email')
  const [phone, setPhone] = useState('+91')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const { sendOtp, verifyOtp, signInWithGoogle, signInWithLinkedIn, user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Where to send the user back to after signing in — set by whichever gated button (Get
  // started, Talk) sent them here. '/dashboard' doesn't exist since the AI-only pivot; '/'
  // is the sane fallback if nothing gated them (e.g. visiting /login directly).
  const redirectTo = searchParams.get('redirectTo') || '/'

  useEffect(() => {
    if (user && profile) {
      navigate(redirectTo, { replace: true })
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
    track('signup_method_chosen', { method: 'email_magic_link' })
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        // window.location.href (not a hardcoded path) so ?redirectTo=... survives the
        // email round-trip — matches signInWithGoogle/signInWithLinkedIn below.
        options: { emailRedirectTo: window.location.href },
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
          <Logo size={44} className="mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Welcome to Vyaz</h1>
          <p className="text-sm text-muted mt-1">Sign in to get started</p>
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

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted">or</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={() => { track('signup_method_chosen', { method: 'google' }); signInWithGoogle() }}>
          Continue with Google
        </Button>
        <Button variant="outline" className="w-full mt-2.5" onClick={() => { track('signup_method_chosen', { method: 'linkedin' }); signInWithLinkedIn() }}>
          Continue with LinkedIn
        </Button>
      </div>
    </div>
  )
}
