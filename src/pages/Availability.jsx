import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useAvailability } from '../hooks/useAvailability'
import { AvailabilityPicker } from '../components/AvailabilityPicker'

export function Availability() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { availability, setAvailability, timezone, setTimezone, loading, saveAvailability } = useAvailability(user?.id)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    await saveAvailability(user.id, availability, timezone)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="max-w-lg mx-auto px-4 py-16 text-center text-sm text-muted">Loading...</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6 cursor-pointer">
        <ArrowLeft size={16} /> Dashboard
      </button>
      <h1 className="text-xl font-bold mb-1">Your availability</h1>
      <p className="text-sm text-muted mb-6">Set the hours when you're open for narration sessions. Listeners will only see these slots.</p>
      <AvailabilityPicker
        availability={availability}
        setAvailability={setAvailability}
        timezone={timezone}
        setTimezone={setTimezone}
        saving={saving}
        onSave={handleSave}
      />
      {saved && <p className="text-sm text-green-600 text-center mt-2">Availability saved!</p>}
    </div>
  )
}
