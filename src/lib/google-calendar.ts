import { supabase } from './supabase'

const TOKEN_KEY = 'gth_google_token'
const GCAL_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'
const REDIRECT_URI = window.location.origin
const CREDENTIAL_PLATFORM = 'google_calendar'

// ── Token shape stored in both localStorage and Supabase ──

interface StoredToken {
  access_token: string
  expires_at: number // unix ms
}

// ── Helpers ──

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function isExpired(token: StoredToken): boolean {
  // Treat as expired 60 s early to avoid mid-request failures
  return Date.now() >= token.expires_at - 60_000
}

// ── Local cache (fast, device-specific) ──

function getLocalToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredToken
  } catch {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }
}

function setLocalToken(token: StoredToken) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
}

function clearLocalToken() {
  localStorage.removeItem(TOKEN_KEY)
}

// ── Supabase persistence (cross-device source of truth) ──

async function getSupabaseToken(): Promise<StoredToken | null> {
  const userId = await currentUserId()
  if (!userId) return null

  const { data } = await supabase
    .from('credentials')
    .select('id, fields')
    .eq('user_id', userId)
    .eq('platform', CREDENTIAL_PLATFORM)
    .is('client_id', null)
    .limit(1)
    .maybeSingle()

  if (!data?.fields) return null

  try {
    const parsed = typeof data.fields === 'string' ? JSON.parse(data.fields) : data.fields
    if (parsed.access_token && parsed.expires_at) {
      return parsed as StoredToken
    }
  } catch { /* bad data, ignore */ }
  return null
}

async function saveSupabaseToken(token: StoredToken) {
  const userId = await currentUserId()
  if (!userId) return

  const fields = JSON.stringify(token)

  // Upsert: update existing row or insert new one
  const { data: existing } = await supabase
    .from('credentials')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', CREDENTIAL_PLATFORM)
    .is('client_id', null)
    .limit(1)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('credentials')
      .update({ fields })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('credentials')
      .insert({
        user_id: userId,
        platform: CREDENTIAL_PLATFORM,
        client_id: null,
        fields,
        created_at: new Date().toISOString(),
      })
  }
}

async function clearSupabaseToken() {
  const userId = await currentUserId()
  if (!userId) return

  await supabase
    .from('credentials')
    .delete()
    .eq('user_id', userId)
    .eq('platform', CREDENTIAL_PLATFORM)
    .is('client_id', null)
}

// ── Public token API ──

/**
 * Get a valid access token. Checks localStorage first, then Supabase.
 * Returns null if no token or token is expired.
 */
export async function getStoredToken(): Promise<string | null> {
  // 1. Fast path: check localStorage cache
  const local = getLocalToken()
  if (local && !isExpired(local)) {
    return local.access_token
  }

  // 2. Slow path: check Supabase (cross-device)
  const remote = await getSupabaseToken()
  if (remote && !isExpired(remote)) {
    // Cache locally for next time
    setLocalToken(remote)
    return remote.access_token
  }

  // 3. No valid token anywhere — clear stale data
  clearLocalToken()
  return null
}

/**
 * Synchronous check — uses localStorage only.
 * For UI that needs an instant answer (e.g. showing Connect button).
 * Call initGoogleToken() on app load to hydrate localStorage from Supabase.
 */
export function isGoogleConnected(): boolean {
  const local = getLocalToken()
  return !!local && !isExpired(local)
}

/**
 * Store a new token in both localStorage and Supabase.
 */
export async function storeToken(accessToken: string, expiresInSeconds: number) {
  const token: StoredToken = {
    access_token: accessToken,
    expires_at: Date.now() + expiresInSeconds * 1000,
  }
  setLocalToken(token)
  await saveSupabaseToken(token)
}

/**
 * Clear token from all stores.
 */
export async function clearTokens() {
  clearLocalToken()
  await clearSupabaseToken()
}

/**
 * On app load, hydrate localStorage from Supabase so isGoogleConnected()
 * works synchronously even on a new device.
 * If token exists but is expired, attempt a silent re-auth redirect.
 */
export async function initGoogleToken(): Promise<boolean> {
  // If localStorage already has a valid token, we're good
  const local = getLocalToken()
  if (local && !isExpired(local)) return true

  // Try Supabase
  const remote = await getSupabaseToken()
  if (remote && !isExpired(remote)) {
    setLocalToken(remote)
    return true
  }

  // Token existed but expired — user was previously connected.
  // Attempt a silent re-auth so they don't have to click "Connect" again.
  const hadToken = !!local || !!remote
  if (hadToken) {
    // Mark that we're attempting silent re-auth to avoid infinite loops
    const silentKey = 'gth_gcal_silent_reauth'
    const lastAttempt = sessionStorage.getItem(silentKey)
    if (!lastAttempt) {
      sessionStorage.setItem(silentKey, Date.now().toString())
      connectGoogleCalendar(true)
      return false // Will redirect, page won't continue
    }
    // Already tried this session, don't loop
    sessionStorage.removeItem(silentKey)
  }

  clearLocalToken()
  return false
}

// ── Connect via Google OAuth implicit flow ──

export function connectGoogleCalendar(silent = false) {
  const params = new URLSearchParams({
    client_id: GCAL_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: CALENDAR_SCOPE,
    include_granted_scopes: 'true',
  })
  // For silent re-auth after token expiry (user already granted access before)
  if (silent) {
    params.set('prompt', 'none')
  }
  // No 'prompt' parameter by default — Google will silently reuse existing grants
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// ── Parse token from URL hash after redirect ──

export async function captureTokenFromUrl(): Promise<boolean> {
  const hash = window.location.hash
  if (!hash) return false

  const params = new URLSearchParams(hash.substring(1))

  // Handle error from silent re-auth (e.g. user revoked access)
  const error = params.get('error')
  if (error) {
    // Silent re-auth failed — clear the attempt flag and clean URL
    sessionStorage.removeItem('gth_gcal_silent_reauth')
    window.history.replaceState(null, '', window.location.pathname)
    if (error === 'interaction_required' || error === 'access_denied') {
      // User needs to manually reconnect — clear old tokens
      clearLocalToken()
      await clearSupabaseToken()
    }
    return false
  }

  if (!hash.includes('access_token')) return false

  const token = params.get('access_token')
  const expiresIn = params.get('expires_in')

  if (token) {
    const seconds = expiresIn ? parseInt(expiresIn, 10) : 3600
    await storeToken(token, seconds)
    // Clear silent re-auth flag on success
    sessionStorage.removeItem('gth_gcal_silent_reauth')
    // Clean the URL
    window.history.replaceState(null, '', window.location.pathname)
    return true
  }
  return false
}

export async function disconnectGoogle() {
  await clearTokens()
}

// ── Helper: make an authenticated Google API request with 401 handling ──

async function googleFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const token = await getStoredToken()
  if (!token) return null

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init?.headers as Record<string, string> || {}),
  }

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    // Token rejected — clear everywhere and signal reconnect needed
    await clearTokens()
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
  date: string      // yyyy-MM-dd
  startTime: string  // HH:mm
  endTime: string    // HH:mm
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
