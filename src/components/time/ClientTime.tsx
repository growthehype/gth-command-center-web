import { useMemo, useState } from 'react'
import { Sparkles, User, CalendarDays, Timer, ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import type { TimeEntry, Invoice } from '@/lib/store'
import { EditSheet, preTax, hrs } from '@/pages/Profitability'

const SRC = {
  claude: { icon: Sparkles, label: 'Claude' },
  calendar: { icon: CalendarDays, label: 'Meeting' },
  manual: { icon: User, label: 'You' },
  timer: { icon: Timer, label: 'Timer' },
} as const
type Filter = 'all' | 'claude' | 'you'
const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`
const TZ = 'America/Edmonton'

/** A client's time at a glance: Claude time against the by-hand equivalent, your own time, and what was billed. */
export default function ClientTime({ clientId }: { clientId: string }) {
  const { timeEntries, invoices, clients, settings, refreshTimeEntries, setCurrentPage } = useAppStore() as any
  const [filter, setFilter] = useState<Filter>('all')
  const [edit, setEdit] = useState<TimeEntry | null>(null)
  const rate = Number(settings?.agency_hourly_rate) || 125

  const all: TimeEntry[] = useMemo(() => (timeEntries as TimeEntry[]).filter(e => e.client_id === clientId && e.duration_minutes).sort((a, b) => b.started_at.localeCompare(a.started_at)), [timeEntries, clientId])
  const t = useMemo(() => {
    let claude = 0, human = 0, you = 0
    for (const e of all) { const m = e.duration_minutes || 0; if (e.source === 'claude') { claude += m; human += e.human_minutes || m } else you += m }
    const billed = (invoices as Invoice[]).filter(i => i.client_id === clientId && i.status !== 'draft').reduce((s, i) => s + preTax(i), 0)
    return { claude, human, you, billed }
  }, [all, invoices, clientId])

  const shown = all.filter(e => filter === 'all' || (filter === 'claude' ? e.source === 'claude' : e.source !== 'claude'))
  const groups = useMemo(() => {
    const g = new Map<string, TimeEntry[]>()
    for (const e of shown) { const k = new Date(e.started_at).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: TZ }); g.set(k, [...(g.get(k) || []), e]) }
    return [...g.entries()]
  }, [shown])
  const maxH = Math.max(1, ...all.map(e => Math.max(e.human_minutes || 0, e.duration_minutes || 0)))

  const value = ((t.human + t.you) / 60) * rate
  const gap = t.billed - value
  const worked = t.claude + t.you
  const leverage = worked ? (t.human + t.you) / worked : 0

  if (!all.length) return <div className="tp ct"><p className="ct-empty">No time logged for this client yet. Claude logs its work here as it goes, and meetings come in from your calendar.</p></div>

  return (
    <div className="tp ct">
      <div className="ct-sum">
        <div className="ct-stat"><span className="ct-k"><Sparkles size={12} /> Claude</span><b>{hrs(t.claude)}</b></div>
        <div className="ct-stat"><span className="ct-k">By hand</span><b>{hrs(t.human)}</b></div>
        <div className="ct-stat"><span className="ct-k"><User size={12} /> Your time</span><b>{hrs(t.you)}</b></div>
        <div className="ct-stat"><span className="ct-k">Leverage</span><b>{leverage ? `${leverage.toFixed(1)}×` : '—'}</b></div>
        <div className="ct-stat"><span className="ct-k">Billed</span><b>{money(t.billed)}</b></div>
        <div className="ct-stat"><span className="ct-k">Work value</span><b>{money(value)}</b><em className={gap >= 0 ? 'is-up' : 'is-down'}>{gap >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{money(Math.abs(gap))} {gap >= 0 ? 'over' : 'under'}</em></div>
      </div>

      <div className="ct-bar" aria-hidden="true">
        <i className="is-you" style={{ width: `${(t.you / Math.max(1, t.human + t.you)) * 100}%` }} />
        <i className="is-claude" style={{ width: `${(t.claude / Math.max(1, t.human + t.you)) * 100}%` }} />
      </div>
      <p className="ct-note">Work value is the by-hand hours plus your time at {money(rate)}/h. Change the rate on <button onClick={() => setCurrentPage('profitability')}>Time &amp; profit</button>.</p>

      <div className="ct-bar-h">
        <div className="hm-seg" role="tablist">
          {(['all', 'claude', 'you'] as Filter[]).map(f => <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'is-on' : ''} onClick={() => setFilter(f)}>{f === 'all' ? `All ${all.length}` : f === 'claude' ? 'Claude' : 'You and meetings'}</button>)}
        </div>
        <p className="tp-legend"><span className="is-claude">Claude</span><span className="is-human">By hand</span><span className="is-you">You</span></p>
      </div>

      {groups.map(([month, list]) => (
        <section key={month} className="ct-group">
          <h4>{month}<span>{hrs(list.reduce((s, e) => s + (e.duration_minutes || 0), 0))}{list.some(e => e.source === 'claude') ? ` · ${hrs(list.reduce((s, e) => s + (e.source === 'claude' ? e.human_minutes || 0 : e.duration_minutes || 0), 0))} by hand` : ''}</span></h4>
          <ul>
            {list.map(e => {
              const s = SRC[(e.source || 'manual') as keyof typeof SRC] || SRC.manual
              const isC = e.source === 'claude'
              return (
                <li key={e.id}>
                  <button className="ct-row" onClick={() => setEdit(e)}>
                    <span className={`tp-src is-${e.source || 'manual'}`} title={s.label}><s.icon size={13} /></span>
                    <span className="ct-main">
                      <span className="ct-t">{e.description || e.notes || s.label}</span>
                      <span className="ct-m">{new Date(e.started_at).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })}{e.project_title ? ` · ${e.project_title}` : ''}{e.billable === false || (e.billable as any) === 0 ? ' · not billable' : ''}</span>
                      <span className="ct-mini" aria-hidden="true">
                        {isC && <i className="is-human" style={{ width: `${((e.human_minutes || 0) / maxH) * 100}%` }} />}
                        <i className={isC ? 'is-claude' : 'is-you'} style={{ width: `${Math.max(1.5, ((e.duration_minutes || 0) / maxH) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="ct-nums">
                      <b>{hrs(e.duration_minutes || 0)}</b>
                      <em>{isC ? `${hrs(e.human_minutes || 0)} by hand` : s.label}</em>
                    </span>
                    <ChevronRight size={14} className="ct-go" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {edit && <EditSheet entry={edit} clients={clients} onClose={() => setEdit(null)} onSaved={() => refreshTimeEntries?.()} />}
    </div>
  )
}
