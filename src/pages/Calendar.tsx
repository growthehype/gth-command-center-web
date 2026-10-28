import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import {
  connectGoogleCalendar,
  disconnectGoogle,
  isGoogleConnected,
  initGoogleToken,
  silentReconnectIfNeeded,
  fetchGoogleEvents,
  createGoogleEvent,
  deleteGoogleEvent,
  type GoogleCalendarEvent,
} from '@/lib/google-calendar'
import { useConfirm } from '@/hooks/useConfirm'
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addDays,
  eachDayOfInterval,
  isToday,
  isSameMonth,
  isSameDay,
} from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  ExternalLink,
  Unplug,
  CalendarDays,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6am..10pm
const HOUR_H = 56 // px per hour in the week grid
const GRID_START_MIN = HOURS[0] * 60
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type CalendarView = 'week' | 'month' | 'agenda'

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function hourLabel(h: number): string {
  if (h === 0 || h === 12) return '12'
  return String(h > 12 ? h - 12 : h)
}

function ampm(h: number): string {
  return h < 12 ? 'AM' : 'PM'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatTimeRange(startTime: string | undefined, endTime: string | undefined, allDay: boolean): string {
  if (allDay) return 'All day'
  const s = startTime?.slice(0, 5) ?? ''
  const e = endTime?.slice(0, 5) ?? ''
  if (!s) return ''
  const formatT = (t: string) => {
    const [hStr, m] = t.split(':')
    const h = parseInt(hStr, 10)
    const suffix = h < 12 ? 'AM' : 'PM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${m} ${suffix}`
  }
  return `${formatT(s)} - ${formatT(e)}`
}

function agendaDateLabel(date: Date): string {
  const today = new Date()
  if (isSameDay(date, today)) return 'Today'
  const tomorrow = addDays(today, 1)
  if (isSameDay(date, tomorrow)) return 'Tomorrow'
  return format(date, 'EEEE, MMM d')
}

/* ------------------------------------------------------------------ */
/*  Event form                                                        */
/* ------------------------------------------------------------------ */

interface EventForm {
  date: string
  start_time: string
  end_time: string
  title: string
  client_id: string
}

const blankForm = (date?: string, hour?: number): EventForm => ({
  date: date ?? format(new Date(), 'yyyy-MM-dd'),
  start_time: hour !== undefined ? `${pad2(hour)}:00` : '09:00',
  end_time: hour !== undefined ? `${pad2(hour + 1)}:00` : '10:00',
  title: '',
  client_id: '',
})

/* ------------------------------------------------------------------ */
/*  Layout + time helpers                                             */
/* ------------------------------------------------------------------ */

const toMin = (t?: string) => {
  if (!t) return 0
  const [h, m] = t.split(':').map((n) => parseInt(n, 10))
  return (h || 0) * 60 + (m || 0)
}

/** Events are saved as "Title — Client"; show them as two lines. */
function splitTitle(title: string): { displayTitle: string; clientName: string | null } {
  const idx = title.lastIndexOf(' — ')
  if (idx > 0) return { displayTitle: title.slice(0, idx), clientName: title.slice(idx + 3) }
  return { displayTitle: title, clientName: null }
}

function hourMinLabel(t?: string) {
  if (!t) return ''
  const min = toMin(t)
  const h = Math.floor(min / 60)
  const m = min % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${pad2(m)}` : ''}${h < 12 ? 'a' : 'p'}`
}

function eventStart(ev: GoogleCalendarEvent) {
  const d = new Date(`${ev.date}T00:00:00`)
  if (!ev.allDay) d.setMinutes(toMin(ev.startTime))
  return d
}
function eventEnd(ev: GoogleCalendarEvent) {
  const d = new Date(`${ev.date}T00:00:00`)
  if (ev.allDay) d.setDate(d.getDate() + 1)
  else d.setMinutes(Math.max(toMin(ev.endTime), toMin(ev.startTime) + 15))
  return d
}
const isPastEvent = (ev: GoogleCalendarEvent, now: Date) => eventEnd(ev) < now
const isLiveEvent = (ev: GoogleCalendarEvent, now: Date) => !ev.allDay && eventStart(ev) <= now && eventEnd(ev) > now

function relativeWhen(ev: GoogleCalendarEvent, now: Date) {
  if (isLiveEvent(ev, now)) return 'Happening now'
  const start = eventStart(ev)
  const mins = Math.round((start.getTime() - now.getTime()) / 60000)
  if (isSameDay(start, now)) {
    if (ev.allDay) return 'Today'
    if (mins < 60) return `In ${mins} min`
    const h = Math.round(mins / 60)
    return `In ${h} ${h === 1 ? 'hour' : 'hours'}`
  }
  if (isSameDay(start, addDays(now, 1))) return 'Tomorrow'
  return format(start, 'EEEE')
}

interface LaidOut { ev: GoogleCalendarEvent; top: number; height: number; lane: number; lanes: number }

/** Position timed events by start and duration; overlapping events share the column. */
function layoutDay(dayEvents: GoogleCalendarEvent[]): LaidOut[] {
  const timed = dayEvents
    .filter((e) => !e.allDay)
    .map((ev) => {
      const s = toMin(ev.startTime)
      const e = Math.max(toMin(ev.endTime), s + 15)
      return { ev, s, e }
    })
    .sort((a, b) => a.s - b.s || b.e - a.e)

  const out: LaidOut[] = []
  let cluster: { ev: GoogleCalendarEvent; s: number; e: number; lane: number }[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1))
    cluster.forEach((c) => {
      const top = ((c.s - GRID_START_MIN) / 60) * HOUR_H
      const height = Math.max(24, ((c.e - c.s) / 60) * HOUR_H - 3)
      out.push({ ev: c.ev, top: Math.max(0, top), height, lane: c.lane, lanes })
    })
    cluster = []
  }
  timed.forEach((item) => {
    if (item.s >= clusterEnd && cluster.length) flush()
    const used = new Set(cluster.filter((c) => c.e > item.s).map((c) => c.lane))
    let lane = 0
    while (used.has(lane)) lane++
    cluster.push({ ...item, lane })
    clusterEnd = Math.max(clusterEnd, item.e)
  })
  if (cluster.length) flush()
  return out
}

/** Sample week used in demo mode so the calendar can be previewed. */
function sampleEvents(weekStart: Date): GoogleCalendarEvent[] {
  const mk = (dayOffset: number, title: string, startTime: string, endTime: string, extra: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent => {
    const date = format(addDays(weekStart, dayOffset), 'yyyy-MM-dd')
    return { id: `demo-${dayOffset}-${startTime}-${title}`, title, start: `${date}T${startTime}`, end: `${date}T${endTime}`, startTime, endTime, date, allDay: false, source: 'google', ...extra }
  }
  return [
    mk(0, 'Weekly planning', '09:00', '09:45'),
    mk(0, 'Campaign review — Pinnacle Auto Group', '13:00', '14:00', { location: 'Google Meet' }),
    mk(1, 'Site walkthrough — Greenleaf Landscaping', '10:30', '11:30', { location: 'On site' }),
    mk(1, 'Content shoot prep', '11:00', '12:00'),
    mk(2, 'Discovery call — Aurora Wellness Spa', '09:30', '10:15', { location: 'Zoom' }),
    mk(2, 'Deep work: landing pages', '13:00', '16:00'),
    mk(3, 'Ad performance check-in — Velociti Fitness', '15:00', '15:30'),
    mk(4, 'Invoice run', '10:00', '10:30'),
    mk(4, 'Strategy session', '14:00', '15:30', { location: 'Office' }),
    { ...mk(3, 'Quarter planning day', '00:00', '23:59'), allDay: true, id: 'demo-allday' },
  ]
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function Calendar() {
  const { clients, demoMode } = useAppStore()
  const { confirm, ConfirmDialog } = useConfirm()

  // View mode
  const [view, setView] = useState<CalendarView>('week')

  // Week navigation
  const [anchor, setAnchor] = useState(new Date())
  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const weekEnd = useMemo(() => endOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd])

  // Month view dates
  const monthStart = useMemo(() => startOfMonth(anchor), [anchor])
  const monthEnd = useMemo(() => endOfMonth(anchor), [anchor])
  const monthGridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart])
  const monthGridEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd])
  const monthDays = useMemo(() => eachDayOfInterval({ start: monthGridStart, end: monthGridEnd }), [monthGridStart, monthGridEnd])

  // Agenda view dates (next 14 days from today)
  const agendaStart = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }, [])
  const agendaEnd = useMemo(() => addDays(agendaStart, 13), [agendaStart])

  // Compute fetch range based on view
  const fetchStart = useMemo(() => {
    if (view === 'month') return monthGridStart
    if (view === 'agenda') return agendaStart
    return weekStart
  }, [view, weekStart, monthGridStart, agendaStart])

  const fetchEnd = useMemo(() => {
    if (view === 'month') return monthGridEnd
    if (view === 'agenda') return agendaEnd
    return weekEnd
  }, [view, weekEnd, monthGridEnd, agendaEnd])

  // Google Calendar — start as null (loading) to avoid flash of "Connect" button
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([])
  const [loading, setLoading] = useState(false)

  // Modals
  const [modalOpen, setModalOpen] = useState(false)
  const [viewEvent, setViewEvent] = useState<GoogleCalendarEvent | null>(null)
  const [form, setForm] = useState<EventForm>(blankForm())
  const [saving, setSaving] = useState(false)

  // Hydrate token from Supabase FIRST, then set connected state
  useEffect(() => {
    if (demoMode) { setGoogleConnected(true); return }
    initGoogleToken().then((connected) => {
      setGoogleConnected(connected)
      if (!connected) {
        silentReconnectIfNeeded()
      }
    })
  }, [])

  // Load Google events when connected or date range changes
  const loadEvents = useCallback(() => {
    if (!googleConnected) return
    if (demoMode) {
      const base = startOfWeek(new Date(), { weekStartsOn: 1 })
      setEvents((prev) => {
        const local = prev.filter((e) => e.id.startsWith('local-'))
        return [...sampleEvents(base), ...local]
      })
      return
    }
    setLoading(true)
    fetchGoogleEvents(fetchStart.toISOString(), fetchEnd.toISOString())
      .then((evts) => {
        setEvents(evts)
        setLoading(false)
      })
      .catch(() => {
        // Token may have been invalidated mid-request
        if (!isGoogleConnected()) setGoogleConnected(false)
        else showToast('Failed to load calendar events', 'error')
        setLoading(false)
      })
  }, [googleConnected, fetchStart, fetchEnd, demoMode])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Map events by day-hour key (for week view)
  const eventMap = useMemo(() => {
    const map: Record<string, GoogleCalendarEvent[]> = {}
    events.forEach((ev) => {
      const hour = ev.allDay ? 8 : parseInt(ev.startTime?.split(':')[0] ?? '9', 10)
      const key = `${ev.date}_${hour}`
      if (!map[key]) map[key] = []
      map[key].push(ev)
    })
    return map
  }, [events])

  // Map events by date key (for month + agenda views)
  const eventsByDate = useMemo(() => {
    const map: Record<string, GoogleCalendarEvent[]> = {}
    events.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    })
    // Sort each day's events by start time
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    )
    return map
  }, [events])

  /* ---- Navigation ---- */
  const goPrev = () => {
    if (view === 'month') setAnchor((a) => subMonths(a, 1))
    else setAnchor((a) => subWeeks(a, 1))
  }
  const goNext = () => {
    if (view === 'month') setAnchor((a) => addMonths(a, 1))
    else setAnchor((a) => addWeeks(a, 1))
  }
  const goToday = () => setAnchor(new Date())

  /* ---- Google connect/disconnect ---- */
  const handleConnect = () => {
    if (demoMode) {
      showToast('Google Calendar integration is available in the full product', 'warn')
      return
    }
    connectGoogleCalendar()
  }

  const handleDisconnect = async () => {
    await disconnectGoogle()
    setGoogleConnected(false)
    setEvents([])
    showToast('Google Calendar disconnected', 'info')
  }

  /* ---- Create event ---- */
  const openNewEvent = useCallback((day: Date, hour: number) => {
    if (!googleConnected) {
      showToast('Connect Google Calendar first', 'warn')
      return
    }
    setForm(blankForm(format(day, 'yyyy-MM-dd'), hour))
    setModalOpen(true)
  }, [googleConnected])

  const handleSave = async () => {
    if (!form.title.trim()) {
      showToast('Title is required', 'warn')
      return
    }
    setSaving(true)
    try {
      const clientName = form.client_id
        ? clients.find(c => c.id === form.client_id)?.name
        : null
      const fullTitle = form.title.trim() + (clientName ? ` — ${clientName}` : '')

      if (demoMode) {
        const title = fullTitle
        setEvents((prev) => [...prev, {
          id: `local-${Date.now()}`, title, date: form.date, startTime: form.start_time, endTime: form.end_time,
          start: `${form.date}T${form.start_time}`, end: `${form.date}T${form.end_time}`, allDay: false, source: 'google',
        }])
        showToast('Event added to the sample calendar', 'success')
        setModalOpen(false)
        return
      }
      const ok = await createGoogleEvent({
        title: fullTitle,
        date: form.date,
        startTime: form.start_time,
        endTime: form.end_time,
        description: clientName ? `Client: ${clientName}\n\nCreated from GTH Command Center` : 'Created from GTH Command Center',
      })

      if (ok) {
        showToast('Event created in Google Calendar', 'success')
        setModalOpen(false)
        loadEvents()
      } else {
        showToast('Failed to create event — try reconnecting Google Calendar', 'error')
        setGoogleConnected(isGoogleConnected())
      }
    } catch {
      showToast('Failed to create event', 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ---- Delete event ---- */
  const handleDelete = async (eventId: string) => {
    if (!(await confirm('Delete event', 'Delete this event from Google Calendar?'))) return
    if (demoMode) {
      setEvents(prev => prev.filter(e => e.id !== eventId))
      setViewEvent(null)
      showToast('Event removed from the sample calendar', 'success')
      return
    }
    setSaving(true)
    try {
      const ok = await deleteGoogleEvent(eventId)
      if (ok) {
        showToast('Event deleted from Google Calendar', 'success')
        setEvents(prev => prev.filter(e => e.id !== eventId))
        setViewEvent(null)
      } else {
        showToast('Failed to delete — try reconnecting', 'error')
      }
    } catch {
      showToast('Failed to delete event', 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ---- Field updater ---- */
  const set = (key: keyof EventForm, val: string) =>
    setForm((f) => ({ ...f, [key]: val }))

  /* ---- Switch to week view for a specific day ---- */
  const goToWeekDay = (day: Date) => {
    setAnchor(day)
    setView('week')
  }

  /* ---- Date range label ---- */
  const dateRangeLabel = useMemo(() => {
    if (view === 'month') return format(anchor, 'MMMM yyyy')
    if (view === 'agenda') return 'Next 14 Days'
    return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
  }, [view, anchor, weekStart, weekEnd])

  /* ---- Live clock, mini calendar, derived views ---- */
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const [miniMonth, setMiniMonth] = useState(() => startOfMonth(new Date()))
  useEffect(() => { setMiniMonth(startOfMonth(anchor)) }, [anchor])
  const miniDays = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(miniMonth, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(miniMonth), { weekStartsOn: 1 }) }),
    [miniMonth],
  )

  const upcoming = useMemo(
    () => events.filter((ev) => eventEnd(ev) > now).sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime()).slice(0, 5),
    [events, now],
  )

  const hasAllDay = useMemo(
    () => days.some((d) => (eventsByDate[format(d, 'yyyy-MM-dd')] || []).some((e) => e.allDay)),
    [days, eventsByDate],
  )

  const nowTop = ((now.getHours() * 60 + now.getMinutes() - GRID_START_MIN) / 60) * HOUR_H

  const agendaDays = useMemo(
    () => eachDayOfInterval({ start: agendaStart, end: agendaEnd })
      .map((day) => ({ day, items: eventsByDate[format(day, 'yyyy-MM-dd')] || [] }))
      .filter((d) => d.items.length > 0),
    [agendaStart, agendaEnd, eventsByDate],
  )

  // Open the week scrolled to the working day (or to now)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (view !== 'week' || !scrollRef.current) return
    const target = Math.max(0, Math.min(nowTop - HOUR_H * 2, (9 - HOURS[0]) * HOUR_H - 20))
    scrollRef.current.scrollTop = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 })) ? Math.max(0, nowTop - HOUR_H * 3) : target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, weekStart, googleConnected])

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="cal">
      {/* ---- Header ---- */}
      <header className="cal-head">
        <div className="cal-title">
          <h1 className="cal-h1">{format(anchor, 'MMMM')} <span className="cal-h1-year">{format(anchor, 'yyyy')}</span></h1>
          <p className="cal-sub">
            {dateRangeLabel}
            {loading && <span className="cal-sync"><span className="cal-sync-dot" />Syncing</span>}
          </p>
        </div>

        <div className="cal-controls">
          {googleConnected === true && (
            <div className="tabbar cal-views" role="tablist" aria-label="Calendar view">
              <span
                className="tabbar-indicator"
                aria-hidden="true"
                style={{ transform: `translateX(${['week', 'month', 'agenda'].indexOf(view) * 76}px)`, width: 76 }}
              />
              {(['week', 'month', 'agenda'] as CalendarView[]).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  className={`tabbar-tab cal-view-tab ${view === v ? 'tabbar-tab--active' : ''}`}
                  onClick={() => setView(v)}
                >
                  {v === 'agenda' ? 'Agenda' : v === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>
          )}

          {googleConnected === true && view !== 'agenda' && (
            <div className="cal-nav">
              <button className="cal-round" onClick={goPrev} aria-label="Previous">
                <ChevronLeft size={16} />
              </button>
              <button className="btn-ghost cal-today" onClick={goToday}>Today</button>
              <button className="cal-round" onClick={goNext} aria-label="Next">
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {googleConnected === false && (
            <button className="btn-ghost" onClick={handleConnect}>Connect Google Calendar</button>
          )}

          <button
            className="btn-primary"
            onClick={() => {
              if (!googleConnected) {
                showToast('Connect Google Calendar first', 'warn')
                return
              }
              setForm(blankForm())
              setModalOpen(true)
            }}
          >
            <Plus size={13} />
            New event
          </button>
        </div>
      </header>

      {googleConnected === null && (
        <div className="cal-loading">
          <span className="cal-sync-dot" /> Connecting to Google Calendar
        </div>
      )}

      {/* Not connected */}
      {googleConnected === false && (
        <div className="cal-empty">
          <div className="cal-empty-icon"><CalendarDays size={22} /></div>
          <h3 className="cal-empty-title">Connect Google Calendar</h3>
          <p className="cal-empty-copy">
            Your calendar lives in Google. Connect it to see your week here and create events without leaving the command center.
          </p>
          <button className="btn-primary" onClick={handleConnect}>Connect Google Calendar</button>
        </div>
      )}

      {googleConnected === true && (
        <div className="cal-body">
          {/* ---- Left rail: mini month + up next ---- */}
          <aside className="cal-rail">
            <div className="cal-mini spot">
              <div className="cal-mini-head">
                <span className="cal-mini-title">{format(miniMonth, 'MMMM yyyy')}</span>
                <div className="cal-mini-nav">
                  <button className="cal-round cal-round--sm" onClick={() => setMiniMonth((m) => subMonths(m, 1))} aria-label="Previous month">
                    <ChevronLeft size={13} />
                  </button>
                  <button className="cal-round cal-round--sm" onClick={() => setMiniMonth((m) => addMonths(m, 1))} aria-label="Next month">
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
              <div className="cal-mini-grid">
                {DAY_LABELS.map((d) => (
                  <span key={d} className="cal-mini-dow">{d.charAt(0)}</span>
                ))}
                {miniDays.map((day) => {
                  const key = format(day, 'yyyy-MM-dd')
                  const inWeek = view === 'week' && day >= weekStart && day <= weekEnd
                  return (
                    <button
                      key={key}
                      className={[
                        'cal-mini-day',
                        !isSameMonth(day, miniMonth) && 'cal-mini-day--out',
                        isToday(day) && 'cal-mini-day--today',
                        inWeek && 'cal-mini-day--week',
                        isSameDay(day, anchor) && 'cal-mini-day--sel',
                      ].filter(Boolean).join(' ')}
                      onClick={() => goToWeekDay(day)}
                      aria-label={format(day, 'EEEE, MMMM d')}
                    >
                      {format(day, 'd')}
                      {eventsByDate[key]?.length ? <span className="cal-mini-dot" /> : null}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="cal-upnext spot">
              <p className="cal-rail-label">Up next</p>
              {upcoming.length === 0 ? (
                <p className="cal-rail-empty">Nothing else on the calendar in this view.</p>
              ) : (
                <ul className="cal-upnext-list">
                  {upcoming.map((ev) => {
                    const { displayTitle, clientName } = splitTitle(ev.title)
                    return (
                      <li key={ev.id}>
                        <button className="cal-upnext-item" onClick={() => setViewEvent(ev)}>
                          <span className="cal-upnext-when">{relativeWhen(ev, now)}</span>
                          <span className="cal-upnext-title">{displayTitle}</span>
                          <span className="cal-upnext-meta">
                            {ev.allDay ? 'All day' : formatTimeRange(ev.startTime, ev.endTime, false)}
                            {clientName ? ` · ${clientName}` : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="cal-conn">
              <span className="brf-light" data-tone="ok" aria-hidden="true" />
              <span>{demoMode ? 'Sample calendar' : 'Google Calendar synced'}</span>
              {!demoMode && (
                <button className="cal-conn-btn" onClick={handleDisconnect} title="Disconnect Google Calendar">
                  <Unplug size={12} /> Disconnect
                </button>
              )}
            </div>
          </aside>

          {/* ---- Main view ---- */}
          <section className="cal-main">
            {/* WEEK */}
            {view === 'week' && (
              <div className="cal-week spot">
                <div className="cal-week-head">
                  <div className="cal-gutter-head" />
                  {days.map((day) => (
                    <button
                      key={day.toISOString()}
                      className={`cal-dayhead ${isToday(day) ? 'cal-dayhead--today' : ''}`}
                      onClick={() => openNewEvent(day, 9)}
                      title="Add an event this day"
                    >
                      <span className="cal-dayhead-dow">{format(day, 'EEE')}</span>
                      <span className="cal-dayhead-num">{format(day, 'd')}</span>
                    </button>
                  ))}
                </div>

                {hasAllDay && (
                  <div className="cal-allday">
                    <div className="cal-gutter-label">All day</div>
                    {days.map((day) => {
                      const key = format(day, 'yyyy-MM-dd')
                      return (
                        <div key={key} className="cal-allday-cell">
                          {(eventsByDate[key] || []).filter((e) => e.allDay).map((ev) => (
                            <button key={ev.id} className="cal-chip" onClick={() => setViewEvent(ev)}>
                              {splitTitle(ev.title).displayTitle}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="cal-scroll" ref={scrollRef}>
                  <div className="cal-grid" style={{ height: HOURS.length * HOUR_H }}>
                    <div className="cal-gutter">
                      {HOURS.map((h) => (
                        <div key={h} className="cal-hour-label" style={{ height: HOUR_H }}>
                          <span>{h === HOURS[0] ? '' : `${hourLabel(h)} ${ampm(h)}`}</span>
                        </div>
                      ))}
                    </div>
                    {days.map((day) => {
                      const key = format(day, 'yyyy-MM-dd')
                      const laid = layoutDay(eventsByDate[key] || [])
                      const today = isToday(day)
                      return (
                        <div key={key} className={`cal-col ${today ? 'cal-col--today' : ''}`}>
                          {HOURS.map((h) => (
                            <button
                              key={h}
                              className="cal-slot"
                              style={{ height: HOUR_H }}
                              onClick={() => openNewEvent(day, h)}
                              aria-label={`Add event ${format(day, 'EEEE')} at ${hourLabel(h)} ${ampm(h)}`}
                            >
                              <Plus size={12} className="cal-slot-plus" />
                            </button>
                          ))}
                          {laid.map(({ ev, top, height, lane, lanes }) => {
                            const { displayTitle, clientName } = splitTitle(ev.title)
                            const past = isPastEvent(ev, now)
                            const live = isLiveEvent(ev, now)
                            return (
                              <button
                                key={ev.id}
                                className={`cal-event ${past ? 'cal-event--past' : ''} ${live ? 'cal-event--live' : ''} ${height < 44 ? 'cal-event--tight' : ''} ${height >= 80 ? 'cal-event--tall' : ''}`}
                                style={{
                                  top,
                                  height,
                                  left: `calc(${(lane / lanes) * 100}% + 3px)`,
                                  width: `calc(${100 / lanes}% - 6px)`,
                                }}
                                onClick={() => setViewEvent(ev)}
                              >
                                <span className="cal-event-title">{displayTitle}</span>
                                <span className="cal-event-time">
                                  {formatTimeRange(ev.startTime, ev.endTime, false)}
                                  {clientName ? ` · ${clientName}` : ''}
                                </span>
                              </button>
                            )
                          })}
                          {today && nowTop >= 0 && nowTop <= HOURS.length * HOUR_H && (
                            <div className="cal-now" style={{ top: nowTop }} aria-hidden="true">
                              <span className="cal-now-dot" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* MONTH */}
            {view === 'month' && (
              <div className="cal-month spot">
                <div className="cal-month-dows">
                  {DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
                </div>
                <div className="cal-month-grid">
                  {monthDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd')
                    const dayEvents = eventsByDate[key] || []
                    return (
                      <div
                        key={key}
                        className={[
                          'cal-mcell',
                          !isSameMonth(day, anchor) && 'cal-mcell--out',
                          isToday(day) && 'cal-mcell--today',
                        ].filter(Boolean).join(' ')}
                      >
                        <button className="cal-mcell-num" onClick={() => goToWeekDay(day)} aria-label={`Open week of ${format(day, 'MMMM d')}`}>
                          {format(day, 'd')}
                        </button>
                        <div className="cal-mcell-events">
                          {dayEvents.slice(0, 3).map((ev) => (
                            <button key={ev.id} className="cal-mchip" onClick={() => setViewEvent(ev)}>
                              {!ev.allDay && <span className="cal-mchip-time">{hourMinLabel(ev.startTime)}</span>}
                              <span className="cal-mchip-title">{splitTitle(ev.title).displayTitle}</span>
                            </button>
                          ))}
                          {dayEvents.length > 3 && (
                            <button className="cal-mmore" onClick={() => goToWeekDay(day)}>+{dayEvents.length - 3} more</button>
                          )}
                        </div>
                        <button className="cal-mcell-add" onClick={() => openNewEvent(day, 9)} aria-label={`Add event on ${format(day, 'MMMM d')}`}>
                          <Plus size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* AGENDA */}
            {view === 'agenda' && (
              <div className="cal-agenda">
                {agendaDays.length === 0 && (
                  <div className="cal-empty cal-empty--inline">
                    <p className="cal-empty-copy">Nothing scheduled in the next 14 days.</p>
                  </div>
                )}
                {agendaDays.map(({ day, items }) => (
                  <div key={day.toISOString()} className="cal-aday">
                    <div className={`cal-aday-head ${isToday(day) ? 'cal-aday-head--today' : ''}`}>
                      <span className="cal-aday-num">{format(day, 'd')}</span>
                      <span className="cal-aday-meta">
                        <span className="cal-aday-dow">{agendaDateLabel(day)}</span>
                        <span className="cal-aday-month">{format(day, 'MMMM yyyy')}</span>
                      </span>
                    </div>
                    <div className="cal-aday-list">
                      {items.map((ev) => {
                        const { displayTitle, clientName } = splitTitle(ev.title)
                        return (
                          <button
                            key={ev.id}
                            className={`cal-arow spot ${isLiveEvent(ev, now) ? 'cal-arow--live' : ''} ${isPastEvent(ev, now) ? 'cal-arow--past' : ''}`}
                            onClick={() => setViewEvent(ev)}
                          >
                            <span className="cal-arow-time">{ev.allDay ? 'All day' : formatTimeRange(ev.startTime, ev.endTime, false)}</span>
                            <span className="cal-arow-body">
                              <span className="cal-arow-title">{displayTitle}</span>
                              {(clientName || ev.location) && (
                                <span className="cal-arow-meta">
                                  {clientName}
                                  {clientName && ev.location ? ' · ' : ''}
                                  {ev.location}
                                </span>
                              )}
                            </span>
                            {isLiveEvent(ev, now) && <span className="cal-live-tag">Now</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ---- New Event Modal (creates in Google) ---- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New event" width="440px">
        <div className="flex flex-col gap-4">
          <div>
            <label className="label text-dim block mb-1">Title</label>
            <input
              className="w-full bg-cell border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '14px' }}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Event title..."
              autoFocus
            />
          </div>

          <div>
            <label className="label text-dim block mb-1">Date</label>
            <input
              type="date"
              className="w-full bg-cell border border-border px-3 py-2 text-polar font-mono outline-none focus:border-dim transition-colors"
              style={{ fontSize: '14px' }}
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label text-dim block mb-1">Start Time</label>
              <input
                type="time"
                className="w-full bg-cell border border-border px-3 py-2 text-polar font-mono outline-none focus:border-dim transition-colors"
                style={{ fontSize: '14px' }}
                value={form.start_time}
                onChange={(e) => set('start_time', e.target.value)}
              />
            </div>
            <div>
              <label className="label text-dim block mb-1">End Time</label>
              <input
                type="time"
                className="w-full bg-cell border border-border px-3 py-2 text-polar font-mono outline-none focus:border-dim transition-colors"
                style={{ fontSize: '14px' }}
                value={form.end_time}
                onChange={(e) => set('end_time', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label text-dim block mb-1">Client (optional)</label>
            <select
              className="w-full bg-cell border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '14px' }}
              value={form.client_id}
              onChange={(e) => set('client_id', e.target.value)}
            >
              <option value="">None</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border mt-1">
            <button className="btn-ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ---- View Google Event Modal ---- */}
      <Modal
        open={!!viewEvent}
        onClose={() => setViewEvent(null)}
        title="Event Details"
        width="400px"
      >
        {viewEvent && (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-polar font-[700]" style={{ fontSize: '17px' }}>{viewEvent.title}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="label text-dim block mb-1">DATE</span>
                <span className="text-polar mono" style={{ fontSize: '14px' }}>{format(new Date(`${viewEvent.date}T00:00:00`), 'EEE, MMM d, yyyy')}</span>
              </div>
              <div>
                <span className="label text-dim block mb-1">TIME</span>
                <span className="text-polar mono" style={{ fontSize: '14px' }}>
                  {viewEvent.allDay ? 'All day' : formatTimeRange(viewEvent.startTime, viewEvent.endTime, false)}
                </span>
              </div>
            </div>
            {viewEvent.location && (
              <div>
                <span className="label text-dim block mb-1">LOCATION</span>
                <span className="text-polar" style={{ fontSize: '14px' }}>{viewEvent.location}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <button
                className="flex items-center gap-1 text-err hover:opacity-80 transition-opacity cursor-pointer"
                style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const }}
                onClick={() => handleDelete(viewEvent.id)}
                disabled={saving}
              >
                <Trash2 size={12} />
                Delete
              </button>
              <button
                className="btn-ghost flex items-center gap-2"
                onClick={() => {
                  if (viewEvent.htmlLink) window.open(viewEvent.htmlLink, '_blank')
                }}
              >
                <ExternalLink size={12} />
                Open in Google
              </button>
            </div>
          </div>
        )}
      </Modal>
    {ConfirmDialog}
    </div>
  )
}
