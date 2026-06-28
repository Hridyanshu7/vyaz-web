import { supabase } from './supabase'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy'

export function getGoogleAuthUrl() {
  const redirectUri = `${window.location.origin}${window.location.pathname}`
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: 'gcal_connect',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function isGCalCallback() {
  const params = new URLSearchParams(window.location.search)
  return params.get('state') === 'gcal_connect' && params.has('code')
}

export function getGCalAuthCode() {
  return new URLSearchParams(window.location.search).get('code')
}

async function callGCalFunction(body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcal`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Edge function call failed')
  return data
}

export async function exchangeGCalToken(code) {
  const redirectUri = `${window.location.origin}${window.location.pathname}`
  return callGCalFunction({ action: 'exchange-token', code, redirectUri })
}

export async function createSessionEvent(sessionId) {
  return callGCalFunction({ action: 'create-event', sessionId })
}

export async function getNarratorAvailability(narratorId, startDate, endDate) {
  return callGCalFunction({
    action: 'get-availability',
    narratorId,
    startDate,
    endDate,
  })
}
