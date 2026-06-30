import { Plus, Trash2, Loader2 } from 'lucide-react'
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

  const updateRange = (dayIdx, rangeIdx, field, value) => {
    const updated = [...availability]
    const ranges = [...updated[dayIdx].ranges]
    ranges[rangeIdx] = { ...ranges[rangeIdx], [field]: value }
    updated[dayIdx] = { ...updated[dayIdx], ranges }
    setAvailability(updated)
  }

  const addRange = (dayIdx) => {
    const updated = [...availability]
    const lastRange = updated[dayIdx].ranges[updated[dayIdx].ranges.length - 1]
    const newStart = lastRange.end_time
    const [h, m] = newStart.split(':').map(Number)
    const newEnd = `${String(Math.min(h + 2, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    updated[dayIdx] = {
      ...updated[dayIdx],
      ranges: [...updated[dayIdx].ranges, { start_time: newStart, end_time: newEnd }],
    }
    setAvailability(updated)
  }

  const removeRange = (dayIdx, rangeIdx) => {
    const updated = [...availability]
    const ranges = updated[dayIdx].ranges.filter((_, i) => i !== rangeIdx)
    updated[dayIdx] = {
      ...updated[dayIdx],
      ranges: ranges.length > 0 ? ranges : [{ start_time: '18:00', end_time: '21:00' }],
      enabled: ranges.length > 0 ? updated[dayIdx].enabled : false,
    }
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
            <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Days */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Available hours</label>
        <div className="space-y-2">
          {DAYS.map((day, i) => {
            const slot = availability[i]
            return (
              <div key={day} className={`rounded-lg border p-2.5 transition-colors ${slot.enabled ? 'border-border bg-background' : 'border-border/50 bg-surface'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => toggleDay(i)}
                    className={`w-10 text-xs font-medium rounded-md py-1 cursor-pointer transition-colors shrink-0 ${slot.enabled ? 'bg-foreground text-white' : 'bg-surface text-muted border border-border'}`}
                  >
                    {day}
                  </button>
                  {!slot.enabled && <span className="text-xs text-muted">Unavailable</span>}
                </div>

                {slot.enabled && (
                  <div className="space-y-1.5 pl-12">
                    {slot.ranges.map((range, ri) => (
                      <div key={ri} className="flex items-center gap-1.5">
                        <select
                          value={range.start_time}
                          onChange={(e) => updateRange(i, ri, 'start_time', e.target.value)}
                          className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-highlight/20"
                        >
                          {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span className="text-xs text-muted shrink-0">to</span>
                        <select
                          value={range.end_time}
                          onChange={(e) => updateRange(i, ri, 'end_time', e.target.value)}
                          className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-highlight/20"
                        >
                          {TIMES.filter((t) => t > range.start_time).map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        {slot.ranges.length > 1 && (
                          <button
                            onClick={() => removeRange(i, ri)}
                            className="p-1 text-muted hover:text-highlight cursor-pointer shrink-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => addRange(i)}
                      className="flex items-center gap-1 text-xs text-muted hover:text-highlight cursor-pointer mt-1"
                    >
                      <Plus size={12} /> Add slot
                    </button>
                  </div>
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
          <Button variant="ghost" size="sm" onClick={onSkip}>Skip for now</Button>
        )}
      </div>
      {enabledCount === 0 && (
        <p className="text-xs text-highlight text-center">Select at least one day</p>
      )}
    </div>
  )
}
