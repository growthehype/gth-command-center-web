import { useMemo, useState, useEffect } from 'react'
import { format, parseISO, addDays, isWithinInterval, startOfDay } from 'date-fns'
import { useAppStore } from '@/lib/store'
import { invoiceFiles } from '@/lib/api'
import {
  formatCurrency,
  formatDate,
  relativeDate,
  daysSince,
  isOverdue,
  clientHealth,
  sanitizeActivityHtml,
} from '@/lib/utils'

// Priority sort weight — lower = higher priority
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

export default function Dashboard() {
  const {
    clients,
    tasks,
    projects,
    leads,
    events,
    activity,
    setCurrentPage,
  } = useAppStore()

  const now = new Date()
  const todayStr = format(now, 'MMM d, yyyy') // "Apr 5, 2026"
  const todayStart = startOfDay(now)
  const sevenDaysOut = addDays(todayStart, 7)

  // ===================== STAT COMPUTATIONS =====================

  const mrr = useMemo(
    () =>
      clients
        .filter((c) => c.status === 'active')
        .reduce((sum, c) => sum + (c.mrr || 0), 0),
    [clients],
  )

  const [invoiceFileCount, setInvoiceFileCount] = useState(0)
  useEffect(() => {
    invoiceFiles.getAll().then((files: any[]) => {
      setInvoiceFileCount(files?.length || 0)
    }).catch(() => {})
  }, [])

  const pipelineValue = useMemo(
    () =>
      leads
        .filter((l) => l.stage !== 'closed' && l.stage !== 'lost')
        .reduce((sum, l) => sum + (l.deal_value || 0), 0),
    [leads],
  )

  const openTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks])
  const overdueTaskCount = useMemo(
    () => openTasks.filter((t) => isOverdue(t.due_date)).length,
    [openTasks],
  )

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === 'backlog' || p.status === 'progress' || p.status === 'review'),
    [projects],
  )

  const staleClients = useMemo(
    () =>
      clients.filter(
        (c) => c.status === 'active' && daysSince(c.last_activity) > 14,
      ),
    [clients],
  )

  // ===================== UPCOMING 7 DAYS =====================

  type UpcomingItem = {
    date: string
    time: string | null
    label: string
    type: 'task' | 'event'
    overdue: boolean
    clientName: string | null
  }

  const upcomingItems = useMemo(() => {
    const items: UpcomingItem[] = []

    // Tasks with due dates in the next 7 days (or overdue)
    openTasks.forEach((t) => {
      if (!t.due_date) return
      try {
        const d = parseISO(t.due_date)
        const inRange = isWithinInterval(d, { start: todayStart, end: sevenDaysOut })
        const overdue = isOverdue(t.due_date)
        if (inRange || overdue) {
          items.push({
            date: t.due_date,
            time: null,
            label: t.text,
            type: 'task',
            overdue,
            clientName: t.client_name || null,
          })
        }
      } catch {
        // skip invalid dates
      }
    })

    // Calendar events in the next 7 days
    events.forEach((e) => {
      if (!e.date) return
      try {
        const d = parseISO(e.date)
        if (isWithinInterval(d, { start: todayStart, end: sevenDaysOut })) {
          items.push({
            date: e.date,
            time: e.start_time || null,
            label: e.title,
            type: 'event',
            overdue: false,
            clientName: e.client_name || null,
          })
        }
      } catch {
        // skip
      }
    })

    // Sort by date, then time
    items.sort((a, b) => {
      const dc = a.date.localeCompare(b.date)
      if (dc !== 0) return dc
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return 0
    })

    return items
  }, [openTasks, events, todayStart, sevenDaysOut])

  // ===================== TOP PRIORITY TASKS =====================

  const topPriorityTasks = useMemo(
    () =>
      [...openTasks]
        .sort((a, b) => {
          const pa = PRIORITY_WEIGHT[a.priority] ?? 4
          const pb = PRIORITY_WEIGHT[b.priority] ?? 4
          if (pa !== pb) return pa - pb
          // secondary: overdue first, then by due_date
          const aOver = isOverdue(a.due_date) ? 0 : 1
          const bOver = isOverdue(b.due_date) ? 0 : 1
          if (aOver !== bOver) return aOver - bOver
          return (a.due_date || '9999').localeCompare(b.due_date || '9999')
        })
        .slice(0, 6),
    [openTasks],
  )

  // ===================== NEEDS CHECK-IN =====================

  const needsCheckIn = useMemo(
    () =>
      [...staleClients]
        .sort((a, b) => daysSince(b.last_activity) - daysSince(a.last_activity))
        .slice(0, 8),
    [staleClients],
  )

  // ===================== RECENT ACTIVITY =====================

  const recentActivity = useMemo(
    () =>
      [...activity]
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
        .slice(0, 6),
    [activity],
  )

  // ===================== HELPERS =====================

  function priorityBadge(priority: string) {
    switch (priority) {
      case 'urgent':
        return <span className="badge badge-err">Urgent</span>
      case 'high':
        return <span className="badge badge-warn">High</span>
      case 'medium':
        return <span className="badge badge-neutral">Med</span>
      case 'low':
        return <span className="badge badge-neutral">Low</span>
      default:
        return null
    }
  }

  function activityIcon(type: string) {
    switch (type) {
      case 'task_complete':
        return '✓'
      case 'invoice_paid':
        return '$'
      case 'client_created':
        return '+'
      case 'project_created':
        return '◆'
      case 'meeting':
        return '◎'
      default:
        return '·'
    }
  }

  // ===================== RENDER =====================

  return (
    <div className="space-y-6">
      {/* ---- HEADER ---- */}
      <div className="flex items-baseline justify-between">
        <h1>Dashboard</h1>
        <span className="mono text-steel">{todayStr}</span>
      </div>

      {/* ---- STAT CARDS ---- */}
      <div className="grid grid-cols-6 gap-3">
        {/* MRR */}
        <button
          className="stat-card text-left cursor-pointer transition-all duration-150 hover:border-dim"
          onClick={() => setCurrentPage('clients')}
        >
          <div className="stat-value">{formatCurrency(mrr)}</div>
          <div className="stat-label">MRR</div>
        </button>

        {/* Invoices */}
        <button
          className="stat-card text-left cursor-pointer transition-all duration-150 hover:border-dim"
          onClick={() => setCurrentPage('invoices')}
        >
          <div className="stat-value">{invoiceFileCount}</div>
          <div className="stat-label">Invoices</div>
        </button>

        {/* Pipeline Value */}
        <button
          className="stat-card text-left cursor-pointer transition-all duration-150 hover:border-dim"
          onClick={() => setCurrentPage('outreach')}
        >
          <div className="stat-value">{formatCurrency(pipelineValue)}</div>
          <div className="stat-label">Pipeline</div>
        </button>

        {/* Open Tasks */}
        <button
          className="stat-card text-left cursor-pointer transition-all duration-150 hover:border-dim"
          onClick={() => setCurrentPage('tasks')}
        >
          <div className="stat-value">
            {openTasks.length}
            {overdueTaskCount > 0 && (
              <span className="text-err" style={{ fontSize: '15px', fontWeight: 700, marginLeft: '6px' }}>
                {overdueTaskCount} overdue
              </span>
            )}
          </div>
          <div className="stat-label">Open Tasks</div>
        </button>

        {/* Active Projects */}
        <button
          className="stat-card text-left cursor-pointer transition-all duration-150 hover:border-dim"
          onClick={() => setCurrentPage('projects')}
        >
          <div className="stat-value">{activeProjects.length}</div>
          <div className="stat-label">Active Projects</div>
        </button>

        {/* Needs Attention */}
        <button
          className="stat-card text-left cursor-pointer transition-all duration-150 hover:border-dim"
          onClick={() => setCurrentPage('clients')}
        >
          <div
            className="stat-value"
            style={staleClients.length > 0 ? { color: '#FF3333' } : undefined}
          >
            {staleClients.length}
          </div>
          <div className="stat-label">Needs Attention</div>
        </button>
      </div>

      {/* ---- MAIN CONTENT GRID ---- */}
      <div className="grid grid-cols-3 gap-4" style={{ gridTemplateColumns: '1fr 1fr 320px' }}>
        {/* ---- LEFT: Upcoming 7 Days ---- */}
        <div className="card col-span-1 flex flex-col" style={{ minHeight: '320px' }}>
          <div className="flex items-center justify-between mb-4">
            <h3>Upcoming (Next 7 Days)</h3>
            <span className="label text-steel">{upcomingItems.length} items</span>
          </div>

          <div className="flex-1 overflow-y-auto -mx-4 px-4" style={{ maxHeight: '340px' }}>
            {upcomingItems.length === 0 ? (
              <p className="text-steel" style={{ fontSize: '13px' }}>
                Nothing scheduled in the next 7 days.
              </p>
            ) : (
              <table className="w-full" style={{ fontSize: '13px' }}>
                <tbody>
                  {upcomingItems.map((item, i) => (
                    <tr key={i} className="table-row">
                      <td className="py-2 pr-3" style={{ width: '72px' }}>
                        <span className={`mono ${item.overdue ? 'text-err' : 'text-steel'}`}>
                          {formatDate(item.date, 'MMM d')}
                        </span>
                      </td>
                      <td className="py-2 pr-2" style={{ width: '48px' }}>
                        {item.time ? (
                          <span className="mono text-steel">{item.time}</span>
                        ) : (
                          <span className="mono text-dim">--:--</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <span className={item.overdue ? 'text-err' : ''}>
                          {item.label}
                        </span>
                        {item.clientName && (
                          <span className="text-steel ml-2" style={{ fontSize: '11px' }}>
                            {item.clientName}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right" style={{ width: '48px' }}>
                        <span
                          className={`badge ${item.type === 'event' ? 'badge-neutral' : item.overdue ? 'badge-err' : 'badge-ok'}`}
                        >
                          {item.type === 'event' ? 'Event' : 'Task'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ---- CENTER: Top Priority Tasks ---- */}
        <div className="card col-span-1 flex flex-col" style={{ minHeight: '320px' }}>
          <div className="flex items-center justify-between mb-4">
            <h3>Open Tasks &mdash; Top Priority</h3>
            <button
              className="label text-steel hover:text-polar transition-colors cursor-pointer"
              onClick={() => setCurrentPage('tasks')}
            >
              View All
            </button>
          </div>

          <div className="flex-1 overflow-y-auto -mx-4 px-4">
            {topPriorityTasks.length === 0 ? (
              <p className="text-steel" style={{ fontSize: '13px' }}>
                No open tasks.
              </p>
            ) : (
              <div className="space-y-1">
                {topPriorityTasks.map((t) => (
                  <div key={t.id} className="table-row flex items-center gap-3 py-2 px-1">
                    <div className="flex-1 min-w-0">
                      <div
                        className={`truncate ${isOverdue(t.due_date) ? 'text-err' : ''}`}
                        style={{ fontSize: '13px' }}
                      >
                        {t.text}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {t.client_name && (
                          <span className="text-steel" style={{ fontSize: '11px' }}>
                            {t.client_name}
                          </span>
                        )}
                        {t.due_date && (
                          <span
                            className={`mono ${isOverdue(t.due_date) ? 'text-err' : 'text-steel'}`}
                          >
                            {formatDate(t.due_date, 'MMM d')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">{priorityBadge(t.priority)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---- RIGHT SIDEBAR ---- */}
        <div className="flex flex-col gap-4">
          {/* Needs Check-In */}
          <div className="card flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3>Needs Check-In</h3>
              <span className="label text-steel">{needsCheckIn.length}</span>
            </div>

            {needsCheckIn.length === 0 ? (
              <p className="text-ok" style={{ fontSize: '13px' }}>
                All clients recently active.
              </p>
            ) : (
              <div className="space-y-1">
                {needsCheckIn.map((c) => {
                  const days = daysSince(c.last_activity)
                  const health = clientHealth(days)
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-1.5 table-row cursor-pointer"
                      onClick={() => {
                        setCurrentPage('clients')
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate" style={{ fontSize: '13px' }}>
                          {c.name}
                        </div>
                        <div className="mono text-steel">
                          {c.service || 'No service'}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <span
                          className="mono"
                          style={{ color: health.color }}
                        >
                          {days}d
                        </span>
                        <span
                          className="inline-block rounded-full"
                          style={{
                            width: '6px',
                            height: '6px',
                            backgroundColor: health.color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="card flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3>Recent Activity</h3>
              <button
                className="label text-steel hover:text-polar transition-colors cursor-pointer"
                onClick={() => setCurrentPage('activity')}
              >
                View All
              </button>
            </div>

            {recentActivity.length === 0 ? (
              <p className="text-steel" style={{ fontSize: '13px' }}>
                No recent activity.
              </p>
            ) : (
              <div className="space-y-1">
                {recentActivity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 py-1.5">
                    <span
                      className="flex-shrink-0 text-steel mt-0.5"
                      style={{ fontSize: '13px', width: '14px', textAlign: 'center' }}
                    >
                      {activityIcon(a.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="truncate"
                        style={{ fontSize: '13px' }}
                        dangerouslySetInnerHTML={{
                          __html: sanitizeActivityHtml(a.description),
                        }}
                      />
                      <span className="mono text-steel">
                        {relativeDate(a.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
