import { useMemo } from 'react'
import { format, parseISO, isToday, isYesterday, startOfDay } from 'date-fns'
import { useAppStore } from '@/lib/store'
import { getGreeting, formatCurrency, isOverdue, daysSince, relativeDate } from '@/lib/utils'

export default function DailyBriefing() {
  const {
    clients, tasks, projects, invoices, events, activity, goals, settings,
    setCurrentPage,
  } = useAppStore()

  const displayName = settings.display_name || 'Omar'
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const fullDate = format(now, 'EEEE, MMMM d, yyyy')

  // --------------- TODAY'S FOCUS ---------------

  const tasksDueToday = useMemo(
    () => tasks.filter((t) => t.due_date && t.due_date.startsWith(todayStr) && !t.done),
    [tasks, todayStr],
  )

  const overdueTasks = useMemo(
    () => tasks.filter((t) => !t.done && isOverdue(t.due_date)),
    [tasks],
  )

  const meetingsToday = useMemo(
    () =>
      events
        .filter((e) => e.date && e.date.startsWith(todayStr))
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')),
    [events, todayStr],
  )

  // --------------- YESTERDAY'S WINS ---------------

  const yesterdayWins = useMemo(() => {
    return activity
      .filter((a) => {
        if (!a.timestamp) return false
        try {
          return isYesterday(parseISO(a.timestamp))
        } catch {
          return false
        }
      })
      .filter((a) => {
        const d = a.description.toLowerCase()
        return (
          d.includes('completed') ||
          d.includes('done') ||
          d.includes('paid') ||
          d.includes('finished') ||
          a.type === 'task_complete' ||
          a.type === 'invoice_paid' ||
          a.type === 'project_complete'
        )
      })
      .slice(0, 4)
  }, [activity])

  // --------------- ONE THING THAT NEEDS YOU ---------------

  const oneThingCard = useMemo(() => {
    // 1 — Overdue invoice
    const overdueInvoice = invoices.find(
      (i) => i.status !== 'paid' && i.due_date && isOverdue(i.due_date),
    )
    if (overdueInvoice) {
      return {
        label: 'Overdue Invoice',
        title: `${overdueInvoice.client_name || overdueInvoice.num} — ${formatCurrency(overdueInvoice.amount)}`,
        detail: `Due ${relativeDate(overdueInvoice.due_date)}`,
        accent: '#FF3333',
      }
    }

    // 2 — Stale active client > 21 days
    const staleClient = clients.find(
      (c) => c.status === 'active' && daysSince(c.last_activity) > 21,
    )
    if (staleClient) {
      return {
        label: 'Stale Client',
        title: staleClient.name,
        detail: `No activity in ${daysSince(staleClient.last_activity)} days`,
        accent: '#F59E0B',
      }
    }

    // 3 — High-priority overdue task
    const highPriorityOverdue = overdueTasks.find((t) => t.priority === 'high')
    if (highPriorityOverdue) {
      return {
        label: 'Overdue Task',
        title: highPriorityOverdue.text,
        detail: `Due ${relativeDate(highPriorityOverdue.due_date)}`,
        accent: '#FF3333',
      }
    }

    // 4 — Task due today
    if (tasksDueToday.length > 0) {
      const t = tasksDueToday[0]
      return {
        label: 'Due Today',
        title: t.text,
        detail: t.client_name || 'Personal',
        accent: '#3B82F6',
      }
    }

    return null
  }, [invoices, clients, overdueTasks, tasksDueToday])

  // --------------- GOALS ---------------

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === 'active' || g.status === 'in_progress'),
    [goals],
  )

  // --------------- RENDER ---------------

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '48px 0 64px' }}>
      {/* ---- GREETING ---- */}
      <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
        {getGreeting()}, {displayName}.
      </h1>
      <p className="mono" style={{ color: '#888', marginTop: 6, fontSize: 13 }}>
        {fullDate}
      </p>

      {/* ---- TODAY'S FOCUS ---- */}
      <div style={{ marginTop: 36 }}>
        <div className="label" style={{ color: '#999', marginBottom: 10 }}>
          Today&apos;s Focus
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {/* Due Today */}
          <div className="stat-card">
            <div className="stat-value">{tasksDueToday.length}</div>
            <div className="stat-label">Due Today</div>
            <div style={{ marginTop: 12 }}>
              {tasksDueToday.length === 0 && (
                <p style={{ fontSize: 13, color: '#999' }}>Nothing due today</p>
              )}
              {tasksDueToday.slice(0, 3).map((t) => (
                <div
                  key={t.id}
                  style={{
                    fontSize: 13,
                    padding: '4px 0',
                    borderBottom: '1px solid #E0E0E0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.text}
                  </span>
                  {t.client_name && (
                    <span className="mono" style={{ color: '#888', flexShrink: 0, fontSize: 13 }}>
                      {t.client_name}
                    </span>
                  )}
                </div>
              ))}
              {tasksDueToday.length > 3 && (
                <p className="mono" style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
                  +{tasksDueToday.length - 3} more
                </p>
              )}
            </div>
          </div>

          {/* Overdue */}
          <div
            className="stat-card"
            style={
              overdueTasks.length > 0
                ? { borderColor: 'rgba(255,51,51,0.25)' }
                : undefined
            }
          >
            <div
              className="stat-value"
              style={overdueTasks.length > 0 ? { color: '#FF3333' } : undefined}
            >
              {overdueTasks.length}
            </div>
            <div className="stat-label">Overdue</div>
            <div style={{ marginTop: 12 }}>
              {overdueTasks.length === 0 && (
                <p style={{ fontSize: 13, color: '#999' }}>All clear</p>
              )}
              {overdueTasks.slice(0, 3).map((t) => (
                <div
                  key={t.id}
                  style={{
                    fontSize: 13,
                    padding: '4px 0',
                    borderBottom: '1px solid #E0E0E0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.text}
                  </span>
                  <span className="mono" style={{ color: '#FF3333', flexShrink: 0, fontSize: 13 }}>
                    {relativeDate(t.due_date)}
                  </span>
                </div>
              ))}
              {overdueTasks.length > 3 && (
                <p className="mono" style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
                  +{overdueTasks.length - 3} more
                </p>
              )}
            </div>
          </div>

          {/* Meetings Today */}
          <div className="stat-card">
            <div className="stat-value">{meetingsToday.length}</div>
            <div className="stat-label">Meetings Today</div>
            <div style={{ marginTop: 12 }}>
              {meetingsToday.length === 0 && (
                <p style={{ fontSize: 13, color: '#999' }}>No meetings</p>
              )}
              {meetingsToday.slice(0, 4).map((e) => (
                <div
                  key={e.id}
                  style={{
                    fontSize: 13,
                    padding: '4px 0',
                    borderBottom: '1px solid #E0E0E0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.title}
                  </span>
                  <span className="mono" style={{ color: '#888', flexShrink: 0, fontSize: 13 }}>
                    {e.start_time?.slice(0, 5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---- YESTERDAY'S WINS ---- */}
      {yesterdayWins.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="label" style={{ color: '#999', marginBottom: 10 }}>
            Yesterday&apos;s Wins
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            {yesterdayWins.map((a, i) => (
              <div
                key={a.id}
                style={{
                  fontSize: 13,
                  padding: '5px 0',
                  borderBottom: i < yesterdayWins.length - 1 ? '1px solid #E0E0E0' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ color: '#22C55E', fontSize: 13 }}>&#10003;</span>
                <span style={{ opacity: 0.85 }}>{a.description}</span>
                <span className="mono" style={{ color: '#BBB', marginLeft: 'auto', flexShrink: 0, fontSize: 13 }}>
                  {a.entity || a.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- ONE THING THAT NEEDS YOU ---- */}
      {oneThingCard && (
        <div style={{ marginTop: 32 }}>
          <div className="label" style={{ color: '#999', marginBottom: 10 }}>
            One Thing That Needs You
          </div>
          <div
            className="card"
            style={{
              borderLeft: `3px solid ${oneThingCard.accent}`,
              padding: '16px 20px',
            }}
          >
            <div
              className="label"
              style={{ color: oneThingCard.accent, marginBottom: 6 }}
            >
              {oneThingCard.label}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{oneThingCard.title}</div>
            <div className="mono" style={{ color: '#888', marginTop: 4, fontSize: 13 }}>
              {oneThingCard.detail}
            </div>
          </div>
        </div>
      )}

      {/* ---- GOALS PROGRESS ---- */}
      {activeGoals.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="label" style={{ color: '#999', marginBottom: 10 }}>
            Goals Progress
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(activeGoals.length, 4)}, 1fr)`,
              gap: 10,
            }}
          >
            {activeGoals.slice(0, 4).map((g) => {
              const pct =
                g.target_value && g.target_value > 0
                  ? Math.min(Math.round(((g.current_value || 0) / g.target_value) * 100), 100)
                  : 0
              return (
                <div className="card" key={g.id} style={{ padding: '12px 14px' }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      marginBottom: 8,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {g.title}
                  </div>
                  {/* Progress bar */}
                  <div
                    style={{
                      height: 4,
                      background: '#E0E0E0',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: pct >= 100 ? '#22C55E' : '#000000',
                        borderRadius: 2,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  <div
                    className="mono"
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: pct >= 100 ? '#22C55E' : '#555',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{pct}%</span>
                    {g.target_date && (
                      <span style={{ color: '#BBB' }}>
                        {format(parseISO(g.target_date), 'MMM d')}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ---- CTA BUTTON ---- */}
      <div style={{ marginTop: 44, textAlign: 'center' }}>
        <button
          className="btn-primary"
          onClick={() => setCurrentPage('dashboard')}
          style={{ padding: '12px 36px', fontSize: 12 }}
        >
          Enter Command Center &rarr;
        </button>
      </div>
    </div>
  )
}
