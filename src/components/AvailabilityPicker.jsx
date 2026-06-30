import { Loader2 } from 'lucide-react'
import { Button } from './ui/Button'
import { DAYS } from '../hooks/useAvailability'

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
]

const TIMES = []
for (let h = 6; h <= 23; h++) {
  TIMES.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 23) TIMES.push(`${String(h).padStart(2, '0')}:30`)
}

export function AvailabilityPicker({ availability, setAvailability, timezone, setTimezone, saving, onSave, onSkip }) {
  const toggleDay = (i) => {
    const updated = [...availability]
    updated[i] = { ...updated[i], enabled: !updated[i].enabled }
    setAvailability(updated)
  }

  const updateTime = (i, field, value) => {
    const updated = [...availability]
    updated[i] = { ...updated[i], [field]: value }
    setAvailability(updated)
  }

  const enabledCount = availability.filter((s) => s.enabled).length

  return (
    <div className="space-y-4">
      {/* Timezone */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">Your timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight cursor-pointer"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {/* Day + time slots */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Available hours</label>
        <div className="space-y-2">
          {DAYS.map((day, i) => {
            const slot = availability[i]
            return (
              <div key={day} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${slot.enabled ? 'border-border bg-background' : 'border-border/50 bg-surface opacity-60'}`}>
                <button
                  onClick={() => toggleDay(i)}
                  className={`w-10 text-xs font-medium rounded-md py-1 cursor-pointer transition-colors ${slot.enabled ? 'bg-foreground text-white' : 'bg-surface text-muted border border-border'}`}
                >
                  {day}
                </button>
                {slot.enabled ? (
                  <>
                    <select
                      value={slot.start_time}
                      onChange={(e) => updateTime(i, 'start_time', e.target.value)}
                      className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-highlight/20"
                    >
                      {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-xs text-muted">to</span>
                    <select
                      value={slot.end_time}
                      onChange={(e) => updateTime(i, 'end_time', e.target.value)}
                      className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-highlight/20"
                    >
                      {TIMES.filter((t) => t > slot.start_time).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </>
                ) : (
                  <span className="text-xs text-muted">Unavailable</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button className="flex-1" disabled={saving || enabledCount === 0} onClick={onSave}>
          {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
          Save availability
        </Button>
        {onSkip && (
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip for now
          </Button>
        )}
      </div>
      {enabledCount === 0 && (
        <p className="text-xs text-highlight text-center">Select at least one day</p>
      )}
    </div>
  )
}
