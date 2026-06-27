const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPES = 'https://www.googleapis.com/auth/calendar.events'
const REDIRECT_URI = `${window.location.origin}/onboarding?gcal=callback`

export function getGoogleAuthUrl() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function isGCalCallback() {
  const params = new URLSearchParams(window.location.search)
  return params.get('gcal') === 'callback' && params.has('code')
}

export function getGCalAuthCode() {
  return new URLSearchParams(window.location.search).get('code')
}

export async function createCalendarEvent({ accessToken, title, description, startTime, endTime, attendeeEmail }) {
  const event = {
    summary: `Tome: ${title}`,
    description,
    start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: { dateTime: endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    conferenceData: {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
    },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) throw new Error('Failed to create calendar event')
  return res.json()
}
