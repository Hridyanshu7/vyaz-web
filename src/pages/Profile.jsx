import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Phone, Check, Loader2, Save } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAuthStore } from '../stores/authStore'
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
  const [phone, setPhone] = useState('')
  const [genres, setGenres] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) return
    if (profile) {
      setName(profile.name || '')
      setEmail(profile.email || '')
      setPhone(profile.phone || user?.phone || '')
      setGenres(profile.genres || [])
    }
  }, [user, profile, loading])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await updateProfile({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
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
      <button onClick={() => navigate('/')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6 cursor-pointer">
        <ArrowLeft size={16} /> Back
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
            <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp number
            </label>
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
