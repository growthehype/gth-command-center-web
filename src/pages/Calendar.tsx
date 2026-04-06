import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppStore, type CalendarEvent } from '@/lib/store'
import { events as eventsApi } from '@/lib/api'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import {
  connectGoogleCalendar,
  disconnectGoogle,
  isGoogleConnected,
  fetchGoogleEvents,
  type GoogleCalendarEvent,
} from '@/lib/google-calendar'
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isToday,
  parseISO,
} from 'date-fns'
import {
  Calendar as CalIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  ExternalLink,
  Unplug,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8..20
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const EVENT_TYPES = [
  { value: 'workout', label: 'Workout' },
  { value: 'client', label: 'Client' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'personal', label: 'Personal' },
  { value: 'deadline', label: 'Deadline' },
]

const RECURRING_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
]

const TYPE_BORDER: Record<string, string> = {
  workout: '#22C55E',
  client: '#3B82F6',
  discovery: '#F59E0B',
  personal: '#888888',
  deadline: '#FF3333',
  google: '#4285F4',
}

const TYPE_BG: Record<string, string> = {
  workout: 'rgba(34,197,94,0.08)',
  client: 'rgba(59,130,246,0.08)',
  discovery: 'rgba(245,158,11,0.08)',
  personal: 'rgba(136,136,136,0.06)',
  deadline: 'rgba(255,51,51,0.08)',
  google: 'rgba(66,133,244,0.10)',
}

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

/* ------------------------------------------------------------------ */
/*  Blank form state                                                  */
/* ------------------------------------------------------------------ */

interface EventForm {
  date: string
  start_time: string
  end_time: string
  title: string
  type: string
  client_id: string
  recurring: string
}

const blankForm = (date?: string, hour?: number): EventForm => ({
  date: date ?? format(new Date(), 'yyyy-MM-dd'),
  start_time: hour !== undefined ? `${pad2(hour)}:00` : '09:00',
  end_time: hour !== undefined ? `${pad2(hour + 1)}:00` : '10:00',
  title: '',
  type: 'client',
  client_id: '',
  recurring: '',
})

/* ------------------------------------------------------------------ */
/*  Unified event type for the grid                                   */
/* ------------------------------------------------------------------ */

interface UnifiedEvent {
  id: string
  title: string
  date: string
  start_time: string
  end_time: string
  type: string
  client_name?: string
  client_id?: string | null
  recurring?: string | null
  source: 'crm' | 'google'
  htmlLink?: string
  allDay?: boolean
  original?: CalendarEvent
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function Calendar() {
  const { events, clients, refreshEvents, refreshActivity } = useAppStore()

  // Week navigation
  const [anchor, setAnchor] = useState(new Date())
  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const weekEnd = useMemo(() => endOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd])

  // Google Calendar
  const [googleConnected, setGoogleConnected] = useState(isGoogleConnected())
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([])
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showGoogle, setShowGoogle] = useState(true)

  // Modals
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState<EventForm>(blankForm())
  const [saving, setSaving] = useState(false)

  // Load CRM events on mount
  useEffect(() => {
    refreshEvents()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load Google Calendar events when connected or week changes
  useEffect(() => {
    if (!googleConnected || !showGoogle) return
    setGoogleLoading(true)
    const timeMin = weekStart.toISOString()
    const timeMax = weekEnd.toISOString()
    fetchGoogleEvents(timeMin, timeMax)
      .then((events) => {
        setGoogleEvents(events)
        if (events.length === 0 && isGoogleConnected()) {
          // Token might have expired
        }
        setGoogleLoading(false)
      })
      .catch(() => setGoogleLoading(false))
  }, [googleConnected, weekStart, weekEnd, showGoogle])

  // Check connection status on mount (in case token was captured from redirect)
  useEffect(() => {
    setGoogleConnected(isGoogleConnected())
  }, [])

  // ── Unified events ──
  const unifiedEvents = useMemo(() => {
    const crm: UnifiedEvent[] = events
      .filter((ev) => {
        try {
          const d = parseISO(ev.date)
          return d >= weekStart && d <= weekEnd
        } catch { return false }
      })
      .map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        start_time: ev.start_time ?? '09:00',
        end_time: ev.end_time ?? '10:00',
        type: ev.type ?? 'client',
        client_name: ev.client_name,
        client_id: ev.client_id,
        recurring: ev.recurring,
        source: 'crm' as const,
        original: ev,
      }))

    const google: UnifiedEvent[] = showGoogle
      ? googleEvents.map((ev) => ({
          id: ev.id,
          title: ev.title,
          date: ev.date,
          start_time: ev.startTime,
          end_time: ev.endTime,
          type: 'google',
          source: 'google' as const,
          htmlLink: ev.htmlLink,
          allDay: ev.allDay,
        }))
      : []

    return [...crm, ...google]
  }, [events, googleEvents, weekStart, weekEnd, showGoogle])

  // Map events by day-hour key
  const eventMap = useMemo(() => {
    const map: Record<string, UnifiedEvent[]> = {}
    unifiedEvents.forEach((ev) => {
      if (ev.allDay) {
        // Show all-day events at 8am
        const key = `${ev.date}_8`
        if (!map[key]) map[key] = []
        map[key].push(ev)
      } else {
        const startHour = parseInt(ev.start_time?.split(':')[0] ?? '9', 10)
        const key = `${ev.date}_${startHour}`
        if (!map[key]) map[key] = []
        map[key].push(ev)
      }
    })
    return map
  }, [unifiedEvents])

  /* ---- Navigation ---- */
  const goPrev = () => setAnchor((a) => subWeeks(a, 1))
  const goNext = () => setAnchor((a) => addWeeks(a, 1))
  const goToday = () => setAnchor(new Date())

  /* ---- Google connect/disconnect ---- */
  const handleConnect = async () => {
    try {
      await connectGoogleCalendar()
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to connect Google', 'error')
    }
  }

  const handleDisconnect = () => {
    disconnectGoogle()
    setGoogleConnected(false)
    setGoogleEvents([])
    showToast('Google Calendar disconnected', 'info')
  }

  /* ---- Open modals ---- */
  const openNewEvent = useCallback((day: Date, hour: number) => {
    setEditingEvent(null)
    setForm(blankForm(format(day, 'yyyy-MM-dd'), hour))
    setModalOpen(true)
  }, [])

  const openEditEvent = useCallback((ev: UnifiedEvent) => {
    if (ev.source === 'google') {
      // Open in Google Calendar
      if (ev.htmlLink) window.open(ev.htmlLink, '_blank')
      return
    }
    if (!ev.original) return
    setEditingEvent(ev.original)
    setForm({
      date: ev.date,
      start_time: ev.start_time ?? '09:00',
      end_time: ev.end_time ?? '10:00',
      title: ev.title,
      type: ev.type ?? 'client',
      client_id: ev.client_id ?? '',
      recurring: ev.recurring ?? '',
    })
    setModalOpen(true)
  }, [])

  const closeModal = () => {
    setModalOpen(false)
    setEditingEvent(null)
  }

  /* ---- CRUD ---- */
  const handleSave = async () => {
    if (!form.title.trim()) {
      showToast('Title is required', 'warn')
      return
    }
    setSaving(true)
    try {
      const payload = {
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        title: form.title.trim(),
        type: form.type,
        client_id: form.client_id || null,
        recurring: form.recurring || null,
      }
      if (editingEvent) {
        await eventsApi.update(editingEvent.id, payload)
        showToast('Event updated', 'success')
      } else {
        await eventsApi.create(payload)
        showToast('Event created', 'success')
      }
      await Promise.all([refreshEvents(), refreshActivity()])
      closeModal()
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to save event', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editingEvent) return
    setSaving(true)
    try {
      await eventsApi.delete(editingEvent.id)
      showToast('Event deleted', 'success')
      await Promise.all([refreshEvents(), refreshActivity()])
      closeModal()
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to delete event', 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ---- Field updater ---- */
  const set = (key: keyof EventForm, val: string) =>
    setForm((f) => ({ ...f, [key]: val }))

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
            {format(weekStart, 'MMM d')} — {format(weekEnd, 'MMM d, yyyy')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Google Calendar controls */}
          {googleConnected ? (
            <div className="flex items-center gap-2">
              <button
                className={`btn-ghost flex items-center gap-2 ${showGoogle ? '' : 'opacity-50'}`}
                onClick={() => setShowGoogle(!showGoogle)}
                title={showGoogle ? 'Hide Google events' : 'Show Google events'}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: showGoogle ? '#4285F4' : '#555' }}
                />
                <span style={{ fontSize: '11px' }}>Google</span>
                {showGoogle && <Check size={10} />}
              </button>
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

          {/* Nav */}
          <button className="btn-ghost px-2 py-2" onClick={goPrev}>
            <ChevronLeft size={14} />
          </button>
          <button className="btn-ghost" onClick={goToday}>
            Today
          </button>
          <button className="btn-ghost px-2 py-2" onClick={goNext}>
            <ChevronRight size={14} />
          </button>

          {/* New event */}
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => {
              setEditingEvent(null)
              setForm(blankForm())
              setModalOpen(true)
            }}
          >
            <Plus size={12} />
            New Event
          </button>
        </div>
      </div>

      {/* Google loading indicator */}
      {googleLoading && (
        <div className="text-dim text-center mb-2" style={{ fontSize: '11px' }}>
          Loading Google Calendar events...
        </div>
      )}

      {/* ---- Calendar grid ---- */}
      <div className="flex-1 overflow-auto">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60px repeat(7, 1fr)',
            gap: '1px',
            background: 'var(--color-border)',
          }}
        >
          {/* ---- Column headers ---- */}
          <div
            style={{
              background: 'var(--color-surface)',
              padding: '8px',
            }}
          />
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
                <span
                  className="label-md"
                  style={{
                    color: today ? '#FFFFFF' : 'var(--color-steel)',
                  }}
                >
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
                      background: today
                        ? 'var(--color-surface-2)'
                        : 'var(--color-cell)',
                      minHeight: '40px',
                      padding: '2px',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                    className="hover:bg-ghost transition-colors duration-100"
                  >
                    {slotEvents.map((ev) => {
                      const borderColor = TYPE_BORDER[ev.type] ?? '#888'
                      const bgColor = TYPE_BG[ev.type] ?? 'rgba(136,136,136,0.08)'
                      const isGoogle = ev.source === 'google'
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditEvent(ev)
                          }}
                          style={{
                            background: bgColor,
                            borderLeft: `2px solid ${borderColor}`,
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
                          title={`${ev.title} (${ev.start_time} - ${ev.end_time})${isGoogle ? ' — Google Calendar' : ''}`}
                        >
                          <span style={{ color: borderColor, marginRight: '4px', fontSize: '9px' }}>
                            {ev.allDay ? 'ALL DAY' : ev.start_time?.slice(0, 5)}
                          </span>
                          {ev.title}
                          {ev.client_name && (
                            <span style={{ color: 'var(--color-dim)', marginLeft: '4px' }}>
                              {ev.client_name}
                            </span>
                          )}
                          {isGoogle && (
                            <ExternalLink
                              size={8}
                              style={{ display: 'inline', marginLeft: '4px', opacity: 0.5, verticalAlign: 'middle' }}
                            />
                          )}
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

      {/* ---- Event Modal ---- */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingEvent ? 'Edit Event' : 'New Event'}
        width="440px"
      >
        <div className="flex flex-col gap-4">
          {/* Title */}
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

          {/* Date */}
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

          {/* Start / End time row */}
          <div className="grid grid-cols-2 gap-3">
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

          {/* Type */}
          <div>
            <label className="label text-dim block mb-1">Type</label>
            <select
              className="w-full bg-cell border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '13px' }}
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Client (optional) */}
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
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Recurring */}
          <div>
            <label className="label text-dim block mb-1">Recurring</label>
            <select
              className="w-full bg-cell border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '13px' }}
              value={form.recurring}
              onChange={(e) => set('recurring', e.target.value)}
            >
              {RECURRING_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border mt-1">
            {editingEvent ? (
              <button
                className="flex items-center gap-1 text-err hover:opacity-80 transition-opacity cursor-pointer"
                style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const }}
                onClick={handleDelete}
                disabled={saving}
              >
                <Trash2 size={12} />
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button className="btn-ghost" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingEvent ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
