import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Send, Check, ArrowRight, Calendar, Link2, Loader2, User, Mail } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAuthStore } from '../stores/authStore'
import { getGoogleAuthUrl, isGCalCallback, getGCalAuthCode, exchangeGCalToken } from '../lib/calendar'
import { GENRES, SEED_BOOKS } from '../data/seedBooks'

const ROLE_OPTIONS = [
  { value: 'reader', label: 'Listener', desc: 'I want to learn about books from narrators' },
  { value: 'narrator', label: 'Narrator', desc: "I've read books deeply and want to share knowledge" },
  { value: 'both', label: 'Both', desc: 'I want to narrate some books and listen to others' },
]

function StepIndicator({ current, total }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${
            i <= current ? 'bg-highlight' : 'bg-border'
          }`}
        />
      ))}
    </div>
  )
}

function ChatBubble({ children }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center shrink-0">
        <BookOpen size={14} className="text-white" />
      </div>
      <div className="bg-surface rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm max-w-[85%]">
        {children}
      </div>
    </div>
  )
}

function MultiSelectChips({ options, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            key={option}
            onClick={() => onToggle(option)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer
              ${isSelected
                ? 'bg-foreground text-white'
                : 'bg-surface border border-border text-muted hover:text-foreground hover:border-foreground/30'
              }`}
          >
            {isSelected && <Check size={14} className="inline mr-1 -mt-0.5" />}
            {option}
          </button>
        )
      })}
    </div>
  )
}

export function Onboarding() {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [genres, setGenres] = useState([])
  const [calendlyLink, setCalendlyLink] = useState('')
  const [gcalConnected, setGcalConnected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { user, profile, loading, updateProfile } = useAuthStore()
  const navigate = useNavigate()
  const scrollRef = useRef(null)

  useEffect(() => {
    if (loading) return
    if (!user && !isGCalCallback()) { navigate('/login'); return }
    if (profile?.onboarding_complete) { navigate('/dashboard'); return }
    if (profile?.name) setName(profile.name)
    if (profile?.email) setEmail(profile.email)
    if (profile?.role) setRole(profile.role)
    if (profile?.genres) setGenres(profile.genres)
  }, [user, profile, loading])

  useEffect(() => {
    if (isGCalCallback()) {
      const code = getGCalAuthCode()
      setGcalConnected(true)
      setStep(3)
      if (user && code) {
        exchangeGCalToken(code)
          .then(() => updateProfile({ gcal_connected: true }))
          .catch(() => updateProfile({ gcal_connected: true }))
      }
      window.history.replaceState({}, '', '/onboarding')
    }
  }, [user])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [step])

  const saveAndNext = async (updates, nextStep) => {
    setSaving(true)
    setError('')
    try {
      await updateProfile(updates)
      setStep(nextStep)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const totalSteps = 5

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col max-w-lg mx-auto">
      <div className="flex-1 px-4 py-6">
        <StepIndicator current={step} total={totalSteps} />

        {/* Step 0: Basic details */}
        {step === 0 && (
          <div>
            <ChatBubble>
              Welcome to Vyas! Let's get you set up. What should we call you?
            </ChatBubble>
            <div className="pl-11 space-y-4">
              <Input
                label="Your name"
                placeholder="e.g., Priya Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <Input
                label="Email address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted">For calendar invites and session notifications.</p>
              {error && <p className="text-sm text-highlight">{error}</p>}
              <Button
                disabled={!name.trim() || !email.trim() || saving}
                onClick={() => saveAndNext({ name: name.trim(), email: email.trim() }, 1)}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} className="ml-1" /></>}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Role selection */}
        {step === 1 && (
          <div>
            <ChatBubble>
              Nice to meet you, {name}! How do you want to use Vyas?
            </ChatBubble>
            <div className="pl-11 space-y-3">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRole(opt.value)}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer
                    ${role === opt.value
                      ? 'border-highlight bg-highlight/5'
                      : 'border-border hover:border-foreground/20'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{opt.label}</span>
                    {role === opt.value && (
                      <div className="w-5 h-5 rounded-full bg-highlight flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">{opt.desc}</p>
                </button>
              ))}
              {error && <p className="text-sm text-highlight">{error}</p>}
              <Button
                disabled={!role || saving}
                onClick={() => saveAndNext({ role }, 2)}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} className="ml-1" /></>}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Interests */}
        {step === 2 && (
          <div>
            <ChatBubble>
              {role === 'narrator'
                ? 'What genres do you know well enough to discuss?'
                : 'What genres interest you most?'}
            </ChatBubble>
            <div className="pl-11 space-y-4">
              <MultiSelectChips
                options={GENRES}
                selected={genres}
                onToggle={(g) => setGenres((prev) =>
                  prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
                )}
              />
              {error && <p className="text-sm text-highlight">{error}</p>}
              <Button
                disabled={genres.length === 0 || saving}
                onClick={() => saveAndNext({ genres }, 3)}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} className="ml-1" /></>}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Calendar integration */}
        {step === 3 && (
          <div>
            <ChatBubble>
              Let's connect your calendar so sessions are automatically synced.
            </ChatBubble>
            <div className="pl-11 space-y-4">
              {/* Google Calendar */}
              <div className="p-4 rounded-xl border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-muted" />
                    <span className="text-sm font-medium">Google Calendar</span>
                  </div>
                  {gcalConnected && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Check size={12} /> Connected
                    </span>
                  )}
                </div>
                {gcalConnected ? (
                  <p className="text-xs text-muted">Sessions will be added to your Google Calendar with Meet links.</p>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { window.location.href = getGoogleAuthUrl() }}
                  >
                    <Calendar size={14} className="mr-1" /> Connect Google Calendar
                  </Button>
                )}
              </div>

              {/* Calendly (narrators only) */}
              {(role === 'narrator' || role === 'both') && (
                <div className="p-4 rounded-xl border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 size={18} className="text-muted" />
                    <span className="text-sm font-medium">Calendly</span>
                  </div>
                  <p className="text-xs text-muted mb-2">Paste your Calendly link so listeners can book sessions with you.</p>
                  <input
                    type="url"
                    placeholder="https://calendly.com/your-name"
                    value={calendlyLink}
                    onChange={(e) => setCalendlyLink(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm
                      placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
                  />
                </div>
              )}

              {error && <p className="text-sm text-highlight">{error}</p>}
              <div className="flex gap-2">
                <Button
                  disabled={saving}
                  onClick={() => saveAndNext({
                    gcal_connected: gcalConnected,
                    calendly_link: calendlyLink || null,
                  }, 4)}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} className="ml-1" /></>}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setStep(4)}
                >
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 4 && (
          <div>
            <ChatBubble>
              You're all set, {name}! 🎉 Let's find you a great conversation.
            </ChatBubble>
            <div className="pl-11 space-y-4">
              <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User size={14} className="text-muted" /> {name}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={14} className="text-muted" /> {email}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen size={14} className="text-muted" />
                  {role === 'both' ? 'Narrator & Listener' : role === 'narrator' ? 'Narrator' : 'Listener'}
                </div>
                {gcalConnected && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Calendar size={14} /> Google Calendar connected
                  </div>
                )}
                {calendlyLink && (
                  <div className="flex items-center gap-2 text-sm">
                    <Link2 size={14} className="text-muted" /> Calendly linked
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-highlight">{error}</p>}
              <Button
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  try {
                    await updateProfile({ onboarding_complete: true })
                    navigate('/dashboard')
                  } catch (err) {
                    setError(err.message)
                    setSaving(false)
                  }
                }}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <>Go to Dashboard <ArrowRight size={16} className="ml-1" /></>}
              </Button>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>
    </div>
  )
}
