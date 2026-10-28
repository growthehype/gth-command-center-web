import { useMemo } from 'react'
import { startOfQuarter, endOfQuarter, isWithinInterval, parseISO, format, differenceInCalendarDays } from 'date-fns'
import { useAppStore } from '@/lib/store'
import { formatCurrency } from '@/lib/utils'
import CountUp from '@/components/ui/CountUp'

interface StatBlock {
  label: string
  value: number
  format?: (n: number) => string
  isNonZero: boolean
}

function inRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false
  try {
    return isWithinInterval(parseISO(value), { start, end })
  } catch {
    return false
  }
}

export default function QuarterlyScorecard() {
  const { clients, tasks, invoices, activity, timeEntries } = useAppStore()

  const { qStart, qEnd, qLabel, rangeLabel, dayOfQuarter, daysInQuarter } = useMemo(() => {
    const now = new Date()
    const qStart = startOfQuarter(now)
    const qEnd = endOfQuarter(now)
    const q = Math.floor(qStart.getMonth() / 3) + 1
    return {
      qStart,
      qEnd,
      qLabel: `Q${q} ${format(qStart, 'yyyy')}`,
      rangeLabel: `${format(qStart, 'MMM d')} – ${format(qEnd, 'MMM d')}`,
      dayOfQuarter: differenceInCalendarDays(now, qStart) + 1,
      daysInQuarter: differenceInCalendarDays(qEnd, qStart) + 1,
    }
  }, [])

  const stats = useMemo<StatBlock[]>(() => {
    const tasksCompleted = tasks.filter((t) => t.done && inRange(t.completed_at, qStart, qEnd)).length

    const revenueCollected = invoices
      .filter((i) => i.status === 'paid' && inRange(i.paid_at, qStart, qEnd))
      .reduce((s, i) => s + (i.amount || 0), 0)

    const invoicesSent = invoices.filter((i) => inRange(i.sent_date, qStart, qEnd)).length

    const hoursLogged =
      timeEntries
        .filter((te) => inRange(te.started_at, qStart, qEnd))
        .reduce((s, te) => s + (te.duration_minutes || 0), 0) / 60

    const newClients = clients.filter((c) => inRange(c.created_at, qStart, qEnd)).length

    const activitiesLogged = activity.filter((a) => inRange(a.timestamp, qStart, qEnd)).length

    return [
      { label: 'Revenue collected', value: revenueCollected, format: (n: number) => formatCurrency(n), isNonZero: revenueCollected > 0 },
      { label: 'Invoices sent', value: invoicesSent, isNonZero: invoicesSent > 0 },
      { label: 'New clients', value: newClients, isNonZero: newClients > 0 },
      { label: 'Tasks completed', value: tasksCompleted, isNonZero: tasksCompleted > 0 },
      { label: 'Hours logged', value: Math.round(hoursLogged * 10) / 10, isNonZero: hoursLogged > 0 },
      { label: 'Activities logged', value: activitiesLogged, isNonZero: activitiesLogged > 0 },
    ]
  }, [tasks, invoices, timeEntries, clients, activity, qStart, qEnd])

  const nonZeroCount = stats.filter((s) => s.isNonZero).length
  const grade = nonZeroCount >= 5 ? 'Strong quarter' : nonZeroCount >= 3 ? 'Building momentum' : 'Getting started'
  const progress = Math.min(100, Math.round((dayOfQuarter / daysInQuarter) * 100))

  return (
    <section id="quarterly-scorecard" className="qs" aria-labelledby="qs-title">
      <span className="beam" aria-hidden="true" style={{ animationDuration: '11s' }} />
      <span className="edge-spot" aria-hidden="true" />
      <header className="qs-head">
        <div>
          <h3 id="qs-title" className="qs-title">{qLabel} Scorecard</h3>
          <p className="qs-range">{rangeLabel}</p>
        </div>
        <div className="qs-meta">
          <span className="qs-grade" data-level={nonZeroCount >= 5 ? 'high' : nonZeroCount >= 3 ? 'mid' : 'low'}>
            <span className="qs-grade-light" aria-hidden="true" />
            {grade}
          </span>
          <span className="qs-day tabular-nums">
            Day {dayOfQuarter} of {daysInQuarter}
          </span>
        </div>
      </header>

      <div className="qs-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Quarter elapsed">
        <div className="qs-track-fill" style={{ width: `${progress}%` }} />
      </div>

      <dl className="qs-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="qs-cell" data-live={stat.isNonZero || undefined}>
            <dt className="qs-label">{stat.label}</dt>
            <dd className="qs-value"><CountUp value={stat.value} format={stat.format} /></dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
