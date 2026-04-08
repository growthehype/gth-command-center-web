import { useMemo } from 'react'
import { format, parseISO, addDays, isWithinInterval, startOfDay, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { useAppStore } from '@/lib/store'
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
import PageHint from '@/components/ui/PageHint'

// Priority sort weight — lower = higher priority
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

// ===================== SPARKLINE COMPONENT =====================

function Sparkline({
  data,
  width = 80,
  height = 40,
  color = '#22C55E',
  fillOpacity = 0.15,
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
  fillOpacity?: number
}) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const padding = 2

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = height - padding - ((v - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  const polylineStr = points.join(' ')
  // Create fill path: same line but close to bottom
  const firstX = padding
  const lastX = padding + ((data.length - 1) / (data.length - 1)) * (width - padding * 2)
  const fillPath = `M${firstX},${height - padding} L${points.map(p => p).join(' L')} L${lastX},${height - padding} Z`

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <path d={fillPath} fill={color} opacity={fillOpacity} />
      <polyline
        points={polylineStr}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dot on last point */}
      {data.length > 0 && (() => {
        const lastPt = points[points.length - 1].split(',')
        return (
          <circle cx={lastPt[0]} cy={lastPt[1]} r="2.5" fill={color} />
        )
      })()}
    </svg>
  )
}

// ===================== PERIOD COMPARISON BADGE =====================

function PeriodBadge({ current, previous, label = 'vs last month' }: { current: number; previous: number; label?: string }) {
  if (previous === 0 && current === 0) return null
  const pctChange = previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 100)
  if (pctChange === 0) return null
  const isUp = pctChange > 0
  return (
    <span
      className={isUp ? 'text-ok' : 'text-err'}
      style={{ fontSize: '10px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}
    >
      {isUp ? '\u2191' : '\u2193'}{Math.abs(pctChange)}%
      <span className="text-dim" style={{ fontWeight: 400 }}>{label}</span>
    </span>
  )
}

// ===================== REVENUE TREND CHART (SVG) =====================

function RevenueTrendChart({
  months,
}: {
  months: { label: string; value: number; isCurrent: boolean }[]
}) {
  const chartW = 100 // percentage-based, we use viewBox
  const chartH = 200
  const padTop = 20
  const padBottom = 30
  const padLeft = 60
  const padRight = 16
  const innerW = chartW
  const barAreaH = chartH - padTop - padBottom

  const maxVal = Math.max(...months.map((m) => m.value), 1)
  // Round up to nice number for y-axis
  const yMax = Math.ceil(maxVal / 1000) * 1000 || 1000
  const yTicks = 4
  const barCount = months.length
  const gap = 12
  const totalGaps = (barCount + 1) * gap
  const viewBoxW = padLeft + padRight + totalGaps + barCount * 48

  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${chartH}`}
      width="100%"
      height={chartH}
      style={{ display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Y-axis labels and grid lines */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const val = (yMax / yTicks) * i
        const y = padTop + barAreaH - (val / yMax) * barAreaH
        return (
          <g key={i}>
            <line
              x1={padLeft}
              x2={viewBoxW - padRight}
              y1={y}
              y2={y}
              stroke="rgba(136,136,136,0.15)"
              strokeWidth="0.5"
            />
            <text
              x={padLeft - 8}
              y={y + 3}
              fill="#888"
              fontSize="9"
              fontFamily="'Space Mono', monospace"
              textAnchor="end"
            >
              ${(val / 1000).toFixed(val >= 1000 ? 0 : 1)}k
            </text>
          </g>
        )
      })}

      {/* Bars */}
      {months.map((m, i) => {
        const barW = 48
        const x = padLeft + gap + i * (barW + gap)
        const barH = (m.value / yMax) * barAreaH
        const y = padTop + barAreaH - barH
        const baseColor = m.isCurrent ? '#2563EB' : 'rgba(136,136,136,0.35)'
        const hoverColor = m.isCurrent ? '#3B82F6' : 'rgba(136,136,136,0.5)'

        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(barH, 1)}
              fill={baseColor}
              style={{ transition: 'all 0.3s ease' }}
            >
              <animate attributeName="fill" from={baseColor} to={hoverColor} dur="0.2s" begin="mouseover" fill="freeze" />
              <animate attributeName="fill" from={hoverColor} to={baseColor} dur="0.2s" begin="mouseout" fill="freeze" />
            </rect>
            {/* Value on top */}
            {m.value > 0 && (
              <text
                x={x + barW / 2}
                y={y - 5}
                fill={m.isCurrent ? '#FFF' : '#888'}
                fontSize="9"
                fontFamily="'Space Mono', monospace"
                textAnchor="middle"
                fontWeight={m.isCurrent ? 700 : 400}
              >
                ${(m.value / 1000).toFixed(1)}k
              </text>
            )}
            {/* X-axis label */}
            <text
              x={x + barW / 2}
              y={chartH - 6}
              fill={m.isCurrent ? '#FFF' : '#888'}
              fontSize="9"
              fontFamily="'Space Mono', monospace"
              textAnchor="middle"
              fontWeight={m.isCurrent ? 700 : 400}
            >
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ===================== CASH FLOW PROGRESS BAR =====================

function CashFlowBar({ collected, total }: { collected: number; total: number }) {
  const pct = total > 0 ? Math.min((collected / total) * 100, 100) : 0
  return (
    <div className="w-full" style={{ height: '8px', backgroundColor: 'rgba(136,136,136,0.15)' }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: pct >= 80 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#FF3333',
          transition: 'width 0.5s ease',
        }}
      />
    </div>
  )
}

// ===================== CLIENT HEALTH DOT BAR =====================

function ClientHealthBar({ distribution }: { distribution: { label: string; count: number; color: string }[] }) {
  const total = distribution.reduce((s, d) => s + d.count, 0)
  if (total === 0) return <p className="text-dim" style={{ fontSize: '12px' }}>No active clients.</p>

  return (
    <div>
      {/* Stacked horizontal bar */}
      <div className="flex" style={{ height: '12px', overflow: 'hidden' }}>
        {distribution.map((d) =>
          d.count > 0 ? (
            <div
              key={d.label}
              style={{
                width: `${(d.count / total) * 100}%`,
                backgroundColor: d.color,
                minWidth: d.count > 0 ? '4px' : '0',
                transition: 'width 0.5s ease',
              }}
            />
          ) : null,
        )}
      </div>
      {/* Legend row */}
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {distribution.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div style={{ width: '8px', height: '8px', backgroundColor: d.color }} />
            <span className="text-dim" style={{ fontSize: '11px' }}>{d.label}</span>
            <span className="mono text-steel" style={{ fontSize: '11px' }}>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const {
    clients,
    tasks,
    projects,
    leads,
    events,
    activity,
    invoices,
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

  const invoiceCount = useMemo(() => invoices.length, [invoices])

  const invoicePipelineValue = useMemo(
    () =>
      invoices
        .filter((i) => i.status !== 'paid')
        .reduce((sum, i) => sum + (i.amount || 0), 0),
    [invoices],
  )

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

  // ===================== PERIOD COMPARISONS =====================

  const currentMonthStart = startOfMonth(now)
  const currentMonthEnd = endOfMonth(now)
  const prevMonthStart = startOfMonth(subMonths(now, 1))
  const prevMonthEnd = endOfMonth(subMonths(now, 1))

  const isInRange = (dateStr: string | null, start: Date, end: Date): boolean => {
    if (!dateStr) return false
    try {
      const d = parseISO(dateStr)
      return isWithinInterval(d, { start, end })
    } catch {
      return false
    }
  }

  // Invoice comparisons (current month vs previous month)
  const currentMonthInvoices = useMemo(
    () => invoices.filter((i) => isInRange(i.created_at, currentMonthStart, currentMonthEnd)),
    [invoices, currentMonthStart, currentMonthEnd],
  )
  const prevMonthInvoices = useMemo(
    () => invoices.filter((i) => isInRange(i.created_at, prevMonthStart, prevMonthEnd)),
    [invoices, prevMonthStart, prevMonthEnd],
  )

  const currentMonthInvoiceTotal = currentMonthInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const prevMonthInvoiceTotal = prevMonthInvoices.reduce((s, i) => s + (i.amount || 0), 0)

  // Task comparisons
  const currentMonthTasksCompleted = useMemo(
    () => tasks.filter((t) => isInRange(t.completed_at, currentMonthStart, currentMonthEnd)).length,
    [tasks, currentMonthStart, currentMonthEnd],
  )
  const prevMonthTasksCompleted = useMemo(
    () => tasks.filter((t) => isInRange(t.completed_at, prevMonthStart, prevMonthEnd)).length,
    [tasks, prevMonthStart, prevMonthEnd],
  )

  // ===================== SPARKLINE DATA =====================

  // MRR sparkline: last 6 months of total invoiced revenue
  const mrrSparklineData = useMemo(() => {
    const data: number[] = []
    for (let i = 5; i >= 0; i--) {
      const mStart = startOfMonth(subMonths(now, i))
      const mEnd = endOfMonth(subMonths(now, i))
      const total = invoices
        .filter((inv) => isInRange(inv.created_at, mStart, mEnd))
        .reduce((s, inv) => s + (inv.amount || 0), 0)
      data.push(total)
    }
    // If all zeroes, use current MRR as the last point to show something
    if (data.every((d) => d === 0) && mrr > 0) {
      data[data.length - 1] = mrr
    }
    return data
  }, [invoices, mrr])

  // Task completion sparkline: last 7 days
  const taskSparklineData = useMemo(() => {
    const data: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = format(d, 'yyyy-MM-dd')
      data.push(tasks.filter((t) => t.completed_at && t.completed_at.startsWith(dateStr)).length)
    }
    return data
  }, [tasks])

  // ===================== REVENUE TREND (LAST 6 MONTHS) =====================

  const revenueTrendMonths = useMemo(() => {
    const result: { label: string; value: number; isCurrent: boolean }[] = []
    for (let i = 5; i >= 0; i--) {
      const mDate = subMonths(now, i)
      const mStart = startOfMonth(mDate)
      const mEnd = endOfMonth(mDate)
      const total = invoices
        .filter((inv) => isInRange(inv.created_at, mStart, mEnd))
        .reduce((s, inv) => s + (inv.amount || 0), 0)
      result.push({
        label: format(mDate, 'MMM'),
        value: total,
        isCurrent: i === 0,
      })
    }
    return result
  }, [invoices])

  // ===================== CASH FLOW =====================

  const cashFlow = useMemo(() => {
    const thisMonthInvoices = invoices.filter((i) => isInRange(i.created_at, currentMonthStart, currentMonthEnd))
    const invoicedTotal = thisMonthInvoices.reduce((s, i) => s + (i.amount || 0), 0)
    const collectedTotal = thisMonthInvoices
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + (i.amount || 0), 0)
    const outstanding = invoicedTotal - collectedTotal
    const collectionRate = invoicedTotal > 0 ? Math.round((collectedTotal / invoicedTotal) * 100) : 0
    return { invoicedTotal, collectedTotal, outstanding, collectionRate }
  }, [invoices, currentMonthStart, currentMonthEnd])

  // ===================== CLIENT HEALTH DISTRIBUTION =====================

  const clientHealthDistribution = useMemo(() => {
    const activeClients = clients.filter((c) => c.status === 'active')
    let healthy = 0
    let needsCheckin = 0
    let stale = 0
    let atRisk = 0

    activeClients.forEach((c) => {
      const days = daysSince(c.last_activity)
      const h = clientHealth(days)
      if (h.label === 'Healthy') healthy++
      else if (h.label === 'Needs check-in') needsCheckin++
      else if (h.label === 'Stale') stale++
      else atRisk++
    })

    return [
      { label: 'Healthy', count: healthy, color: '#22C55E' },
      { label: 'Needs Check-in', count: needsCheckin, color: '#F59E0B' },
      { label: 'Stale', count: stale, color: '#FF3333' },
      { label: 'At Risk', count: atRisk, color: '#CC0000' },
    ]
  }, [clients])

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
      { key: 'done', label: 'Done', color: '#22C55E' },
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

      <PageHint
        id="dashboard"
        title="Welcome to your Dashboard"
        tips={[
          'Click any stat card to jump to that section.',
          'Use Ctrl+K to search anything across the CRM.',
          'Press Ctrl+J to open the AI assistant for help.',
          'Navigate with keyboard: G then D (Dashboard), G then C (Clients), G then I (Invoices).',
        ]}
        shortcut="Ctrl+K to search"
      />

      {/* ---- ROW 1: STAT CARDS ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* MRR */}
        <button
          className="stat-card stat-card--has-accent text-left cursor-pointer"
          onClick={() => setCurrentPage('clients')}
        >
          <div className="stat-card-accent stat-card-accent--green" />
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="stat-value">
                {formatCurrency(mrr)}
              </div>
              <div className="stat-label">MRR</div>
              <div style={{ marginTop: '2px' }}>
                <PeriodBadge current={currentMonthInvoiceTotal} previous={prevMonthInvoiceTotal} />
              </div>
            </div>
            <div style={{ opacity: 0.8, flexShrink: 0 }}>
              <Sparkline data={mrrSparklineData} width={64} height={36} color="#22C55E" />
            </div>
          </div>
        </button>

        {/* Invoices */}
        <button
          className="stat-card stat-card--has-accent text-left cursor-pointer"
          onClick={() => setCurrentPage('invoices')}
        >
          <div className="stat-card-accent stat-card-accent--cyan" />
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="stat-value">{invoiceCount}</div>
              <div className="stat-label">Invoices</div>
              <div style={{ marginTop: '2px' }}>
                <PeriodBadge current={currentMonthInvoices.length} previous={prevMonthInvoices.length} />
              </div>
            </div>
          </div>
        </button>

        {/* Pipeline Value */}
        <button
          className="stat-card stat-card--has-accent text-left cursor-pointer"
          onClick={() => setCurrentPage('invoices')}
        >
          <div className="stat-card-accent stat-card-accent--amber" />
          <div className="stat-value">
            {formatCurrency(invoicePipelineValue + pipelineValue)}
            {trendArrow(invoices.filter((i) => i.status !== 'paid').length + leads.filter((l) => l.stage !== 'closed' && l.stage !== 'lost').length)}
          </div>
          <div className="stat-label">Pipeline</div>
        </button>

        {/* Open Tasks */}
        <button
          className="stat-card stat-card--has-accent text-left cursor-pointer"
          onClick={() => setCurrentPage('tasks')}
        >
          <div className="stat-card-accent stat-card-accent--blue" />
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="stat-value">
                {openTasks.length}
                {overdueTaskCount > 0 && (
                  <span className="text-err" style={{ fontSize: '15px', fontWeight: 700, marginLeft: '6px' }}>
                    {overdueTaskCount} overdue
                  </span>
                )}
              </div>
              <div className="stat-label">Open Tasks</div>
              <div style={{ marginTop: '2px' }}>
                <PeriodBadge current={currentMonthTasksCompleted} previous={prevMonthTasksCompleted} label="completed vs last mo" />
              </div>
            </div>
            <div style={{ opacity: 0.8, flexShrink: 0 }}>
              <Sparkline data={taskSparklineData} width={64} height={36} color="#2563EB" />
            </div>
          </div>
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

      {/* ---- ROW 2: Revenue Trend + Cash Flow + Client Health ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Trend — Last 6 Months */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-header" style={{ marginBottom: 0 }}>Revenue Trend &mdash; Last 6 Months</h3>
            <span className="text-dim" style={{ fontSize: '11px' }}>
              Total: {formatCurrency(revenueTrendMonths.reduce((s, m) => s + m.value, 0))}
            </span>
          </div>
          <RevenueTrendChart months={revenueTrendMonths} />
        </div>

        {/* Cash Flow + Client Health stacked */}
        <div className="flex flex-col gap-4">
          {/* Cash Flow Indicator */}
          <div className="card">
            <h3 className="section-header" style={{ marginBottom: 8 }}>Cash Flow &mdash; {format(now, 'MMM yyyy')}</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-dim" style={{ fontSize: '12px' }}>Invoiced</span>
                <span className="mono text-polar" style={{ fontSize: '13px', fontWeight: 600 }}>
                  {formatCurrency(cashFlow.invoicedTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dim" style={{ fontSize: '12px' }}>Collected</span>
                <span className="mono text-ok" style={{ fontSize: '13px', fontWeight: 600 }}>
                  {formatCurrency(cashFlow.collectedTotal)}
                </span>
              </div>
              <CashFlowBar collected={cashFlow.collectedTotal} total={cashFlow.invoicedTotal} />
              <div className="flex items-center justify-between">
                <span className="text-dim" style={{ fontSize: '12px' }}>Outstanding</span>
                <span className="mono text-warn" style={{ fontSize: '13px', fontWeight: 600 }}>
                  {formatCurrency(cashFlow.outstanding)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dim" style={{ fontSize: '12px' }}>Collection Rate</span>
                <span
                  className="mono"
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: cashFlow.collectionRate >= 80 ? '#22C55E' : cashFlow.collectionRate >= 50 ? '#F59E0B' : '#FF3333',
                  }}
                >
                  {cashFlow.collectionRate}%
                </span>
              </div>
            </div>
          </div>

          {/* Client Health Overview */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-header" style={{ marginBottom: 0 }}>Client Health</h3>
              <span className="text-dim" style={{ fontSize: '11px' }}>
                {clients.filter((c) => c.status === 'active').length} active
              </span>
            </div>
            <ClientHealthBar distribution={clientHealthDistribution} />
          </div>
        </div>
      </div>

      {/* ---- ROW 3: Revenue by Client + Task Activity ---- */}
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

      {/* ---- ROW 4: Upcoming + Open Tasks + Right Sidebar ---- */}
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

      {/* ---- ROW 5: Project Pipeline (Full Width) ---- */}
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
