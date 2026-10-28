import PersonalCommand from '@/components/personal/PersonalCommand'
import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, isToday, isYesterday, startOfDay } from 'date-fns'
import { useAppStore } from '@/lib/store'
import { getGreeting, formatCurrency, isOverdue, daysSince, relativeDate } from '@/lib/utils'
import { useRelativeTime } from '@/hooks/useRelativeTime'
import { Plus, ArrowRight, Check, ChevronDown } from 'lucide-react'
import QuarterlyScorecard from '@/components/ui/QuarterlyScorecard'
import CountUp from '@/components/ui/CountUp'
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

/* Live command-deck clock */
function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="brf-clock" aria-label={`Current time ${format(now, 'h:mm a')}`}>
      <div className="brf-clock-time">
        {format(now, 'h:mm')}
        <span className="brf-clock-sec">{format(now, 'ss')}</span>
      </div>
      <span className="brf-clock-ampm">
        {format(now, 'a')} · {new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value}
      </span>
    </div>
  )
}

/* Inline component for live-updating relative timestamps */
function RelativeTime({ date, className, style }: { date: string | null; className?: string; style?: React.CSSProperties }) {
  const timeAgo = useRelativeTime(date)
  return <span className={className} style={style}>{timeAgo}</span>
}

export default function DailyBriefing() {
  const {
    clients, tasks, projects, invoices, events, activity, goals, settings,
    setCurrentPage, dataLoaded, setSelectedClientId, setSelectedTaskId, setSelectedInvoiceId,
  } = useAppStore()
  const [attentionOpen, setAttentionOpen] = useState(false)

  const openClient = (id?: string | null) => {
    if (!id) return
    setSelectedClientId(id)
    setCurrentPage('client-detail')
  }
  const openTask = (id: string) => {
    setSelectedTaskId(id)
    setCurrentPage('tasks')
  }
  const openInvoice = (id: string) => {
    setSelectedInvoiceId(id)
    setCurrentPage('invoices')
  }

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
        title: overdueInvoice.client_name || `Invoice ${overdueInvoice.num}`,
        amount: formatCurrency(overdueInvoice.amount) as string | undefined,
        detail: 'Due',
        detailDate: overdueInvoice.due_date,
        tone: 'err' as const,
        target: 'invoices',
        clientId: overdueInvoice.client_id as string | null,
        open: () => openInvoice(overdueInvoice.id),
        openLabel: 'Open invoice',
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
        clientId: staleClient.id as string | null,
        open: () => openClient(staleClient.id),
        openLabel: 'Open client',
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
        clientId: (highPriorityOverdue.client_id ?? null) as string | null,
        open: () => openTask(highPriorityOverdue.id),
        openLabel: 'Open task',
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
        clientId: (t.client_id ?? null) as string | null,
        open: () => openTask(t.id),
        openLabel: 'Open task',
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
  const dateLine = `${format(now, 'EEEE, MMMM d, yyyy')} · Q${quarter} · Week ${format(now, 'I')}`
  const overdueInvoiceList = invoices.filter((i) => i.status !== 'paid' && i.due_date && isOverdue(i.due_date))
  const attentionCount = overdueTasks.length + overdueInvoiceList.length

  return (
    <div className="brf">
      {/* ---- COMMAND DECK ---- */}
      <header className="brf-deck rv" style={{ ['--i' as string]: 0 }}>
        <span className="beam" aria-hidden="true" />
        <span className="hud-corners" aria-hidden="true" />
        <span className="edge-spot" aria-hidden="true" />
        <div className="brf-deck-top">
          <span className="brf-live"><span className="brf-live-dot" aria-hidden="true" />Live</span>
          <span className="brf-deck-meta">{dateLine}</span>
        </div>
        <div className="brf-deck-main">
          <div>
            <h1 className="briefing-greeting">
              {getGreeting()}, {displayName}.
            </h1>
            <div className="brf-status">
              {attentionCount > 0 ? (
                <button
                  className="brf-status-item brf-attn-btn"
                  aria-expanded={attentionOpen}
                  onClick={() => setAttentionOpen((o) => !o)}
                >
                  <span className="brf-light" data-tone="err" aria-hidden="true" />
                  <span><strong>{attentionCount}</strong> {attentionCount === 1 ? 'item needs' : 'items need'} your attention</span>
                  <ChevronDown size={14} className={`brf-attn-chev ${attentionOpen ? 'brf-attn-chev--open' : ''}`} />
                </button>
              ) : (
                <span className="brf-status-item">
                  <span className="brf-light" data-tone="ok" aria-hidden="true" />
                  <span>All clear. Nothing overdue.</span>
                </span>
              )}
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
          </div>
          <LiveClock />
        </div>
        {attentionOpen && attentionCount > 0 && (
          <div className="brf-attn">
            {overdueInvoiceList.map((inv) => (
              <button key={`i-${inv.id}`} className="brf-attn-row" onClick={() => openInvoice(inv.id)}>
                <span className="brf-attn-kind">Invoice</span>
                <span className="brf-attn-title">{inv.client_name || `Invoice ${inv.num}`} · {formatCurrency(inv.amount)}</span>
                <RelativeTime date={inv.due_date} className="brf-row-meta brf-row-meta--err" />
                <ArrowRight size={13} className="brf-attn-go" />
              </button>
            ))}
            {overdueTasks.map((t) => (
              <button key={`t-${t.id}`} className="brf-attn-row" onClick={() => openTask(t.id)}>
                <span className="brf-attn-kind">Task</span>
                <span className="brf-attn-title">
                  {t.text}
                  {t.client_name && <span className="brf-attn-client"> · {t.client_name}</span>}
                </span>
                <RelativeTime date={t.due_date} className="brf-row-meta brf-row-meta--err" />
                <ArrowRight size={13} className="brf-attn-go" />
              </button>
            ))}
          </div>
        )}
      </header>

      <blockquote className="brf-quote rv" style={{ ['--i' as string]: 1 }}>
        <p>&ldquo;{dailyQuote.text}&rdquo;</p>
        <cite>{dailyQuote.author}</cite>
      </blockquote>

      {/* ---- THE SIGNAL: one thing that needs you ---- */}
      {oneThingCard && (
        <section
          className={`brf-signal rv ${oneThingCard.tone === 'err' ? 'one-thing-urgent' : ''}`}
          style={{ ['--i' as string]: 2 }}
          data-tone={oneThingCard.tone}
          aria-label="Needs your attention"
        >
          <span className="brf-signal-beam" aria-hidden="true" />
          <span className="beam" data-tone={oneThingCard.tone === 'err' ? 'err' : undefined} aria-hidden="true" />
          <div className="brf-signal-body">
            <p className="brf-signal-label">
              <span className="brf-light" data-tone={oneThingCard.tone} aria-hidden="true" />
              {oneThingCard.label}
            </p>
            <p className="brf-signal-title">
              {oneThingCard.clientId ? (
                <button className="brf-signal-link" onClick={() => openClient(oneThingCard.clientId)}>{oneThingCard.title}</button>
              ) : (
                oneThingCard.title
              )}
              {'amount' in oneThingCard && oneThingCard.amount && <span className="brf-signal-amount"> · {oneThingCard.amount}</span>}
            </p>
            <p className="brf-signal-detail">
              {oneThingCard.detail}
              {oneThingCard.detailDate && (
                <>{' '}<RelativeTime date={oneThingCard.detailDate} /></>
              )}
            </p>
          </div>
          <div className="brf-signal-actions">
            {oneThingCard.clientId && oneThingCard.target !== 'clients' && (
              <button className="btn-ghost brf-signal-btn" onClick={() => openClient(oneThingCard.clientId)}>
                View client
              </button>
            )}
            <button className="btn-primary brf-signal-btn" onClick={oneThingCard.open}>
              {oneThingCard.openLabel}
              <ArrowRight size={13} />
            </button>
          </div>
        </section>
      )}

      <PersonalCommand />

      {/* ---- TODAY'S FOCUS ---- */}
      <section className="brf-section rv" style={{ ['--i' as string]: 3 }}>
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
          <span className="edge-spot" aria-hidden="true" />
          {/* Due Today */}
          <div className="brf-col">
            <div className="brf-col-head">
              <span className="brf-col-label">
                <span className="brf-light" data-tone={tasksDueToday.length > 0 ? 'info' : 'off'} aria-hidden="true" />
                Due today
              </span>
              <CountUp className="brf-count" value={tasksDueToday.length} />
            </div>
            <ul className="brf-list">
              {tasksDueToday.length === 0 && <li className="brf-empty">Nothing due today.</li>}
              {tasksDueToday.slice(0, 4).map((t) => (
                <li key={t.id} className="brf-row brf-row--link" role="button" tabIndex={0} onClick={() => openTask(t.id)} onKeyDown={(e) => { if (e.key === 'Enter') openTask(t.id) }}>
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
              <CountUp className="brf-count" value={overdueTasks.length} />
            </div>
            <ul className="brf-list">
              {overdueTasks.length === 0 && <li className="brf-empty">All clear.</li>}
              {overdueTasks.slice(0, 4).map((t) => (
                <li key={t.id} className="brf-row brf-row--link" role="button" tabIndex={0} onClick={() => openTask(t.id)} onKeyDown={(e) => { if (e.key === 'Enter') openTask(t.id) }}>
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
              <CountUp className="brf-count" value={meetingsToday.length} />
            </div>
            <ul className="brf-list">
              {meetingsToday.length === 0 && <li className="brf-empty">No meetings scheduled.</li>}
              {meetingsToday.slice(0, 4).map((e) => (
                <li key={e.id} className="brf-row brf-row--link" role="button" tabIndex={0} onClick={() => setCurrentPage('calendar')} onKeyDown={(ev) => { if (ev.key === 'Enter') setCurrentPage('calendar') }}>
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
      <section className="brf-section rv" style={{ ['--i' as string]: 4 }}>
        <QuarterlyScorecard />
      </section>

      {/* ---- YESTERDAY'S WINS ---- */}
      {yesterdayWins.length > 0 && (
        <section className="brf-section rv" style={{ ['--i' as string]: 5 }}>
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
        <section className="brf-section rv" style={{ ['--i' as string]: 6 }}>
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
                <button className="brf-goal" key={g.id} onClick={() => setCurrentPage('goals')}>
                  <div className="brf-goal-title">{g.title}</div>
                  <div className="brf-goal-track">
                    <div className="brf-goal-fill" data-done={pct >= 100 || undefined} style={{ transform: `scaleX(${pct / 100})` }} />
                  </div>
                  <div className="brf-goal-meta">
                    <span className={pct >= 100 ? 'text-ok' : ''}>{pct}%</span>
                    {g.target_date && <span>{format(parseISO(g.target_date), 'MMM d')}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}


      {/* ---- CTA ---- */}
      <div className="brf-cta rv" style={{ ['--i' as string]: 8 }}>
        <button className="btn-primary brf-cta-btn" onClick={() => setCurrentPage('dashboard')}>
          Enter Command Center
          <span className="brf-cta-icon" aria-hidden="true"><ArrowRight size={13} /></span>
        </button>
      </div>
    </div>
  )
}
