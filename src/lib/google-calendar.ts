// ── Google Calendar — shares Gmail's auth (same access token + server-side refresh) ──
// Calendar piggybacks on Gmail's OAuth connection. Tokens are shared via localStorage keys.

import { supabase } from '@/lib/supabase'

const GMAIL_TOKEN_KEY = 'gth_gmail_token'
const GMAIL_EVER_CONNECTED = 'gth_gmail_ever_connected'

interface StoredToken {
  access_token: string
  expires_at: number
}

function getLocalToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(GMAIL_TOKEN_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredToken
  } catch {
    localStorage.removeItem(GMAIL_TOKEN_KEY)
    return null
  }
}

function saveToken(token: StoredToken) {
  localStorage.setItem(GMAIL_TOKEN_KEY, JSON.stringify(token))
  localStorage.setItem(GMAIL_EVER_CONNECTED, 'true')
}

function hasServerRefreshToken(): boolean {
  return localStorage.getItem(GMAIL_EVER_CONNECTED) === 'true'
}

async function getAuthToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  } catch {
    return null
  }
}

// ── Refresh logic (sends JWT for user identification) ──

async function refreshAccessToken(): Promise<boolean> {
  if (!hasServerRefreshToken()) return false

  try {
    const jwt = await getAuthToken()
    if (!jwt) return false

    const res = await fetch('/api/google-refresh-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({}),
    })
    if (!res.ok) return false
    const data = await res.json()
    const seconds = data.expires_in || 3600
    saveToken({ access_token: data.access_token, expires_at: Date.now() + seconds * 1000 })
    return true
  } catch {
    return false
  }
}

async function ensureToken(): Promise<string | null> {
  const token = getLocalToken()
  if (token && Date.now() < token.expires_at - 30_000) return token.access_token

  // Try server-side refresh
  if (hasServerRefreshToken()) {
    const ok = await refreshAccessToken()
    if (ok) return getLocalToken()?.access_token || null
  }

  // Fallback: return token even if close to expiry
  if (token && Date.now() < token.expires_at) return token.access_token
  return null
}

// ── Public connection API ──

export function isGoogleConnected(): boolean {
  const token = getLocalToken()
  if (token && Date.now() < token.expires_at - 30_000) return true
  if (hasServerRefreshToken()) return true
  return false
}

export async function initGoogleToken(): Promise<boolean> {
  const token = getLocalToken()
  if (token && Date.now() < token.expires_at - 30_000) return true

  if (hasServerRefreshToken()) {
    return refreshAccessToken()
  }

  return false
}

export async function silentReconnectIfNeeded(): Promise<boolean> {
  if (isGoogleConnected()) return true
  if (hasServerRefreshToken()) return refreshAccessToken()
  return false
}

export function connectGoogleCalendar(_silent = false) {
  const returnPage = 'calendar'
  window.location.href = `/api/google-auth?returnPage=${encodeURIComponent(returnPage)}`
}

export async function captureTokenFromUrl(): Promise<boolean> {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token=')) return false

  try {
    const params = new URLSearchParams(hash.substring(1))
    const accessToken = params.get('access_token')
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10)

    if (!accessToken) return false

    saveToken({
      access_token: accessToken,
      expires_at: Date.now() + expiresIn * 1000,
    })

    window.history.replaceState(null, '', window.location.pathname)
    return true
  } catch {
    return false
  }
}

export async function disconnectGoogle() {
  // No-op — Calendar piggybacks on Gmail's auth
}

export async function clearTokens() {
  localStorage.removeItem(GMAIL_TOKEN_KEY)
  localStorage.removeItem(GMAIL_EVER_CONNECTED)
}

export async function storeToken(accessToken: string, expiresInSeconds: number) {
  saveToken({
    access_token: accessToken,
    expires_at: Date.now() + expiresInSeconds * 1000,
  })
}

// ── Helper: make an authenticated Google API request ──

async function googleFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const token = await ensureToken()
  if (!token) return null

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init?.headers as Record<string, string> || {}),
  }

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    // Try one refresh then retry
    const ok = await refreshAccessToken()
    if (ok) {
      const newToken = getLocalToken()
      if (newToken) {
        const retryHeaders: Record<string, string> = {
          Authorization: `Bearer ${newToken.access_token}`,
          ...(init?.headers as Record<string, string> || {}),
        }
        const retry = await fetch(url, { ...init, headers: retryHeaders })
        if (retry.status === 401) return null
        return retry
      }
    }
    return null
  }

  return res
}

// ── Google Calendar event types ──

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
  date: string
  startTime: string
  endTime: string
  description?: string
}): Promise<boolean> {
  try {
    const startDt = `${params.date}T${params.startTime}:00`
    const endDt = `${params.date}T${params.endTime}:00`
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

    const body = {
      summary: params.title,
      description: params.description || undefined,
      start: { dateTime: startDt, timeZone },
      end: { dateTime: endDt, timeZone },
    }

    const res = await googleFetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    return res?.ok ?? false
  } catch {
    return false
  }
}

// ── Delete a Google Calendar event ──

export async function deleteGoogleEvent(googleEventId: string): Promise<boolean> {
  const realId = googleEventId.replace('gcal_', '')

  try {
    const res = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${realId}`,
      { method: 'DELETE' }
    )

    return res ? (res.ok || res.status === 204) : false
  } catch {
    return false
  }
}

// ── Fetch Google Calendar events ──

export async function fetchGoogleEvents(
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    })

    const res = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`
    )

    if (!res || !res.ok) {
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
  } catch {
    return []
  }
}
