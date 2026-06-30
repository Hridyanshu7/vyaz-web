import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Mail, Phone, BookOpen, Calendar, Check, Loader2, Save } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { useAuthStore } from '../stores/authStore'
import { getGoogleAuthUrl, isGCalCallback, getGCalAuthCode, exchangeGCalToken } from '../lib/calendar'
import { useBookStore } from '../stores/bookStore'
import { useSignupModal } from '../hooks/useSignupModal'

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
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')
  const [genres, setGenres] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user && !isGCalCallback()) { useSignupModal.getState().show({ type: 'signin' }); return }
    if (profile) {
      setName(profile.name || '')
      setEmail(profile.email || '')
      setPhone(profile.phone || user?.phone || '')
      setRole(profile.role || '')
      setGenres(profile.genres || [])
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
        phone: phone.trim() || null,
        role,
        genres,
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

      {/* Avatar + name header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center overflow-hidden shrink-0">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
          ) : (
            <User size={24} className="text-muted" />
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold">{profile?.name || 'Profile'}</h1>
          <p className="text-sm text-muted">{profile?.email || user?.email || ''}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic info */}
        <section className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div>
            <label className="block text-sm font-medium mb-1.5">Phone</label>
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm
                  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
              />
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
