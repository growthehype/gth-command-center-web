import { supabase } from './supabase'

const TOKEN_KEY = 'gth_google_token'
const REFRESH_KEY = 'gth_google_refresh'
const CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'

// ── Token management ──

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function storeTokens(accessToken: string, refreshToken?: string | null) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export function isGoogleConnected(): boolean {
  return !!localStorage.getItem(TOKEN_KEY)
}

// ── Connect / Disconnect ──

export async function connectGoogleCalendar() {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      scopes: CALENDAR_SCOPES,
      redirectTo: window.location.origin + '/auth/callback',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })
  if (error) throw error
}

export function disconnectGoogle() {
  clearTokens()
}

// ── Fetch Google Calendar events ──

export interface GoogleCalendarEvent {
  id: string
  title: string
  start: string // ISO datetime or date
  end: string
  startTime: string // HH:mm
  endTime: string
  date: string // yyyy-MM-dd
  allDay: boolean
  location?: string
  description?: string
  htmlLink?: string
  source: 'google'
}

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
      // Token expired
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
