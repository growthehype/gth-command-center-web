// ── Google Calendar — uses shared server-side refresh token flow ──
// Same auth as Gmail: access token + refresh token stored in localStorage.
// The refresh token is obtained via /api/google-auth (authorization code flow)
// and refreshed via /api/google-refresh — so the user stays connected permanently.

const GMAIL_TOKEN_KEY = 'gth_gmail_token'
const GMAIL_REFRESH_KEY = 'gth_gmail_refresh_token'
const GMAIL_EVER_CONNECTED = 'gth_gmail_ever_connected'

interface StoredToken {
  access_token: string
  expires_at: number
}

// ── Token helpers (shared with gmail.ts via localStorage keys) ──

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

function getRefreshToken(): string | null {
  return localStorage.getItem(GMAIL_REFRESH_KEY)
}

// ── Refresh logic ──

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const res = await fetch('/api/google-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
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

  // Try refresh
  if (getRefreshToken()) {
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
  if (getRefreshToken()) return true // has refresh token = permanently connected
  return false
}

export async function initGoogleToken(): Promise<boolean> {
  // If we have a valid access token, we're good
  const token = getLocalToken()
  if (token && Date.now() < token.expires_at - 30_000) return true

  // If we have a refresh token, try to get a new access token
  if (getRefreshToken()) {
    const ok = await refreshAccessToken()
    return ok
  }

  return false
}

export async function silentReconnectIfNeeded(): Promise<boolean> {
  // With refresh tokens, we just refresh — no redirect needed
  if (isGoogleConnected()) return true

  if (getRefreshToken()) {
    return await refreshAccessToken()
  }

  return false
}

export function connectGoogleCalendar(_silent = false) {
  // Use the server-side OAuth flow (same as Gmail) — includes calendar scopes
  const returnPage = 'calendar'
  window.location.href = `/api/google-auth?returnPage=${encodeURIComponent(returnPage)}`
}

export async function captureTokenFromUrl(): Promise<boolean> {
  // Server-side flow handles token capture via the callback page (saves to localStorage)
  // Also support legacy implicit flow fallback: #access_token=...
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
  // Only clear the calendar credential marker — don't wipe Gmail tokens
  // since they're shared. User can disconnect Gmail separately.
  // For now, this is a no-op since Calendar piggybacks on Gmail's auth.
  // The "Disconnect" button in Calendar UI should just clear the local UI state.
}

export async function clearTokens() {
  // Full disconnect (also disconnects Gmail since tokens are shared)
  localStorage.removeItem(GMAIL_TOKEN_KEY)
  localStorage.removeItem(GMAIL_REFRESH_KEY)
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
  } catch (err) {
    console.error('Failed to create Google Calendar event:', err)
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
      if (res && !res.ok) console.error('Google Calendar API error:', res.status)
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
