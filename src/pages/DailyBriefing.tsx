import { useMemo } from 'react'
import { format, parseISO, isToday, isYesterday, startOfDay } from 'date-fns'
import { useAppStore } from '@/lib/store'
import { getGreeting, formatCurrency, isOverdue, daysSince, relativeDate } from '@/lib/utils'
import { useRelativeTime } from '@/hooks/useRelativeTime'
import { Plus } from 'lucide-react'
import AchievementBadges from '@/components/ui/AchievementBadges'
import WeeklyScorecard from '@/components/ui/WeeklyScorecard'
import ActivityHeatmap from '@/components/ui/ActivityHeatmap'

// --------------- DAILY QUOTES ---------------
const DAILY_QUOTES: { text: string; author: string }[] = [
  { text: 'Specific knowledge is found by pursuing your genuine curiosity rather than whatever is hot right now.', author: 'Naval Ravikant' },
  { text: 'Do things that don\'t scale.', author: 'Paul Graham' },
  { text: 'Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work.', author: 'Steve Jobs' },
  { text: 'If you double the number of experiments you do per year, you\'re going to double your inventiveness.', author: 'Jeff Bezos' },
  { text: 'Competition is for losers. If you want to create and capture lasting value, build a monopoly.', author: 'Peter Thiel' },
  { text: 'Software is eating the world.', author: 'Marc Andreessen' },
  { text: 'The best thing a human being can do is to help another human being know more.', author: 'Charlie Munger' },
  { text: 'Risk comes from not knowing what you\'re doing.', author: 'Warren Buffett' },
  { text: 'When something is important enough, you do it even if the odds are not in your favor.', author: 'Elon Musk' },
  { text: 'An entrepreneur is someone who jumps off a cliff and builds a plane on the way down.', author: 'Reid Hoffman' },
  { text: 'In a world of abundance, the only scarcity is human attention.', author: 'Seth Godin' },
  { text: 'Skills are cheap. Passion is priceless.', author: 'Gary Vaynerchuk' },
  { text: 'What gets measured gets managed. What gets managed gets improved.', author: 'Alex Hormozi' },
  { text: 'Let him who would move the world first move himself.', author: 'Socrates' },
  { text: 'The impediment to action advances action. What stands in the way becomes the way.', author: 'Marcus Aurelius' },
  { text: 'We suffer more often in imagination than in reality.', author: 'Seneca' },
  { text: 'Victorious warriors win first and then go to war, while defeated warriors go to war first and then seek to win.', author: 'Sun Tzu' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { text: 'Price is what you pay. Value is what you get.', author: 'Warren Buffett' },
  { text: 'Leverage is a force multiplier for your judgment.', author: 'Naval Ravikant' },
  { text: 'The most dangerous thing is to not evolve.', author: 'Jeff Bezos' },
  { text: 'If you are not embarrassed by the first version of your product, you\'ve launched too late.', author: 'Reid Hoffman' },
  { text: 'People think focus means saying yes to the thing you\'ve got to focus on. It means saying no to the hundred other good ideas.', author: 'Steve Jobs' },
  { text: 'The big money is not in the buying or selling, but in the waiting.', author: 'Charlie Munger' },
  { text: 'Make something people want.', author: 'Paul Graham' },
  { text: 'Appear weak when you are strong, and strong when you are weak.', author: 'Sun Tzu' },
  { text: 'It is not that we have a short time to live, but that we waste a good deal of it.', author: 'Seneca' },
  { text: 'You have power over your mind, not outside events. Realize this, and you will find strength.', author: 'Marcus Aurelius' },
  { text: 'The only way to win is to learn faster than anyone else.', author: 'Eric Ries' },
  { text: 'The person who says he knows what he thinks but cannot express it usually does not know what he thinks.', author: 'Mortimer Adler' },
  { text: 'Strong opinions, loosely held.', author: 'Paul Saffo' },
  { text: 'Speed is the ultimate weapon in business. The best companies move fast and break through bottlenecks.', author: 'Alex Hormozi' },
  { text: 'Every action you take is a vote for the type of person you wish to become.', author: 'James Clear' },
  { text: 'Desire is a contract you make with yourself to be unhappy until you get what you want.', author: 'Naval Ravikant' },
  { text: 'The hard thing about hard things is that there is no formula for dealing with them.', author: 'Ben Horowitz' },
  { text: 'Your margin is my opportunity.', author: 'Jeff Bezos' },
  { text: 'All of humanity\'s problems stem from man\'s inability to sit quietly in a room alone.', author: 'Blaise Pascal' },
  { text: 'The best way to predict the future is to create it.', author: 'Peter Drucker' },
  { text: 'Entrepreneurs are the only people who will work 80 hours a week to avoid working 40 hours a week.', author: 'Lori Greiner' },
  { text: 'If opportunity doesn\'t knock, build a door.', author: 'Milton Berle' },
]

/* Inline component for live-updating relative timestamps */
function RelativeTime({ date, className, style }: { date: string | null; className?: string; style?: React.CSSProperties }) {
  const timeAgo = useRelativeTime(date)
  return <span className={className} style={style}>{timeAgo}</span>
}

export default function DailyBriefing() {
  const {
    clients, tasks, projects, invoices, events, activity, goals, settings,
    setCurrentPage,
  } = useAppStore()

  const displayName = settings.display_name || 'Omar'
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const fullDate = format(now, 'EEEE, MMMM d, yyyy')

  // --------------- DAILY QUOTE ---------------
  const dailyQuote = useMemo(() => {
    const start = new Date(now.getFullYear(), 0, 0)
    const diff = now.getTime() - start.getTime()
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))
    const seed = now.getFullYear() * 1000 + dayOfYear
    return DAILY_QUOTES[seed % DAILY_QUOTES.length]
  }, [])

  // --------------- PRODUCTIVITY STREAK ---------------

  const streak = useMemo(() => {
    // Get all dates that have at least 1 completed task
    const completedDates = new Set<string>()
    tasks.forEach((t) => {
      if (t.done && t.completed_at) {
        try {
          const dateStr = t.completed_at.slice(0, 10)
          completedDates.add(dateStr)
        } catch { /* skip malformed dates */ }
      }
    })

    // Count consecutive days backwards from yesterday (today is still in progress)
    // But if today already has completions, include it and count from today
    let count = 0
    const check = startOfDay(new Date())

    // If today has completions, count today
    if (completedDates.has(format(check, 'yyyy-MM-dd'))) {
      count = 1
      check.setDate(check.getDate() - 1)
    } else {
      // Start checking from yesterday
      check.setDate(check.getDate() - 1)
    }

    // Count consecutive days backwards
    while (completedDates.has(format(check, 'yyyy-MM-dd'))) {
      count++
      check.setDate(check.getDate() - 1)
    }

    return count
  }, [tasks])

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
        detail: 'Due',
        detailDate: overdueInvoice.due_date,
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
        detailDate: null as string | null,
        accent: '#F59E0B',
      }
    }

    // 3 — High-priority overdue task
    const highPriorityOverdue = overdueTasks.find((t) => t.priority === 'high')
    if (highPriorityOverdue) {
      return {
        label: 'Overdue Task',
        title: highPriorityOverdue.text,
        detail: 'Due',
        detailDate: highPriorityOverdue.due_date,
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
        detailDate: null as string | null,
        accent: '#3B82F6',
      }
    }

    return null
  }, [invoices, clients, overdueTasks, tasksDueToday])

  // --------------- GOALS ---------------

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === 'active' || g.status === 'in-progress'),
    [goals],
  )

  // --------------- RENDER ---------------

  return (
    <div className="max-w-full md:max-w-[920px] mx-auto" style={{ padding: '48px 0 64px' }}>
      {/* ---- GREETING ---- */}
      <h1 className="briefing-greeting">
        {getGreeting()}, {displayName}.
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <p className="mono" style={{ color: '#888', fontSize: 13, margin: 0, letterSpacing: '0.02em' }}>
          {fullDate}
        </p>
        {streak > 0 ? (
          <span className={`streak-badge ${streak >= 7 ? 'streak-badge--hot streak-glow' : 'streak-badge--active'}`}>
            <span role="img" aria-label="fire">&#128293;</span> {streak}-day streak
          </span>
        ) : (
          <span className="streak-badge streak-badge--inactive">
            <span role="img" aria-label="fire">&#128293;</span> Start your streak today!
          </span>
        )}
      </div>

      {/* ---- DAILY QUOTE ---- */}
      <div style={{ marginTop: 28, marginBottom: 0 }}>
        <p className="text-steel" style={{
          fontSize: '14px',
          fontStyle: 'italic',
          lineHeight: 1.7,
          maxWidth: 600,
          opacity: 0.7,
        }}>
          &ldquo;{dailyQuote.text}&rdquo;
        </p>
        <p className="text-dim mono" style={{ fontSize: '11px', marginTop: 6 }}>
          &mdash; {dailyQuote.author}
        </p>
      </div>

      {/* ---- TODAY'S FOCUS ---- */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 className="section-header" style={{ marginBottom: 0 }}>Today&apos;s Focus</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setCurrentPage('tasks')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#999', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-polar)')}
              onMouseLeave={e => (e.currentTarget.style.color = '#999')}
            >
              <Plus size={12} strokeWidth={2.5} />
              Add Task
            </button>
            <button
              onClick={() => setCurrentPage('calendar')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#999', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-polar)')}
              onMouseLeave={e => (e.currentTarget.style.color = '#999')}
            >
              <Plus size={12} strokeWidth={2.5} />
              Add Event
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[10px]">
          {/* Due Today */}
          <div className="stat-card stat-card--has-accent">
            <div className="stat-card-accent stat-card-accent--blue" />
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
            className="stat-card stat-card--has-accent"
            style={
              overdueTasks.length > 0
                ? { borderColor: 'rgba(255,51,51,0.25)' }
                : undefined
            }
          >
            <div className="stat-card-accent stat-card-accent--red" />
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
                  <RelativeTime date={t.due_date} className="mono" style={{ color: '#FF3333', flexShrink: 0, fontSize: 13 }} />
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
          <div className="stat-card stat-card--has-accent">
            <div className="stat-card-accent stat-card-accent--purple" />
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

      {/* ---- WEEKLY SCORECARD ---- */}
      <div style={{ marginTop: 36 }}>
        <WeeklyScorecard />
      </div>

      {/* ---- YESTERDAY'S WINS ---- */}
      {yesterdayWins.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className="section-header" style={{ marginBottom: 0 }}>Yesterday&apos;s Wins</h3>
            <button
              onClick={() => setCurrentPage('activity')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#999', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-polar)')}
              onMouseLeave={e => (e.currentTarget.style.color = '#999')}
            >
              <Plus size={12} strokeWidth={2.5} />
              Log a Win
            </button>
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

      {/* ---- ACTIVITY HEATMAP ---- */}
      <div style={{ marginTop: 36 }}>
        <ActivityHeatmap />
      </div>

      {/* ---- ONE THING THAT NEEDS YOU ---- */}
      {oneThingCard && (
        <div style={{ marginTop: 36 }}>
          <h3 className="section-header" style={{ marginBottom: 14 }}>One Thing That Needs You</h3>
          <div
            className={`card ${oneThingCard.accent === '#FF3333' ? 'one-thing-urgent' : ''}`}
            style={{
              borderLeft: `4px solid ${oneThingCard.accent}`,
              padding: '20px 24px',
              background: oneThingCard.accent === '#FF3333'
                ? 'linear-gradient(135deg, var(--color-cell) 0%, rgba(220, 38, 38, 0.03) 100%)'
                : oneThingCard.accent === '#F59E0B'
                ? 'linear-gradient(135deg, var(--color-cell) 0%, rgba(245, 158, 11, 0.03) 100%)'
                : 'linear-gradient(135deg, var(--color-cell) 0%, rgba(37, 99, 235, 0.03) 100%)',
            }}
          >
            <div
              className="label"
              style={{ color: oneThingCard.accent, marginBottom: 8 }}
            >
              {oneThingCard.label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{oneThingCard.title}</div>
            <div className="mono" style={{ color: '#888', marginTop: 6, fontSize: 13 }}>
              {oneThingCard.detail}
              {oneThingCard.detailDate && (
                <>{' '}<RelativeTime date={oneThingCard.detailDate} /></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- GOALS PROGRESS ---- */}
      {activeGoals.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <h3 className="section-header" style={{ marginBottom: 14 }}>Goals Progress</h3>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[10px]"
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

      {/* ---- ACHIEVEMENTS ---- */}
      <div style={{ marginTop: 36 }}>
        <AchievementBadges streak={streak} />
      </div>

      {/* ---- CTA BUTTON ---- */}
      <div style={{ marginTop: 48, textAlign: 'center' }}>
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
