import { useMemo } from 'react'
import { format, parseISO, isToday, isYesterday, startOfDay } from 'date-fns'
import { useAppStore } from '@/lib/store'
import { getGreeting, formatCurrency, isOverdue, daysSince, relativeDate } from '@/lib/utils'
import { useRelativeTime } from '@/hooks/useRelativeTime'
import { Plus, ArrowRight, Check } from 'lucide-react'
import AchievementBadges from '@/components/ui/AchievementBadges'
import QuarterlyScorecard from '@/components/ui/QuarterlyScorecard'
import Skeleton from '@/components/ui/Skeleton'

function BriefingSkeleton() {
  return (
    <div className="brf">
      {/* Greeting */}
      <Skeleton variant="text" width="260px" height="28px" />
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <Skeleton variant="text" width="180px" height="14px" />
        <Skeleton variant="text" width="100px" height="20px" />
      </div>
      {/* Quote */}
      <div style={{ marginTop: 28 }}>
        <Skeleton variant="text" width="80%" height="14px" />
        <Skeleton variant="text" width="120px" height="11px" className="mt-2" />
      </div>
      {/* Today's Focus */}
      <div style={{ marginTop: 40 }}>
        <Skeleton variant="text" width="140px" height="16px" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[10px]" style={{ marginTop: 14 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="stat-card" style={{ minHeight: 140 }}>
              <Skeleton variant="text" width="40px" height="24px" />
              <Skeleton variant="text" width="80px" height="12px" className="mt-2" />
              <Skeleton variant="text" width="100%" height="13px" className="mt-4" />
              <Skeleton variant="text" width="75%" height="13px" className="mt-2" />
            </div>
          ))}
        </div>
      </div>
      {/* Scorecard placeholder */}
      <div style={{ marginTop: 36 }}>
        <Skeleton variant="rect" width="100%" height="120px" />
      </div>
    </div>
  )
}

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
    setCurrentPage, dataLoaded,
  } = useAppStore()

  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')

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
    const completedDates = new Set<string>()
    tasks.forEach((t) => {
      if (t.done && t.completed_at) {
        try {
          const dateStr = t.completed_at.slice(0, 10)
          completedDates.add(dateStr)
        } catch { /* skip malformed dates */ }
      }
    })

    let count = 0
    const check = startOfDay(new Date())

    if (completedDates.has(format(check, 'yyyy-MM-dd'))) {
      count = 1
      check.setDate(check.getDate() - 1)
    } else {
      check.setDate(check.getDate() - 1)
    }

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
    const overdueInvoice = invoices.find(
      (i) => i.status !== 'paid' && i.due_date && isOverdue(i.due_date),
    )
    if (overdueInvoice) {
      return {
        label: 'Overdue Invoice',
        title: `${overdueInvoice.client_name || overdueInvoice.num} — ${formatCurrency(overdueInvoice.amount)}`,
        detail: 'Due',
        detailDate: overdueInvoice.due_date,
        tone: 'err' as const,
        target: 'invoices',
      }
    }

    const staleClient = clients.find(
      (c) => c.status === 'active' && daysSince(c.last_activity) > 21,
    )
    if (staleClient) {
      return {
        label: 'Stale Client',
        title: staleClient.name,
        detail: `No activity in ${daysSince(staleClient.last_activity)} days`,
        detailDate: null as string | null,
        tone: 'warn' as const,
        target: 'clients',
      }
    }

    const highPriorityOverdue = overdueTasks.find((t) => t.priority === 'high')
    if (highPriorityOverdue) {
      return {
        label: 'Overdue Task',
        title: highPriorityOverdue.text,
        detail: 'Due',
        detailDate: highPriorityOverdue.due_date,
        tone: 'err' as const,
        target: 'tasks',
      }
    }

    if (tasksDueToday.length > 0) {
      const t = tasksDueToday[0]
      return {
        label: 'Due Today',
        title: t.text,
        detail: t.client_name || 'Personal',
        detailDate: null as string | null,
        tone: 'info' as const,
        target: 'tasks',
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

  if (!dataLoaded) return <BriefingSkeleton />

  const displayName = settings.display_name || 'Omar'
  const quarter = Math.floor(now.getMonth() / 3) + 1
  const dateLine = `${format(now, 'EEEE, MMMM d')} · Q${quarter} · Week ${format(now, 'I')}`

  return (
    <div className="brf">
      {/* ---- HEADER ---- */}
      <header className="brf-head">
        <p className="brf-date">{dateLine}</p>
        <h1 className="briefing-greeting">
          {getGreeting()}, {displayName}.
        </h1>
        <div className="brf-sub">
          {streak > 0 ? (
            <span className={`streak-badge ${streak >= 7 ? 'streak-badge--hot streak-glow' : 'streak-badge--active'}`}>
              <span className="brf-light" data-tone={streak >= 7 ? 'warn' : 'info'} aria-hidden="true" />
              {streak}-day streak
            </span>
          ) : (
            <span className="streak-badge streak-badge--inactive">
              <span className="brf-light" data-tone="off" aria-hidden="true" />
              No streak yet. Close a task today to start one.
            </span>
          )}
        </div>
        <blockquote className="brf-quote">
          <p>&ldquo;{dailyQuote.text}&rdquo;</p>
          <cite>{dailyQuote.author}</cite>
        </blockquote>
      </header>

      {/* ---- THE SIGNAL: one thing that needs you ---- */}
      {oneThingCard && (
        <section
          className={`brf-signal ${oneThingCard.tone === 'err' ? 'one-thing-urgent' : ''}`}
          data-tone={oneThingCard.tone}
          aria-label="Needs your attention"
        >
          <span className="brf-signal-beam" aria-hidden="true" />
          <div className="brf-signal-body">
            <p className="brf-signal-label">
              <span className="brf-light" data-tone={oneThingCard.tone} aria-hidden="true" />
              {oneThingCard.label}
            </p>
            <p className="brf-signal-title">{oneThingCard.title}</p>
            <p className="brf-signal-detail">
              {oneThingCard.detail}
              {oneThingCard.detailDate && (
                <>{' '}<RelativeTime date={oneThingCard.detailDate} /></>
              )}
            </p>
          </div>
          <button className="btn-ghost brf-signal-btn" onClick={() => setCurrentPage(oneThingCard.target)}>
            Open
            <ArrowRight size={13} />
          </button>
        </section>
      )}

      {/* ---- TODAY'S FOCUS ---- */}
      <section className="brf-section">
        <div className="brf-section-head">
          <h3 className="section-header" style={{ marginBottom: 0 }}>Today&apos;s focus</h3>
          <div className="brf-actions">
            <button className="brf-link" onClick={() => setCurrentPage('tasks')}>
              <Plus size={12} />
              Add task
            </button>
            <button className="brf-link" onClick={() => setCurrentPage('calendar')}>
              <Plus size={12} />
              Add event
            </button>
          </div>
        </div>

        <div className="brf-board">
          {/* Due Today */}
          <div className="brf-col">
            <div className="brf-col-head">
              <span className="brf-col-label">
                <span className="brf-light" data-tone={tasksDueToday.length > 0 ? 'info' : 'off'} aria-hidden="true" />
                Due today
              </span>
              <span className="brf-count">{tasksDueToday.length}</span>
            </div>
            <ul className="brf-list">
              {tasksDueToday.length === 0 && <li className="brf-empty">Nothing due today.</li>}
              {tasksDueToday.slice(0, 4).map((t) => (
                <li key={t.id} className="brf-row">
                  <span className="brf-row-text">{t.text}</span>
                  {t.client_name && <span className="brf-row-meta">{t.client_name}</span>}
                </li>
              ))}
            </ul>
            {tasksDueToday.length > 4 && (
              <button className="brf-more" onClick={() => setCurrentPage('tasks')}>+{tasksDueToday.length - 4} more</button>
            )}
          </div>

          {/* Overdue */}
          <div className="brf-col" data-alert={overdueTasks.length > 0 || undefined}>
            <div className="brf-col-head">
              <span className="brf-col-label">
                <span className="brf-light" data-tone={overdueTasks.length > 0 ? 'err' : 'off'} aria-hidden="true" />
                Overdue
              </span>
              <span className="brf-count">{overdueTasks.length}</span>
            </div>
            <ul className="brf-list">
              {overdueTasks.length === 0 && <li className="brf-empty">All clear.</li>}
              {overdueTasks.slice(0, 4).map((t) => (
                <li key={t.id} className="brf-row">
                  <span className="brf-row-text">{t.text}</span>
                  <RelativeTime date={t.due_date} className="brf-row-meta brf-row-meta--err" />
                </li>
              ))}
            </ul>
            {overdueTasks.length > 4 && (
              <button className="brf-more" onClick={() => setCurrentPage('tasks')}>+{overdueTasks.length - 4} more</button>
            )}
          </div>

          {/* Meetings Today */}
          <div className="brf-col">
            <div className="brf-col-head">
              <span className="brf-col-label">
                <span className="brf-light" data-tone={meetingsToday.length > 0 ? 'info' : 'off'} aria-hidden="true" />
                Meetings today
              </span>
              <span className="brf-count">{meetingsToday.length}</span>
            </div>
            <ul className="brf-list">
              {meetingsToday.length === 0 && <li className="brf-empty">No meetings scheduled.</li>}
              {meetingsToday.slice(0, 4).map((e) => (
                <li key={e.id} className="brf-row">
                  <span className="brf-row-text">{e.title}</span>
                  <span className="brf-row-meta">{e.start_time?.slice(0, 5)}</span>
                </li>
              ))}
            </ul>
            {meetingsToday.length > 4 && (
              <button className="brf-more" onClick={() => setCurrentPage('calendar')}>+{meetingsToday.length - 4} more</button>
            )}
          </div>
        </div>
      </section>

      {/* ---- QUARTERLY SCORECARD ---- */}
      <section className="brf-section">
        <QuarterlyScorecard />
      </section>

      {/* ---- YESTERDAY'S WINS ---- */}
      {yesterdayWins.length > 0 && (
        <section className="brf-section">
          <div className="brf-section-head">
            <h3 className="section-header" style={{ marginBottom: 0 }}>Yesterday&apos;s wins</h3>
          </div>
          <ul className="card brf-wins">
            {yesterdayWins.map((a) => (
              <li key={a.id} className="brf-row">
                <Check size={13} className="text-ok shrink-0" />
                <span className="brf-row-text">{a.description}</span>
                <span className="brf-row-meta">{a.entity || a.type}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- GOALS PROGRESS ---- */}
      {activeGoals.length > 0 && (
        <section className="brf-section">
          <div className="brf-section-head">
            <h3 className="section-header" style={{ marginBottom: 0 }}>Goals</h3>
            <button className="brf-link" onClick={() => setCurrentPage('goals')}>
              View all
              <ArrowRight size={12} />
            </button>
          </div>
          <div className="brf-goals">
            {activeGoals.slice(0, 4).map((g) => {
              const pct =
                g.target_value && g.target_value > 0
                  ? Math.min(Math.round(((g.current_value || 0) / g.target_value) * 100), 100)
                  : 0
              return (
                <div className="brf-goal" key={g.id}>
                  <div className="brf-goal-title">{g.title}</div>
                  <div className="brf-goal-track">
                    <div className="brf-goal-fill" data-done={pct >= 100 || undefined} style={{ transform: `scaleX(${pct / 100})` }} />
                  </div>
                  <div className="brf-goal-meta">
                    <span className={pct >= 100 ? 'text-ok' : ''}>{pct}%</span>
                    {g.target_date && <span>{format(parseISO(g.target_date), 'MMM d')}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---- ACHIEVEMENTS ---- */}
      <section className="brf-section">
        <AchievementBadges streak={streak} />
      </section>

      {/* ---- CTA ---- */}
      <div className="brf-cta">
        <button className="btn-primary brf-cta-btn" onClick={() => setCurrentPage('dashboard')}>
          Enter Command Center
          <span className="brf-cta-icon" aria-hidden="true"><ArrowRight size={13} /></span>
        </button>
      </div>
    </div>
  )
}
