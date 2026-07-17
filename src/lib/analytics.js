import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

let enabled = false

// No-ops until VITE_POSTHOG_KEY is set, so this ships safely before the key exists.
export function initAnalytics() {
  if (!KEY || enabled) return
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
  })
  enabled = true
}

export function track(event, properties) {
  if (!enabled) return
  posthog.capture(event, properties)
}

export function identify(userId, traits) {
  if (!enabled || !userId) return
  posthog.identify(userId, traits)
}
