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
import ClientAvatar from '@/components/ui/ClientAvatar'

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
  const todayStr = format(now, 'MMM d, yyyy') // "Apr 6, 2026"
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

  // ===================== REVENUE BY CLIENT =====================

  const revenueByClient = useMemo(
    () =>
      clients
        .filter((c) => c.status === 'active' && c.mrr > 0)
        .sort((a, b) => b.mrr - a.mrr),
    [clients],
  )

  const maxMrr = Math.max(...revenueByClient.map((c) => c.mrr), 1)

  // ===================== TASK ACTIVITY — LAST 7 DAYS =====================

  const tasksByDay = useMemo(() => {
    const days: { label: string; date: string; completed: number; created: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = format(d, 'yyyy-MM-dd')
      const label = format(d, 'EEE')
      days.push({
        label,
        date: dateStr,
        completed: tasks.filter((t) => t.completed_at && t.completed_at.startsWith(dateStr)).length,
        created: tasks.filter((t) => t.created_at && t.created_at.startsWith(dateStr)).length,
      })
    }
    return days
  }, [tasks])

  const totalCompletedWeek = useMemo(() => tasksByDay.reduce((s, d) => s + d.completed, 0), [tasksByDay])
  const totalCreatedWeek = useMemo(() => tasksByDay.reduce((s, d) => s + d.created, 0), [tasksByDay])

  // ===================== PROJECT PIPELINE =====================

  const projectPipeline = useMemo(() => {
    const statuses = [
      { key: 'backlog', label: 'Backlog', color: '#6B7280' },
      { key: 'progress', label: 'In Progress', color: '#2563EB' },
      { key: 'review', label: 'Review', color: '#D97706' },
      { key: 'done', label: 'Done', color: '#16A34A' },
    ]
    return statuses.map((s) => ({
      ...s,
      count: projects.filter((p) => p.status === s.key).length,
    }))
  }, [projects])

  const totalPipelineProjects = projectPipeline.reduce((s, p) => s + p.count, 0)

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

  // ===================== WEEK AT A GLANCE =====================

  const weekAtGlance = useMemo(() => {
    const days: { label: string; dateStr: string; dateFmt: string; tasks: number; events: number }[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(todayStart, i)
      const dateStr = format(d, 'yyyy-MM-dd')
      days.push({
        label: format(d, 'EEE'),
        dateStr,
        dateFmt: format(d, 'MMM d'),
        tasks: openTasks.filter((t) => t.due_date && t.due_date.startsWith(dateStr)).length,
        events: events.filter((e) => e.date && e.date.startsWith(dateStr)).length,
      })
    }
    return days
  }, [openTasks, events, todayStart])

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
        return '\u2713'
      case 'invoice_paid':
        return '$'
      case 'client_created':
        return '+'
      case 'project_created':
        return '\u25C6'
      case 'meeting':
        return '\u25CE'
      default:
        return '\u00B7'
    }
  }

  function trendArrow(value: number, positive: boolean = true) {
    if (value === 0) return null
    const isUp = value > 0
    const isGood = positive ? isUp : !isUp
    return (
      <span
        style={{ fontSize: '11px', marginLeft: '4px', fontWeight: 700 }}
        className={isGood ? 'text-ok' : 'text-err'}
      >
        {isUp ? '\u2191' : '\u2193'}
      </span>
    )
  }

  // ===================== RENDER =====================

  return (
    <div className="space-y-6">
      {/* ---- HEADER ---- */}
      <div className="flex items-baseline justify-between">
        <h1 className="section-header" style={{ marginBottom: 0, paddingBottom: 8 }}>Dashboard</h1>
        <span className="mono text-steel">{todayStr}</span>
      </div>

      {/* ---- ROW 1: STAT CARDS ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* MRR */}
        <button
          className="stat-card stat-card--has-accent text-left cursor-pointer"
          onClick={() => setCurrentPage('clients')}
        >
          <div className="stat-card-accent stat-card-accent--green" />
          <div className="stat-value">
            {formatCurrency(mrr)}
            {trendArrow(revenueByClient.length)}
          </div>
          <div className="stat-label">MRR</div>
        </button>

        {/* Invoices */}
        <button
          className="stat-card stat-card--has-accent text-left cursor-pointer"
          onClick={() => setCurrentPage('invoices')}
        >
          <div className="stat-card-accent stat-card-accent--cyan" />
          <div className="stat-value">{invoiceFileCount}</div>
          <div className="stat-label">Invoices</div>
        </button>

        {/* Pipeline Value */}
        <button
          className="stat-card stat-card--has-accent text-left cursor-pointer"
          onClick={() => setCurrentPage('outreach')}
        >
          <div className="stat-card-accent stat-card-accent--amber" />
          <div className="stat-value">
            {formatCurrency(pipelineValue)}
            {trendArrow(leads.filter((l) => l.stage !== 'closed' && l.stage !== 'lost').length)}
          </div>
          <div className="stat-label">Pipeline</div>
        </button>

        {/* Open Tasks */}
        <button
          className="stat-card stat-card--has-accent text-left cursor-pointer"
          onClick={() => setCurrentPage('tasks')}
        >
          <div className="stat-card-accent stat-card-accent--blue" />
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
          className="stat-card stat-card--has-accent text-left cursor-pointer"
          onClick={() => setCurrentPage('projects')}
        >
          <div className="stat-card-accent stat-card-accent--purple" />
          <div className="stat-value">
            {activeProjects.length}
            {trendArrow(activeProjects.length)}
          </div>
          <div className="stat-label">Active Projects</div>
        </button>

        {/* Needs Attention */}
        <button
          className={`stat-card stat-card--has-accent text-left cursor-pointer${staleClients.length > 0 ? ' needs-attention-pulse' : ''}`}
          onClick={() => setCurrentPage('clients')}
          style={staleClients.length > 0 ? { borderColor: 'rgba(255, 51, 51, 0.4)' } : undefined}
        >
          <div className="stat-card-accent stat-card-accent--red" />
          <div
            className="stat-value"
            style={staleClients.length > 0 ? { color: '#FF3333' } : undefined}
          >
            {staleClients.length}
            {staleClients.length > 0 && trendArrow(-1, true)}
          </div>
          <div className="stat-label">Needs Attention</div>
        </button>
      </div>

      {/* ---- ROW 2: Revenue by Client + Task Activity ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue by Client */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-header" style={{ marginBottom: 0 }}>Revenue by Client</h3>
            <span className="text-dim" style={{ fontSize: '11px' }}>{revenueByClient.length} clients</span>
          </div>
          {revenueByClient.length === 0 ? (
            <p className="text-dim" style={{ fontSize: '12px' }}>No active clients with MRR.</p>
          ) : (
            <div className="space-y-2">
              {revenueByClient.map((client) => (
                <div key={client.id} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <ClientAvatar name={client.name} size="sm" />
                      <span className="text-polar truncate" style={{ fontSize: '12px', fontWeight: 600 }}>{client.name}</span>
                      {client.service && (
                        <span className="text-dim truncate" style={{ fontSize: '10px' }}>{client.service}</span>
                      )}
                    </div>
                    <span className="font-mono text-steel flex-shrink-0" style={{ fontSize: '12px' }}>${client.mrr.toLocaleString()}/mo</span>
                  </div>
                  <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full chart-bar transition-all duration-500"
                      style={{
                        width: `${(client.mrr / maxMrr) * 100}%`,
                        background: 'linear-gradient(90deg, rgba(37, 99, 235, 0.6) 0%, rgba(37, 99, 235, 0.3) 100%)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Task Activity — Last 7 Days */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-header" style={{ marginBottom: 0 }}>Task Activity &mdash; Last 7 Days</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-ok rounded-full" />
                <span className="text-dim" style={{ fontSize: '10px' }}>Completed ({totalCompletedWeek})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-border-hard rounded-full" />
                <span className="text-dim" style={{ fontSize: '10px' }}>Created ({totalCreatedWeek})</span>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-2" style={{ height: '100px' }}>
            {tasksByDay.map((day) => {
              const maxVal = Math.max(...tasksByDay.map((d) => Math.max(d.completed, d.created)), 1)
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-0.5" style={{ height: '80px' }}>
                    <div
                      className="flex-1 chart-bar chart-bar--completed"
                      style={{
                        height: `${(day.completed / maxVal) * 100}%`,
                        minHeight: day.completed > 0 ? '4px' : '0',
                      }}
                    />
                    <div
                      className="flex-1 chart-bar chart-bar--created"
                      style={{
                        height: `${(day.created / maxVal) * 100}%`,
                        minHeight: day.created > 0 ? '4px' : '0',
                      }}
                    />
                  </div>
                  <span className="text-dim font-mono" style={{ fontSize: '9px' }}>{day.label}</span>
                </div>
              )
            })}
          </div>
          {totalCompletedWeek === 0 && totalCreatedWeek === 0 && (
            <p className="text-dim text-center mt-3" style={{ fontSize: '11px' }}>No task activity in the last 7 days.</p>
          )}
        </div>
      </div>

      {/* ---- ROW 3: Upcoming + Open Tasks + Right Sidebar ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ---- LEFT: Upcoming 7 Days with Week Glance ---- */}
        <div className="card col-span-1 flex flex-col" style={{ minHeight: '320px' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-header" style={{ marginBottom: 0 }}>Upcoming (Next 7 Days)</h3>
            <span className="label text-steel">{upcomingItems.length} items</span>
          </div>

          {/* Week at a Glance mini strip */}
          <div className="flex gap-1 mb-4 pb-3" style={{ borderBottom: '1px solid var(--color-border, #333)' }}>
            {weekAtGlance.map((day, i) => {
              const total = day.tasks + day.events
              const isBusy = total >= 3
              const isToday = i === 0
              return (
                <div
                  key={day.dateStr}
                  className="flex-1 flex flex-col items-center gap-0.5 py-1.5 week-cell"
                  style={{
                    backgroundColor: isToday
                      ? 'var(--color-surface-2, #1a1a2e)'
                      : 'transparent',
                    border: isToday ? '1px solid var(--color-border-hard, #555)' : '1px solid transparent',
                  }}
                >
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '9px',
                      color: isToday ? 'var(--color-polar, #fff)' : 'var(--color-dim, #666)',
                      fontWeight: isToday ? 700 : 400,
                    }}
                  >
                    {day.label}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: isBusy
                        ? 'var(--color-warn, #EBCB8B)'
                        : total > 0
                        ? 'var(--color-polar, #fff)'
                        : 'var(--color-dim, #555)',
                    }}
                  >
                    {total}
                  </span>
                  <span className="text-dim" style={{ fontSize: '8px' }}>{day.dateFmt}</span>
                </div>
              )
            })}
          </div>

          <div className="flex-1 overflow-y-auto -mx-4 px-4" style={{ maxHeight: '260px' }}>
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
            <h3 className="section-header" style={{ marginBottom: 0 }}>Open Tasks &mdash; Top Priority</h3>
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
              <h3 className="section-header" style={{ marginBottom: 0 }}>Needs Check-In</h3>
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
                      <ClientAvatar name={c.name} size="sm" />
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
              <h3 className="section-header" style={{ marginBottom: 0 }}>Recent Activity</h3>
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

      {/* ---- ROW 4: Project Pipeline (Full Width) ---- */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-header" style={{ marginBottom: 0 }}>Project Pipeline</h3>
          <button
            className="label text-steel hover:text-polar transition-colors cursor-pointer"
            onClick={() => setCurrentPage('projects')}
          >
            View All Projects
          </button>
        </div>

        {totalPipelineProjects === 0 ? (
          <p className="text-dim" style={{ fontSize: '12px' }}>No projects yet.</p>
        ) : (
          <>
            {/* Pipeline bar */}
            <div className="flex rounded-full overflow-hidden" style={{ height: '28px' }}>
              {projectPipeline.map((stage) =>
                stage.count > 0 ? (
                  <div
                    key={stage.key}
                    className="flex items-center justify-center transition-all duration-500"
                    style={{
                      width: `${(stage.count / totalPipelineProjects) * 100}%`,
                      backgroundColor: stage.color,
                      minWidth: '32px',
                    }}
                  >
                    <span className="font-mono" style={{ fontSize: '11px', color: '#fff', fontWeight: 700 }}>
                      {stage.count}
                    </span>
                  </div>
                ) : null,
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {projectPipeline.map((stage) => (
                <div key={stage.key} className="flex items-center gap-1.5">
                  <div
                    className="rounded-full"
                    style={{ width: '8px', height: '8px', backgroundColor: stage.color }}
                  />
                  <span className="text-dim" style={{ fontSize: '11px' }}>
                    {stage.label}
                  </span>
                  <span className="font-mono text-steel" style={{ fontSize: '11px' }}>
                    {stage.count}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pulse animation for Needs Attention card */}
      <style>{`
        .needs-attention-pulse {
          animation: attention-pulse 2s ease-in-out infinite;
        }
        @keyframes attention-pulse {
          0%, 100% { border-color: rgba(255, 51, 51, 0.3); }
          50% { border-color: rgba(255, 51, 51, 0.7); }
        }
      `}</style>
    </div>
  )
}
