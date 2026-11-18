// Omar's Google Calendar, read and written on the server with the same Google
// connection the CRM already uses for Gmail (it was granted calendar access).
// Events are created without guests, so no invitations are ever emailed.
import { getAccessToken } from './gmail-server'

const TZ = 'America/Edmonton'
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

/** Offset like -07:00 for a local Edmonton date/time (handles daylight saving). */
function offsetFor(date: string, time = '12:00') {
  const guess = new Date(`${date}T${time}:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(guess)
  const off = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-07:00'
  return off.replace('GMT', '') || '-07:00'
}
const local = (iso: string) => new Date(iso).toLocaleString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

async function gfetch(userId: string, url: string, init: RequestInit = {}) {
  const token = await getAccessToken(userId)
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  if (res.status === 403 || res.status === 401) throw new Error('Google Calendar access is not granted. Reconnect Google in the CRM (Inbox page) and allow Calendar.')
  if (!res.ok) throw new Error(`Google Calendar error ${res.status}`)
  return res.status === 204 ? null : res.json()
}

export async function listEvents(userId: string, startDate: string, endDate: string) {
  const timeMin = new Date(`${startDate}T00:00:00${offsetFor(startDate, '00:00')}`).toISOString()
  const timeMax = new Date(`${endDate}T23:59:59${offsetFor(endDate, '23:59')}`).toISOString()
  const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' })
  const data: any = await gfetch(userId, `${API}?${q}`)
  return (data?.items || []).filter((e: any) => e.status !== 'cancelled').map((e: any) => ({
    id: e.id,
    title: e.summary || '(no title)',
    when: e.start?.dateTime ? `${local(e.start.dateTime)} to ${new Date(e.end.dateTime).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}` : `${e.start?.date} (all day)`,
    date: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleDateString('en-CA', { timeZone: TZ }) : e.start?.date,
    location: e.location || undefined,
  }))
}

export async function createEvent(userId: string, a: { title: string; date: string; start_time?: string; end_time?: string; duration_minutes?: number; location?: string; notes?: string }) {
  const title = String(a.title || '').trim().slice(0, 200)
  if (!title) throw new Error('Event title is required.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) throw new Error('Date must be YYYY-MM-DD.')
  const body: any = { summary: title, location: a.location || undefined, description: a.notes || undefined, reminders: { useDefault: true } }
  if (a.start_time) {
    if (!/^\d{2}:\d{2}$/.test(a.start_time)) throw new Error('start_time must be HH:MM (24-hour).')
    const start = new Date(`${a.date}T${a.start_time}:00${offsetFor(a.date, a.start_time)}`)
    let end: Date
    if (a.end_time && /^\d{2}:\d{2}$/.test(a.end_time)) end = new Date(`${a.date}T${a.end_time}:00${offsetFor(a.date, a.end_time)}`)
    else end = new Date(start.getTime() + (Number(a.duration_minutes) > 0 ? Number(a.duration_minutes) : 60) * 60000)
    if (end <= start) throw new Error('The end time must be after the start time.')
    body.start = { dateTime: start.toISOString(), timeZone: TZ }
    body.end = { dateTime: end.toISOString(), timeZone: TZ }
  } else {
    const next = new Date(`${a.date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1)
    body.start = { date: a.date }; body.end = { date: next.toISOString().slice(0, 10) }
  }
  // sendUpdates=none and no attendees: nothing is emailed to anyone
  const e: any = await gfetch(userId, `${API}?sendUpdates=none`, { method: 'POST', body: JSON.stringify(body) })
  return { created: true, id: e.id, title: e.summary, when: e.start?.dateTime ? local(e.start.dateTime) : `${e.start?.date} (all day)`, link: e.htmlLink }
}

export async function moveOrRenameEvent(userId: string, a: { event_id: string; title?: string; date?: string; start_time?: string; duration_minutes?: number }) {
  const cur: any = await gfetch(userId, `${API}/${encodeURIComponent(a.event_id)}`)
  const patch: any = {}
  if (a.title) patch.summary = String(a.title).slice(0, 200)
  if (a.date || a.start_time) {
    const date = a.date || (cur.start?.dateTime ? new Date(cur.start.dateTime).toLocaleDateString('en-CA', { timeZone: TZ }) : cur.start?.date)
    if (a.start_time || cur.start?.dateTime) {
      const time = a.start_time || new Date(cur.start.dateTime).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
      const dur = Number(a.duration_minutes) > 0 ? Number(a.duration_minutes) : cur.start?.dateTime ? (new Date(cur.end.dateTime).getTime() - new Date(cur.start.dateTime).getTime()) / 60000 : 60
      const start = new Date(`${date}T${time}:00${offsetFor(date, time)}`)
      patch.start = { dateTime: start.toISOString(), timeZone: TZ }
      patch.end = { dateTime: new Date(start.getTime() + dur * 60000).toISOString(), timeZone: TZ }
    }
  }
  const e: any = await gfetch(userId, `${API}/${encodeURIComponent(a.event_id)}?sendUpdates=none`, { method: 'PATCH', body: JSON.stringify(patch) })
  return { updated: true, title: e.summary, when: e.start?.dateTime ? local(e.start.dateTime) : e.start?.date }
}

/** Timed events that have already ended, with guests, for time tracking. */
export async function pastTimedEvents(userId: string, days: number) {
  const now = new Date()
  const q = new URLSearchParams({ timeMin: new Date(now.getTime() - days * 86400000).toISOString(), timeMax: now.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })
  const data: any = await gfetch(userId, `${API}?${q}`)
  return (data?.items || [])
    .filter((e: any) => e.status !== 'cancelled' && e.start?.dateTime && e.end?.dateTime && new Date(e.end.dateTime) <= now)
    .filter((e: any) => !(e.attendees || []).some((a: any) => a.self && a.responseStatus === 'declined'))
    .map((e: any) => ({
      id: String(e.id), title: String(e.summary || '(no title)'), description: String(e.description || '').slice(0, 300), location: e.location || '',
      start: e.start.dateTime as string, end: e.end.dateTime as string,
      minutes: Math.round((new Date(e.end.dateTime).getTime() - new Date(e.start.dateTime).getTime()) / 60000),
      guests: (e.attendees || []).filter((a: any) => !a.self && a.email).map((a: any) => String(a.email).toLowerCase()),
      date: new Date(e.start.dateTime).toLocaleDateString('en-CA', { timeZone: TZ }),
    }))
}
