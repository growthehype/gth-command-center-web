import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import {
  connectGoogleCalendar,
  disconnectGoogle,
  isGoogleConnected,
  fetchGoogleEvents,
  createGoogleEvent,
  deleteGoogleEvent,
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

  // Week navigation
  const [anchor, setAnchor] = useState(new Date())
  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const weekEnd = useMemo(() => endOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd])

  // Google Calendar
  const [googleConnected, setGoogleConnected] = useState(isGoogleConnected())
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([])
  const [loading, setLoading] = useState(false)

  // Modals
  const [modalOpen, setModalOpen] = useState(false)
  const [viewEvent, setViewEvent] = useState<GoogleCalendarEvent | null>(null)
  const [form, setForm] = useState<EventForm>(blankForm())
  const [saving, setSaving] = useState(false)

  // Check connection on mount
  useEffect(() => {
    setGoogleConnected(isGoogleConnected())
  }, [])

  // Load Google events when connected or week changes
  const loadEvents = useCallback(() => {
    if (!isGoogleConnected()) return
    setLoading(true)
    fetchGoogleEvents(weekStart.toISOString(), weekEnd.toISOString())
      .then((evts) => {
        setEvents(evts)
        // If we got 0 events and token might be expired, update connection status
        if (evts.length === 0 && !isGoogleConnected()) {
          setGoogleConnected(false)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [weekStart, weekEnd])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Map events by day-hour key
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

  /* ---- Navigation ---- */
  const goPrev = () => setAnchor((a) => subWeeks(a, 1))
  const goNext = () => setAnchor((a) => addWeeks(a, 1))
  const goToday = () => setAnchor(new Date())

  /* ---- Google connect/disconnect ---- */
  const handleConnect = () => connectGoogleCalendar()

  const handleDisconnect = () => {
    disconnectGoogle()
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
          {loading && (
            <span className="text-dim" style={{ fontSize: '11px' }}>Syncing...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Google Calendar controls */}
          {googleConnected ? (
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

      {/* Not connected state */}
      {!googleConnected && (
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

      {/* ---- Calendar grid (only when connected) ---- */}
      {googleConnected && (
        <div className="flex-1 overflow-auto">
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
    </div>
  )
}
