import { useState, useEffect, useMemo, useCallback } from 'react'
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
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8..20
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
/*  Color helper — assign consistent colors to events                 */
/* ------------------------------------------------------------------ */

const EVENT_COLORS = [
  { border: '#4285F4', bg: 'rgba(66,133,244,0.10)' },   // Google blue
  { border: '#0F9D58', bg: 'rgba(15,157,88,0.10)' },    // Green
  { border: '#F4B400', bg: 'rgba(244,180,0,0.10)' },    // Yellow
  { border: '#DB4437', bg: 'rgba(219,68,55,0.10)' },    // Red
  { border: '#AB47BC', bg: 'rgba(171,71,188,0.10)' },   // Purple
  { border: '#00ACC1', bg: 'rgba(0,172,193,0.10)' },    // Cyan
  { border: '#FF7043', bg: 'rgba(255,112,67,0.10)' },   // Orange
]

function eventColor(title: string) {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length]
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function Calendar() {
  const { clients } = useAppStore()
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
  }, [googleConnected, fetchStart, fetchEnd])

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
  const handleConnect = () => connectGoogleCalendar()

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
    return `${format(weekStart, 'MMM d')} — ${format(weekEnd, 'MMM d, yyyy')}`
  }, [view, anchor, weekStart, weekEnd])

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex flex-col h-full">
      {/* ---- Header bar ---- */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1>Calendar</h1>
          <span className="text-steel font-mono" style={{ fontSize: '13px' }}>
            {dateRangeLabel}
          </span>
          {loading && (
            <span className="text-dim" style={{ fontSize: '11px' }}>Syncing...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Google Calendar controls */}
          {googleConnected === null ? (
            <span className="text-dim" style={{ fontSize: '11px' }}>Connecting...</span>
          ) : googleConnected ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5" style={{ fontSize: '11px' }}>
                <div className="w-2 h-2 rounded-full" style={{ background: '#4285F4' }} />
                <span className="text-steel">Google Calendar</span>
              </span>
              <button
                className="btn-ghost flex items-center gap-1"
                onClick={handleDisconnect}
                title="Disconnect Google Calendar"
              >
                <Unplug size={11} />
              </button>
            </div>
          ) : (
            <button
              className="btn-ghost flex items-center gap-2"
              onClick={handleConnect}
            >
              <img
                src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png"
                alt=""
                style={{ width: 14, height: 14 }}
              />
              Connect Google Calendar
            </button>
          )}

          {/* Nav (hide prev/next/today on agenda view) */}
          {view !== 'agenda' && (
            <>
              <button className="btn-ghost px-2 py-2" onClick={goPrev}>
                <ChevronLeft size={14} />
              </button>
              <button className="btn-ghost" onClick={goToday}>
                Today
              </button>
              <button className="btn-ghost px-2 py-2" onClick={goNext}>
                <ChevronRight size={14} />
              </button>
            </>
          )}

          {/* New event */}
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => {
              if (!googleConnected) {
                showToast('Connect Google Calendar first', 'warn')
                return
              }
              setForm(blankForm())
              setModalOpen(true)
            }}
          >
            <Plus size={12} />
            New Event
          </button>
        </div>
      </div>

      {/* ---- View toggle tabs ---- */}
      {googleConnected === true && (
        <div className="flex items-center gap-1 mb-4">
          {(['week', 'month', 'agenda'] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '6px 14px',
                background: view === v ? 'var(--color-polar)' : 'transparent',
                color: view === v ? 'var(--color-obsidian)' : 'var(--color-steel)',
                border: '1px solid',
                borderColor: view === v ? 'var(--color-polar)' : 'var(--color-border)',
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
              className={view !== v ? 'hover:border-dim hover:text-polar' : ''}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {/* Not connected state — only show after hydration (not during loading) */}
      {googleConnected === false && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
          <img
            src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png"
            alt=""
            style={{ width: 48, height: 48, opacity: 0.5 }}
            className="mb-4"
          />
          <h3 className="text-polar font-[700] mb-2" style={{ fontSize: '16px' }}>Connect Google Calendar</h3>
          <p className="text-dim mb-4" style={{ fontSize: '13px', maxWidth: '340px' }}>
            Your calendar lives in Google. Connect it to view, create, and manage events right from the command center.
          </p>
          <button className="btn-primary" onClick={handleConnect}>
            Connect Google Calendar
          </button>
        </div>
      )}

      {/* ---- WEEK VIEW (existing, unchanged) ---- */}
      {googleConnected === true && view === 'week' && (
        <div className="flex-1 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px repeat(7, 1fr)',
              gap: '1px',
              background: 'var(--color-border)',
              minWidth: '700px',
            }}
          >
            {/* ---- Column headers ---- */}
            <div style={{ background: 'var(--color-surface)', padding: '8px' }} />
            {days.map((day, i) => {
              const today = isToday(day)
              return (
                <div
                  key={i}
                  style={{
                    background: today ? '#000000' : 'var(--color-surface)',
                    padding: '8px',
                    textAlign: 'center',
                  }}
                >
                  <span className="label-md" style={{ color: today ? '#FFFFFF' : 'var(--color-steel)' }}>
                    {DAY_LABELS[i]}
                  </span>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '13px',
                      fontWeight: today ? 800 : 500,
                      marginTop: '2px',
                      color: today ? '#FFFFFF' : 'var(--color-steel)',
                    }}
                  >
                    {format(day, 'd')}
                  </div>
                </div>
              )
            })}

            {/* ---- Time rows ---- */}
            {HOURS.map((hour) => (
              <>
                {/* Time label */}
                <div
                  key={`t-${hour}`}
                  style={{
                    background: 'var(--color-cell)',
                    padding: '4px 6px',
                    textAlign: 'right',
                    fontFamily: "'Space Mono', monospace",
                    fontSize: '11px',
                    color: 'var(--color-dim)',
                    minHeight: '40px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                  }}
                >
                  {hourLabel(hour)}&nbsp;{ampm(hour)}
                </div>

                {/* Day slots */}
                {days.map((day, di) => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const key = `${dateStr}_${hour}`
                  const slotEvents = eventMap[key] ?? []
                  const today = isToday(day)

                  return (
                    <div
                      key={`s-${hour}-${di}`}
                      onClick={() => openNewEvent(day, hour)}
                      style={{
                        background: today ? 'var(--color-surface-2)' : 'var(--color-cell)',
                        minHeight: '40px',
                        padding: '2px',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                      className="hover:bg-ghost transition-colors duration-100"
                    >
                      {slotEvents.map((ev) => {
                        const color = eventColor(ev.title)
                        return (
                          <div
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setViewEvent(ev)
                            }}
                            style={{
                              background: color.bg,
                              borderLeft: `2px solid ${color.border}`,
                              padding: '3px 5px',
                              fontSize: '10px',
                              fontWeight: 600,
                              lineHeight: 1.3,
                              marginBottom: '1px',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                            }}
                            title={`${ev.title} (${ev.startTime} - ${ev.endTime})`}
                          >
                            <span style={{ color: color.border, marginRight: '4px', fontSize: '9px' }}>
                              {ev.allDay ? 'ALL DAY' : ev.startTime?.slice(0, 5)}
                            </span>
                            {ev.title}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </>
            ))}
          </div>
        </div>
      )}

      {/* ---- MONTH VIEW ---- */}
      {googleConnected === true && view === 'month' && (
        <div className="flex-1 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '1px',
              background: 'var(--color-border)',
              minWidth: '700px',
            }}
          >
            {/* ---- Day-of-week headers ---- */}
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                style={{
                  background: 'var(--color-surface)',
                  padding: '8px',
                  textAlign: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--color-steel)',
                }}
              >
                {label}
              </div>
            ))}

            {/* ---- Day cells ---- */}
            {monthDays.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const dayEvents = eventsByDate[dateStr] ?? []
              const inMonth = isSameMonth(day, anchor)
              const today = isToday(day)
              const maxPreview = 3
              const overflow = dayEvents.length - maxPreview

              return (
                <div
                  key={i}
                  onClick={() => goToWeekDay(day)}
                  style={{
                    background: today
                      ? 'var(--color-surface-2)'
                      : 'var(--color-cell)',
                    minHeight: '90px',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  className="hover:bg-ghost transition-colors duration-100"
                >
                  {/* Day number */}
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: today ? 800 : 500,
                      fontFamily: "'Space Mono', monospace",
                      color: !inMonth
                        ? 'var(--color-dim)'
                        : today
                          ? 'var(--color-polar)'
                          : 'var(--color-steel)',
                      marginBottom: '3px',
                    }}
                  >
                    {today ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '22px',
                          height: '22px',
                          background: 'var(--color-polar)',
                          color: 'var(--color-obsidian)',
                          fontWeight: 800,
                        }}
                      >
                        {format(day, 'd')}
                      </span>
                    ) : (
                      format(day, 'd')
                    )}
                  </div>

                  {/* Event previews */}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {dayEvents.slice(0, maxPreview).map((ev) => {
                      const color = eventColor(ev.title)
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setViewEvent(ev)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '10px',
                            fontWeight: 600,
                            lineHeight: 1.4,
                            marginBottom: '1px',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            padding: '1px 3px',
                            cursor: 'pointer',
                          }}
                          title={`${ev.title} (${ev.startTime} - ${ev.endTime})`}
                        >
                          <div
                            style={{
                              width: '5px',
                              height: '5px',
                              borderRadius: '50%',
                              background: color.border,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: inMonth ? 'var(--color-polar)' : 'var(--color-dim)',
                            }}
                          >
                            {ev.title}
                          </span>
                        </div>
                      )
                    })}
                    {overflow > 0 && (
                      <div
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          color: 'var(--color-steel)',
                          padding: '1px 3px',
                        }}
                      >
                        +{overflow} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ---- AGENDA VIEW ---- */}
      {googleConnected === true && view === 'agenda' && (
        <div className="flex-1 overflow-y-auto -mx-3 px-3 md:mx-0 md:px-0">
          {(() => {
            const agendaDays: { date: Date; dateStr: string; events: GoogleCalendarEvent[] }[] = []
            for (let i = 0; i < 14; i++) {
              const day = addDays(agendaStart, i)
              const dateStr = format(day, 'yyyy-MM-dd')
              const dayEvents = eventsByDate[dateStr]
              if (dayEvents && dayEvents.length > 0) {
                agendaDays.push({ date: day, dateStr, events: dayEvents })
              }
            }

            if (agendaDays.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-dim" style={{ fontSize: '13px' }}>
                    No events in the next 14 days.
                  </p>
                </div>
              )
            }

            return (
              <div style={{ maxWidth: '680px' }}>
                {agendaDays.map(({ date, dateStr, events: dayEvents }) => (
                  <div key={dateStr} style={{ marginBottom: '20px' }}>
                    {/* Date header */}
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: isToday(date) ? 'var(--color-polar)' : 'var(--color-steel)',
                        padding: '6px 0',
                        borderBottom: '1px solid var(--color-border)',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {isToday(date) && (
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#4285F4',
                          }}
                        />
                      )}
                      {agendaDateLabel(date)}
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: 'var(--color-dim)',
                          letterSpacing: '0.02em',
                          textTransform: 'none',
                        }}
                      >
                        {format(date, 'MMM d')}
                      </span>
                    </div>

                    {/* Events for this day */}
                    {dayEvents.map((ev) => {
                      const color = eventColor(ev.title)
                      // Try to extract client name from title (format: "Title — ClientName")
                      const dashIdx = ev.title.indexOf(' — ')
                      const displayTitle = dashIdx > -1 ? ev.title.slice(0, dashIdx) : ev.title
                      const clientName = dashIdx > -1 ? ev.title.slice(dashIdx + 3) : null

                      return (
                        <div
                          key={ev.id}
                          onClick={() => setViewEvent(ev)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '8px 6px',
                            cursor: 'pointer',
                            borderLeft: `3px solid ${color.border}`,
                            background: color.bg,
                            marginBottom: '2px',
                            transition: 'opacity 150ms',
                          }}
                          className="hover:opacity-80"
                        >
                          {/* Time */}
                          <div
                            className="font-mono"
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: color.border,
                              minWidth: '110px',
                              flexShrink: 0,
                              paddingTop: '1px',
                            }}
                          >
                            {formatTimeRange(ev.startTime, ev.endTime, ev.allDay)}
                          </div>

                          {/* Details */}
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--color-polar)',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {displayTitle}
                            </div>
                            {clientName && (
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--color-steel)',
                                  marginTop: '1px',
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {clientName}
                              </div>
                            )}
                          </div>

                          {/* Type badge */}
                          {ev.allDay && (
                            <span
                              className="badge badge-neutral"
                              style={{ fontSize: '9px', flexShrink: 0 }}
                            >
                              ALL DAY
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ---- New Event Modal (creates in Google) ---- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Google Calendar Event" width="440px">
        <div className="flex flex-col gap-4">
          <div>
            <label className="label text-dim block mb-1">Title</label>
            <input
              className="w-full bg-cell border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '13px' }}
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
              style={{ fontSize: '13px' }}
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
                style={{ fontSize: '13px' }}
                value={form.start_time}
                onChange={(e) => set('start_time', e.target.value)}
              />
            </div>
            <div>
              <label className="label text-dim block mb-1">End Time</label>
              <input
                type="time"
                className="w-full bg-cell border border-border px-3 py-2 text-polar font-mono outline-none focus:border-dim transition-colors"
                style={{ fontSize: '13px' }}
                value={form.end_time}
                onChange={(e) => set('end_time', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label text-dim block mb-1">Client (optional)</label>
            <select
              className="w-full bg-cell border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '13px' }}
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
              <h3 className="text-polar font-[700]" style={{ fontSize: '16px' }}>{viewEvent.title}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="label text-dim block mb-1">DATE</span>
                <span className="text-polar mono" style={{ fontSize: '13px' }}>{viewEvent.date}</span>
              </div>
              <div>
                <span className="label text-dim block mb-1">TIME</span>
                <span className="text-polar mono" style={{ fontSize: '13px' }}>
                  {viewEvent.allDay ? 'All day' : `${viewEvent.startTime} — ${viewEvent.endTime}`}
                </span>
              </div>
            </div>
            {viewEvent.location && (
              <div>
                <span className="label text-dim block mb-1">LOCATION</span>
                <span className="text-polar" style={{ fontSize: '13px' }}>{viewEvent.location}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <button
                className="flex items-center gap-1 text-err hover:opacity-80 transition-opacity cursor-pointer"
                style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const }}
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
