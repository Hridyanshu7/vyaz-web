import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Logo } from '../components/ui/Logo'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

function GoogleIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24 c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039 l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571 c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
    </svg>
  )
}

function LinkedInIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true" {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.446-2.136 2.94v5.666H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

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

        <Button variant="outline" className="w-full gap-2" onClick={() => { track('signup_method_chosen', { method: 'google' }); signInWithGoogle() }}>
          <GoogleIcon /> Continue with Google
        </Button>
        <Button variant="outline" className="w-full mt-2.5 gap-2" onClick={() => { track('signup_method_chosen', { method: 'linkedin' }); signInWithLinkedIn() }}>
          <LinkedInIcon /> Continue with LinkedIn
        </Button>
      </div>
    </div>
  )
}
