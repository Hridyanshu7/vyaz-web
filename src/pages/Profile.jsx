import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Mail, Phone, BookOpen, Calendar, Link2, Check, Loader2, Save } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { useAuthStore } from '../stores/authStore'
import { getGoogleAuthUrl, isGCalCallback, getGCalAuthCode, exchangeGCalToken } from '../lib/calendar'
import { useBookStore } from '../stores/bookStore'

function MultiSelectChips({ options, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            key={option}
            onClick={() => onToggle(option)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer
              ${isSelected ? 'bg-foreground text-white' : 'bg-surface border border-border text-muted hover:text-foreground'}`}
          >
            {isSelected && <Check size={12} className="inline mr-1 -mt-0.5" />}
            {option}
          </button>
        )
      })}
    </div>
  )
}

export function Profile() {
  const { user, profile, loading, updateProfile } = useAuthStore()
  const allGenres = useBookStore((s) => s.genres)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [genres, setGenres] = useState([])
  const [calendlyLink, setCalendlyLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user && !isGCalCallback()) { navigate('/login'); return }
    if (profile) {
      setName(profile.name || '')
      setEmail(profile.email || '')
      setRole(profile.role || '')
      setGenres(profile.genres || [])
      setCalendlyLink(profile.calendly_link || '')
    }
  }, [user, profile, loading])

  useEffect(() => {
    if (isGCalCallback() && user) {
      const code = getGCalAuthCode()
      if (code) {
        exchangeGCalToken(code)
          .then(() => updateProfile({ gcal_connected: true }))
          .catch(() => updateProfile({ gcal_connected: true }))
          .finally(() => window.history.replaceState({}, '', '/profile'))
      }
    }
  }, [user])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await updateProfile({
        name: name.trim(),
        email: email.trim(),
        role,
        genres,
        calendly_link: calendlyLink.trim() || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6 cursor-pointer">
        <ArrowLeft size={16} /> Dashboard
      </button>

      <h1 className="text-xl font-bold mb-6">Profile</h1>

      <div className="space-y-6">
        {/* Basic info */}
        <section className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div>
            <label className="block text-sm font-medium mb-1.5">Phone</label>
            <div className="flex items-center gap-2 text-sm text-muted px-3 py-2 rounded-lg bg-surface border border-border">
              <Phone size={14} />
              {profile?.phone || user?.phone || 'Not set'}
            </div>
          </div>
        </section>

        {/* Role */}
        <section>
          <label className="block text-sm font-medium mb-2">Role</label>
          <div className="flex gap-2">
            {[{ v: 'reader', l: 'Listener' }, { v: 'narrator', l: 'Narrator' }, { v: 'both', l: 'Both' }].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setRole(opt.v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${role === opt.v ? 'bg-foreground text-white' : 'bg-surface border border-border text-muted hover:text-foreground'}`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </section>

        {/* Genres */}
        <section>
          <label className="block text-sm font-medium mb-2">Interests</label>
          <MultiSelectChips
            options={allGenres}
            selected={genres}
            onToggle={(g) => setGenres((prev) =>
              prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
            )}
          />
        </section>

        {/* Calendar */}
        <section className="space-y-3">
          <label className="block text-sm font-medium">Integrations</label>

          <div className="p-3 rounded-xl border border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-muted" />
              <div>
                <p className="text-sm font-medium">Google Calendar</p>
                <p className="text-xs text-muted">
                  {profile?.gcal_connected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>
            {profile?.gcal_connected ? (
              <Badge variant="success"><Check size={12} /> Connected</Badge>
            ) : (
              <Button size="sm" variant="outline" onClick={() => { window.location.href = getGoogleAuthUrl() }}>
                Connect
              </Button>
            )}
          </div>

          {(role === 'narrator' || role === 'both') && (
            <div className="p-3 rounded-xl border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Link2 size={16} className="text-muted" />
                <p className="text-sm font-medium">Calendly</p>
              </div>
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
        </section>

        {/* Save */}
        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? (
            <><Loader2 size={16} className="mr-2 animate-spin" /> Saving...</>
          ) : saved ? (
            <><Check size={16} className="mr-1" /> Saved</>
          ) : (
            <><Save size={16} className="mr-1" /> Save changes</>
          )}
        </Button>
      </div>
    </div>
  )
}
