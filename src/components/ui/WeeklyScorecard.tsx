import { useMemo } from 'react'
import { startOfWeek, isAfter, parseISO, format } from 'date-fns'
import { useAppStore } from '@/lib/store'
import { formatCurrency } from '@/lib/utils'

interface StatBlock {
  label: string
  value: string | number
  isNonZero: boolean
}

export default function WeeklyScorecard() {
  const { clients, tasks, projects, invoices, activity, timeEntries, settings } = useAppStore()

  const companyName = settings.company_name || 'Command Center'

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    return end
  }, [weekStart])

  const dateRange = `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`

  const stats = useMemo<StatBlock[]>(() => {
    const tasksCompleted = tasks.filter(
      (t) => t.done && t.completed_at && isAfter(parseISO(t.completed_at), weekStart),
    ).length

    const revenueCollected = invoices
      .filter((i) => i.status === 'paid' && i.paid_at && isAfter(parseISO(i.paid_at), weekStart))
      .reduce((s, i) => s + (i.amount || 0), 0)

    const invoicesSent = invoices.filter(
      (i) => i.sent_date && isAfter(parseISO(i.sent_date), weekStart),
    ).length

    const hoursLogged =
      timeEntries
        .filter((te) => isAfter(parseISO(te.started_at), weekStart))
        .reduce((s, te) => s + (te.duration_minutes || 0), 0) / 60

    const newClients = clients.filter(
      (c) => c.created_at && isAfter(parseISO(c.created_at), weekStart),
    ).length

    const activitiesLogged = activity.filter(
      (a) => a.timestamp && isAfter(parseISO(a.timestamp), weekStart),
    ).length

    return [
      { label: 'Tasks Completed', value: tasksCompleted, isNonZero: tasksCompleted > 0 },
      { label: 'Revenue Collected', value: formatCurrency(revenueCollected), isNonZero: revenueCollected > 0 },
      { label: 'Invoices Sent', value: invoicesSent, isNonZero: invoicesSent > 0 },
      { label: 'Hours Logged', value: hoursLogged > 0 ? hoursLogged.toFixed(1) : '0', isNonZero: hoursLogged > 0 },
      { label: 'New Clients', value: newClients, isNonZero: newClients > 0 },
      { label: 'Activities Logged', value: activitiesLogged, isNonZero: activitiesLogged > 0 },
    ]
  }, [tasks, invoices, timeEntries, clients, activity, weekStart])

  const nonZeroCount = stats.filter((s) => s.isNonZero).length

  const grade = useMemo(() => {
    if (nonZeroCount >= 5) return 'Crushing it \u{1F525}'
    if (nonZeroCount >= 3) return 'Solid week \u{1F4AA}'
    return 'Getting started \u{1F528}'
  }, [nonZeroCount])

  return (
    <div
      id="weekly-scorecard"
      style={{
        background: 'linear-gradient(135deg, var(--color-surface) 0%, rgba(59, 130, 246, 0.04) 100%)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: '24px 28px 20px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="mono text-dim" style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
          {companyName}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h3 className="text-polar" style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
            This Week's Scorecard
          </h3>
          <span className="mono text-steel" style={{ fontSize: 12 }}>
            {dateRange}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '14px 12px 10px',
              textAlign: 'center',
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                color: stat.isNonZero ? '#22C55E' : 'var(--color-steel)',
              }}
            >
              {stat.value}
            </div>
            <div
              className="text-dim"
              style={{ fontSize: 11, marginTop: 6, lineHeight: 1.3 }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Grade */}
      <div
        style={{
          marginTop: 16,
          textAlign: 'center',
          fontSize: 14,
          fontWeight: 600,
          color: nonZeroCount >= 5 ? '#22C55E' : nonZeroCount >= 3 ? '#F59E0B' : 'var(--color-steel)',
          letterSpacing: '0.01em',
        }}
      >
        {grade}
      </div>
    </div>
  )
}
