const TOKEN_KEY = 'gth_google_token'
const GCAL_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'
const REDIRECT_URI = window.location.origin

// ── Token management ──

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function storeToken(accessToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
}

export function isGoogleConnected(): boolean {
  return !!localStorage.getItem(TOKEN_KEY)
}

// ── Connect via Google OAuth implicit flow ──

export function connectGoogleCalendar() {
  const params = new URLSearchParams({
    client_id: GCAL_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: CALENDAR_SCOPE,
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// ── Parse token from URL hash after redirect ──

export function captureTokenFromUrl(): boolean {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token')) return false

  const params = new URLSearchParams(hash.substring(1))
  const token = params.get('access_token')
  if (token) {
    storeToken(token)
    // Clean the URL
    window.history.replaceState(null, '', window.location.pathname)
    return true
  }
  return false
}

export function disconnectGoogle() {
  clearTokens()
}

// ── Fetch Google Calendar events ──

export interface GoogleCalendarEvent {
  id: string
  title: string
  start: string
  end: string
  startTime: string
  endTime: string
  date: string
  allDay: boolean
  location?: string
  description?: string
  htmlLink?: string
  source: 'google'
}

// ── Create a Google Calendar event ──

export async function createGoogleEvent(params: {
  title: string
  date: string      // yyyy-MM-dd
  startTime: string  // HH:mm
  endTime: string    // HH:mm
  description?: string
}): Promise<boolean> {
  const token = getStoredToken()
  if (!token) return false

  try {
    // Build ISO datetime strings with local timezone
    const startDt = `${params.date}T${params.startTime}:00`
    const endDt = `${params.date}T${params.endTime}:00`

    // Get the user's timezone
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

    const body = {
      summary: params.title,
      description: params.description || undefined,
      start: { dateTime: startDt, timeZone },
      end: { dateTime: endDt, timeZone },
    }

    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    if (res.status === 401) {
      clearTokens()
      return false
    }

    return res.ok
  } catch (err) {
    console.error('Failed to create Google Calendar event:', err)
    return false
  }
}

// ── Delete a Google Calendar event ──

export async function deleteGoogleEvent(googleEventId: string): Promise<boolean> {
  const token = getStoredToken()
  if (!token) return false

  // Strip the gcal_ prefix if present
  const realId = googleEventId.replace('gcal_', '')

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${realId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    if (res.status === 401) {
      clearTokens()
      return false
    }

    return res.ok || res.status === 204
  } catch (err) {
    console.error('Failed to delete Google Calendar event:', err)
    return false
  }
}

// ── Fetch Google Calendar events ──

export async function fetchGoogleEvents(
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const token = getStoredToken()
  if (!token) return []

  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    })

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    if (res.status === 401) {
      clearTokens()
      return []
    }

    if (!res.ok) {
      console.error('Google Calendar API error:', res.status)
      return []
    }

    const data = await res.json()
    const items = data.items || []

    return items
      .filter((item: any) => item.status !== 'cancelled')
      .map((item: any): GoogleCalendarEvent => {
        const startDt = item.start?.dateTime || item.start?.date || ''
        const endDt = item.end?.dateTime || item.end?.date || ''
        const allDay = !item.start?.dateTime
        const startDate = new Date(startDt)
        const endDate = new Date(endDt)

        return {
          id: `gcal_${item.id}`,
          title: item.summary || '(No title)',
          start: startDt,
          end: endDt,
          startTime: allDay ? '00:00' : `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
          endTime: allDay ? '23:59' : `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`,
          date: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`,
          allDay,
          location: item.location,
          description: item.description,
          htmlLink: item.htmlLink,
          source: 'google',
        }
      })
  } catch (err) {
    console.error('Failed to fetch Google Calendar events:', err)
    return []
  }
}
