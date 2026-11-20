import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, User, CalendarDays, Timer, Trash2, Plus, Settings2, X, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import type { TimeEntry, Invoice } from '@/lib/store'
import { timeEntries as timeApi, settings as settingsApi } from '@/lib/api'
import CountUp from '@/components/ui/CountUp'

/**
 * Time & profit. Every hour of client work lands here on its own:
 * Claude sessions (logged by Claude with an honest human-equivalent estimate),
 * client meetings from Google Calendar, and anything Omar adds by hand.
 * Revenue is invoice totals before GST. Value is human-equivalent hours at the
 * agency rate, so the gap shows where work is under or over billed.
 */

type Range = 'month' | 'last' | 'quarter' | 'year' | 'all'
const RANGES: { id: Range; label: string }[] = [
  { id: 'month', label: 'This month' }, { id: 'last', label: 'Last month' }, { id: 'quarter', label: '90 days' }, { id: 'year', label: 'This year' }, { id: 'all', label: 'All time' },
]
const SRC = {
  claude: { icon: Sparkles, label: 'Claude' },
  calendar: { icon: CalendarDays, label: 'Meeting' },
  manual: { icon: User, label: 'You' },
  timer: { icon: Timer, label: 'Timer' },
} as const

const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`
export const hrs = (m: number) => { const h = m / 60; return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h` }
const localDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(d)

function rangeBounds(r: Range): { from: string; to: string; months: number } {
  const t = localDay(); const [y, m] = t.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (r === 'month') return { from: `${y}-${pad(m)}-01`, to: t, months: Number(t.slice(8)) / new Date(y, m, 0).getDate() }
  if (r === 'last') { const ly = m === 1 ? y - 1 : y, lm = m === 1 ? 12 : m - 1; return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${pad(new Date(ly, lm, 0).getDate())}`, months: 1 } }
  if (r === 'quarter') { const d = new Date(Date.now() - 89 * 86400000); return { from: localDay(d), to: t, months: 3 } }
  if (r === 'year') return { from: `${y}-01-01`, to: t, months: m - 1 + Number(t.slice(8)) / new Date(y, m, 0).getDate() }
  return { from: '2000-01-01', to: t, months: 0 }
}
/** How a Claude number was arrived at, in plain words. */
export const TIMING = {
  measured: { short: 'Timed', long: 'Timed by the CRM while Claude worked' },
  estimate: { short: 'Estimate', long: 'Estimated by Claude in the chat, not timed' },
  reconstructed: { short: 'Corrected', long: 'Set by you' },
} as const
export function TimingBadge({ e }: { e: TimeEntry }) {
  if (e.source !== 'claude') return null
  const t = TIMING[(e.timing || 'estimate') as keyof typeof TIMING]
  return <span className={`tm-badge is-${e.timing || 'estimate'}`} title={t.long}>{t.short}</span>
}
const fmtSecs = (s: number) => s < 60 ? `${s} sec` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Edmonton' })

export const preTax = (i: Invoice) => { let tax = 5; try { tax = Number(JSON.parse(i.notes || '{}').tax_rate ?? 5) } catch { /* GST */ } return Number(i.amount || 0) / (1 + tax / 100) }

type Row = { id: string; name: string; you: number; claude: number; human: number; billed: number; paid: number }

export default function Profitability() {
  const { clients, timeEntries, invoices, settings, dataLoaded, refreshTimeEntries, refreshSettings, setCurrentPage } = useAppStore() as any
  const [range, setRange] = useState<Range>('month')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [edit, setEdit] = useState<TimeEntry | null>(null)
  const rate = Number(settings?.agency_hourly_rate) || 125
  const costs = Number(settings?.monthly_costs) || 0

  useEffect(() => { refreshTimeEntries?.() }, [refreshTimeEntries])

  const { from, to, months } = rangeBounds(range)
  const inRange = (iso?: string | null) => { if (!iso) return false; const d = localDay(new Date(iso)); return d >= from && d <= to }
  const inRangeDay = (d?: string | null) => !!d && d >= from && d <= to

  const entries: TimeEntry[] = useMemo(() => (timeEntries as TimeEntry[]).filter(e => e.duration_minutes && inRange(e.started_at)), [timeEntries, from, to])

  const { rows, tot } = useMemo(() => {
    const map = new Map<string, Row>()
    const name = new Map((clients as any[]).map(c => [c.id, c.name]))
    const row = (id: string | null) => { const k = id || 'none'; if (!map.has(k)) map.set(k, { id: k, name: name.get(k) || 'No client', you: 0, claude: 0, human: 0, billed: 0, paid: 0 }); return map.get(k)! }
    for (const e of entries) {
      const r = row(e.client_id), m = e.duration_minutes || 0
      if (e.source === 'claude') { r.claude += m; r.human += e.human_minutes || m } else { r.you += m; r.human += m }
    }
    for (const i of invoices as Invoice[]) {
      if (i.status !== 'draft' && inRangeDay(i.sent_date)) row(i.client_id).billed += preTax(i)
      if (i.status === 'paid' && inRange(i.paid_at)) row(i.client_id).paid += preTax(i)
    }
    const rows = [...map.values()].filter(r => r.you + r.claude + r.billed + r.paid > 0).sort((a, b) => (b.billed - a.billed) || (b.human - a.human))
    const tot = rows.reduce((s, r) => ({ you: s.you + r.you, claude: s.claude + r.claude, human: s.human + r.human, billed: s.billed + r.billed, paid: s.paid + r.paid }), { you: 0, claude: 0, human: 0, billed: 0, paid: 0 })
    return { rows, tot }
  }, [entries, invoices, clients, from, to])

  const workMin = tot.you + tot.claude
  const perHour = workMin ? tot.billed / (workMin / 60) : 0
  const leverage = workMin ? tot.human / workMin : 0
  const costInRange = range === 'all' ? 0 : costs * months
  const profit = tot.paid - costInRange
  const value = (tot.human / 60) * rate
  const maxMin = Math.max(1, ...rows.map(r => Math.max(r.human, r.you + r.claude)))
  const recent = entries.slice().sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 40)

  const remove = async (id: string) => { await timeApi.remove(id); refreshTimeEntries?.() }

  return (
    <div className="tp">
      <header className="tp-top">
        <div>
          <p className="hm-date">Time &amp; profit</p>
          <h1 className="tp-title">Where the hours and money go</h1>
          <p className="tp-lede">Claude work, client meetings and your own time, tracked against what each client is billed.</p>
        </div>
        <div className="tp-tools">
          <div className="hm-seg" role="tablist">{RANGES.map(r => <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'is-on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>)}</div>
          <button className="tp-btn" onClick={() => setEditing(true)} aria-label="Rates and costs"><Settings2 size={15} /></button>
          <button className="tp-btn is-primary" onClick={() => setAdding(true)}><Plus size={15} /> Log time</button>
        </div>
      </header>

      <section className="tp-kpis">
        <div className="tp-kpi"><p className="hm-k">Billed</p><p className="tp-n"><CountUp value={Math.round(tot.billed)} format={money} /></p><p className="tp-s">{money(tot.paid)} collected · before GST</p></div>
        <div className="tp-kpi"><p className="hm-k">Profit</p><p className="tp-n"><CountUp value={Math.round(profit)} format={money} /></p><p className="tp-s">{costInRange ? `after ${money(costInRange)} in costs` : costs ? 'all time, before costs' : 'set your monthly costs'}</p></div>
        <div className="tp-kpi"><p className="hm-k">Per hour worked</p><p className="tp-n">{workMin ? <CountUp value={Math.round(perHour)} format={money} /> : '—'}</p><p className="tp-s">billed ÷ {hrs(workMin)} of your and Claude's time</p></div>
        <div className="tp-kpi"><p className="hm-k">Leverage</p><p className="tp-n">{leverage ? `${leverage.toFixed(1)}×` : '—'}</p><p className="tp-s">{hrs(tot.human)} of agency work in {hrs(workMin)}</p></div>
      </section>

      <section className="hm-card tp-card">
        <div className="hm-head"><h2>Time</h2><p className="tp-legend"><span className="is-you">You</span><span className="is-claude">Claude</span><span className="is-human">By hand</span></p></div>
        <div className="tp-split">
          <div><p className="tp-big">{hrs(tot.you)}</p><p className="tp-s">your time (meetings, calls, edits)</p></div>
          <div><p className="tp-big">{hrs(tot.claude)}</p><p className="tp-s">with Claude</p></div>
          <div><p className="tp-big">{hrs(tot.human)}</p><p className="tp-s">it would take by hand</p></div>
          <div><p className="tp-big">{money(value)}</p><p className="tp-s">value at {money(rate)}/h</p></div>
        </div>
      </section>

      <section className="hm-card tp-card">
        <div className="hm-head"><h2>By client</h2><span className="tp-s">Gap = billed minus the value of the work at {money(rate)}/h</span></div>
        {!dataLoaded ? <p className="hm-empty">Loading…</p> : rows.length === 0 ? (
          <p className="hm-empty">No time or invoices in this range yet. Claude logs its work as it goes, and client meetings come in from your calendar three times a day.</p>
        ) : (
          <div className="tp-table" role="table">
            <div className="tp-tr tp-th" role="row"><span>Client</span><span>Time</span><span>Billed</span><span>Value</span><span>Gap</span><span>Per hour</span></div>
            {rows.map(r => {
              const val = (r.human / 60) * rate, gap = r.billed - val, worked = r.you + r.claude
              return (
                <div key={r.id} className="tp-tr" role="row">
                  <span className="tp-name">{r.name}</span>
                  <span className="tp-bars" title={`You ${hrs(r.you)} · Claude ${hrs(r.claude)} · by hand ${hrs(r.human)}`}>
                    <i className="tp-bar is-human" style={{ width: `${(r.human / maxMin) * 100}%` }} />
                    <i className="tp-bar-row"><b className="is-you" style={{ width: `${(r.you / maxMin) * 100}%` }} /><b className="is-claude" style={{ width: `${(r.claude / maxMin) * 100}%` }} /></i>
                    <em>{worked ? hrs(worked) : '0h'}{r.human > worked ? ` → ${hrs(r.human)}` : ''}</em>
                  </span>
                  <span className="tp-num">{money(r.billed)}</span>
                  <span className="tp-num tp-dim">{r.human ? money(val) : '—'}</span>
                  <span className={`tp-num tp-gap ${!r.human ? '' : gap >= 0 ? 'is-up' : 'is-down'}`}>{r.human ? <>{gap >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{money(Math.abs(gap))}</> : '—'}</span>
                  <span className="tp-num">{worked && r.billed ? money(r.billed / (worked / 60)) : '—'}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="hm-card tp-card">
        <div className="hm-head"><h2>Log</h2><button className="hm-link" onClick={() => setCurrentPage('clients')}>Clients</button></div>
        {recent.length === 0 ? <p className="hm-empty">Nothing logged in this range.</p> : (
          <ul className="tp-log">
            {recent.map(e => {
              const s = SRC[(e.source || 'manual') as keyof typeof SRC] || SRC.manual
              return (
                <li key={e.id} className="tp-log-row" onClick={() => setEdit(e)}>
                  <span className={`tp-src is-${e.source || 'manual'}`} title={s.label}><s.icon size={13} /></span>
                  <span className="tp-log-main"><span className="tp-log-t">{e.description || e.notes || s.label}</span><span className="tp-log-m">{e.client_name || 'No client'} · {new Date(e.started_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Edmonton' })}{e.work_type ? ` · ${e.work_type}` : ''}</span></span>
                  <span className="tp-log-d"><TimingBadge e={e} />{hrs(e.duration_minutes || 0)}{e.source === 'claude' && e.human_minutes ? <em> → {hrs(e.human_minutes)}</em> : null}</span>
                  <button className="tp-del" onClick={ev => { ev.stopPropagation(); remove(e.id) }} aria-label="Delete entry"><Trash2 size={13} /></button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editing && <SettingsSheet rate={rate} costs={costs} onClose={() => setEditing(false)} onSaved={() => refreshSettings?.()} />}
      {edit && <EntrySheet entry={edit} clients={clients} rate={rate} onClose={() => setEdit(null)} onSaved={() => refreshTimeEntries?.()} />}
      {adding && <AddSheet clients={clients} onClose={() => setAdding(false)} onSaved={() => refreshTimeEntries?.()} />}
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return createPortal(
    <div className="tp tp-layer"><button className="tp-backdrop" aria-label="Close" onClick={onClose} />
      <div className="tp-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="hm-head"><h2>{title}</h2><button className="tp-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function SettingsSheet({ rate, costs, onClose, onSaved }: { rate: number; costs: number; onClose: () => void; onSaved: () => void }) {
  const [r, setR] = useState(String(rate)); const [c, setC] = useState(String(costs)); const [busy, setBusy] = useState(false)
  const save = async () => { setBusy(true); await settingsApi.set('agency_hourly_rate', String(Math.max(0, Number(r) || 0))); await settingsApi.set('monthly_costs', String(Math.max(0, Number(c) || 0))); onSaved(); setBusy(false); onClose() }
  return (
    <Sheet title="Rates and costs" onClose={onClose}>
      <label className="tp-f"><span>Agency hourly rate</span><input inputMode="decimal" value={r} onChange={e => setR(e.target.value)} /><em>What a client would pay for an hour of work done by hand. Used to value Claude work.</em></label>
      <label className="tp-f"><span>Monthly business costs</span><input inputMode="decimal" value={c} onChange={e => setC(e.target.value)} /><em>Software, subscriptions, contractors, office. Taken off collected revenue for profit.</em></label>
      <button className="tp-btn is-primary tp-wide" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </Sheet>
  )
}

function AddSheet({ clients, onClose, onSaved }: { clients: any[]; onClose: () => void; onSaved: () => void }) {
  const list = clients.filter(c => c.status !== 'archived').sort((a, b) => a.name.localeCompare(b.name))
  const [client, setClient] = useState(''); const [date, setDate] = useState(localDay()); const [h, setH] = useState('1'); const [desc, setDesc] = useState(''); const [type, setType] = useState('meeting')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const save = async () => {
    const minutes = Math.round((Number(h) || 0) * 60)
    if (!client) return setErr('Pick a client.')
    if (minutes < 1 || minutes > 1440) return setErr('Hours must be between 0.1 and 24.')
    if (!desc.trim()) return setErr('Say what the time was for.')
    setBusy(true)
    try { await timeApi.addManual({ client_id: client, date, minutes, description: desc.trim(), work_type: type }); onSaved(); onClose() } catch (e: any) { setErr(e.message || 'Could not save.') } finally { setBusy(false) }
  }
  return (
    <Sheet title="Log your time" onClose={onClose}>
      <label className="tp-f"><span>Client</span><select value={client} onChange={e => setClient(e.target.value)}><option value="">Choose a client</option>{list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="tp-row2">
        <label className="tp-f"><span>Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="tp-f"><span>Hours</span><input inputMode="decimal" value={h} onChange={e => setH(e.target.value)} /></label>
      </div>
      <label className="tp-f"><span>What for</span><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Site walkthrough with Frank" /></label>
      <label className="tp-f"><span>Type</span><select value={type} onChange={e => setType(e.target.value)}>{['meeting', 'video', 'design', 'development', 'copywriting', 'strategy', 'ads', 'email', 'admin', 'other'].map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</select></label>
      {err && <p className="tp-err">{err}</p>}
      <button className="tp-btn is-primary tp-wide" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Log time'}</button>
      <p className="tp-hint">Client meetings in your Google Calendar are added on their own. You can also just tell Claude "I spent two hours with Emma today".</p>
    </Sheet>
  )
}

export function EditSheet({ entry, clients, onClose, onSaved }: { entry: TimeEntry; clients: any[]; onClose: () => void; onSaved: () => void }) {
  const isClaude = entry.source === 'claude'
  const list = clients.filter(c => c.status !== 'archived').sort((a, b) => a.name.localeCompare(b.name))
  const [client, setClient] = useState(entry.client_id || '')
  const [mins, setMins] = useState(String(entry.duration_minutes || ''))
  const [human, setHuman] = useState(String(Math.round(((entry.human_minutes || 0) / 60) * 10) / 10))
  const [desc, setDesc] = useState(entry.description || entry.notes || '')
  const [date, setDate] = useState(localDay(new Date(entry.started_at)))
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const save = async () => {
    const m = Math.round(Number(mins) || 0), h = Math.round((Number(human) || 0) * 60)
    if (!client) return setErr('Pick a client.')
    if (m < 1 || m > 1440) return setErr('Minutes must be between 1 and 1440.')
    if (isClaude && h < 1) return setErr('Add the by-hand hours.')
    if (!desc.trim()) return setErr('Say what the time was for.')
    const start = new Date(`${date}${entry.started_at.slice(10)}`)
    setBusy(true)
    try {
      await timeApi.update(entry.id, {
        client_id: client, ...(client !== entry.client_id ? { project_id: null } : {}), duration_minutes: m, human_minutes: isClaude ? h : m,
        ...(isClaude && m !== entry.duration_minutes ? { timing: 'reconstructed' } : {}),
        description: desc.trim(), notes: desc.trim(), started_at: start.toISOString(), ended_at: new Date(start.getTime() + m * 60000).toISOString(),
      })
      onSaved(); onClose()
    } catch (e: any) { setErr(e.message || 'Could not save.') } finally { setBusy(false) }
  }
  return (
    <Sheet title="Edit time" onClose={onClose}>
      <label className="tp-f"><span>Client</span><select value={client} onChange={e => setClient(e.target.value)}><option value="">Choose a client</option>{list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="tp-row2">
        <label className="tp-f"><span>{isClaude ? 'Claude minutes' : 'Minutes'}</span><input inputMode="numeric" value={mins} onChange={e => setMins(e.target.value)} /></label>
        {isClaude
          ? <label className="tp-f"><span>By hand (hours)</span><input inputMode="decimal" value={human} onChange={e => setHuman(e.target.value)} /></label>
          : <label className="tp-f"><span>Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>}
      </div>
      {isClaude && <label className="tp-f"><span>Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>}
      <label className="tp-f"><span>What for</span><input value={desc} onChange={e => setDesc(e.target.value)} /></label>
      {err && <p className="tp-err">{err}</p>}
      <button className="tp-btn is-primary tp-wide" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </Sheet>
  )
}

/** One entry, read in full, with edit and delete. */
export function EntrySheet({ entry, clients, rate, onClose, onSaved }: { entry: TimeEntry; clients: any[]; rate: number; onClose: () => void; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  if (editing) return <EditSheet entry={entry} clients={clients} onClose={onClose} onSaved={onSaved} />
  const src = SRC[(entry.source || 'manual') as keyof typeof SRC] || SRC.manual
  const isC = entry.source === 'claude'
  const m = entry.duration_minutes || 0, h = isC ? entry.human_minutes || m : m
  const client = clients.find(c => c.id === entry.client_id)?.name || entry.client_name || 'No client'
  const when = new Date(entry.started_at)
  const text = entry.description || entry.notes || ''
  const del = async () => { await timeApi.remove(entry.id); onSaved(); onClose() }
  return (
    <Sheet title={src.label === 'Claude' ? 'Claude work' : src.label === 'Meeting' ? 'Meeting' : 'Your time'} onClose={onClose}>
      <div className="te-head">
        <span className={`tp-src is-${entry.source || 'manual'}`}><src.icon size={14} /></span>
        <div><p className="te-client">{client}</p><p className="te-when">{when.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' })}{entry.source === 'calendar' ? ` · ${when.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Edmonton' })}` : ''}</p></div>
      </div>
      <p className="te-text">{text || 'No notes.'}</p>
      {isC && (
        <div className={`te-timing is-${entry.timing || 'estimate'}`}>
          <p className="te-timing-h"><TimingBadge e={entry} /><span>{TIMING[(entry.timing || 'estimate') as keyof typeof TIMING].long}</span></p>
          {entry.timing === 'measured' && entry.segments?.length ? (
            <ol className="te-rounds">
              {entry.segments.map((g, i) => (
                <li key={i}>
                  <span className="te-r-n">Round {i + 1}</span>
                  <span className="te-r-when">{new Date(g.start).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Edmonton' })} · {clock(g.start)} to {clock(g.end)}</span>
                  <b>{fmtSecs(g.seconds)}</b>
                  {g.note && <span className="te-r-note">{g.note}</span>}
                </li>
              ))}
            </ol>
          ) : entry.timing === 'estimate' ? <p className="te-timing-p">This number came from Claude's guess, logged before timing existed. If you know how long it really took, tap Edit and set it.</p> : null}
        </div>
      )}
      {isC && entry.estimate?.lines?.length ? (
        <div className="te-timing">
          <p className="te-timing-h">By hand, line by line</p>
          <ol className="te-rounds">
            {entry.estimate.lines.map((l, i) => (
              <li key={i}>
                <span className="te-r-n">{l.qty} × {l.each}h</span>
                <span className="te-r-when">{l.label}</span>
                <b>{l.hours}h</b>
                {l.note && <span className="te-r-note">{l.note}</span>}
              </li>
            ))}
          </ol>
          {entry.estimate.revised && <p className="te-timing-p">Revised from {entry.estimate.revised.previous_hours}h: {entry.estimate.revised.reason}</p>}
        </div>
      ) : null}
      <dl className="te-grid">
        <div><dt>{isC ? 'Claude time' : 'Time'}</dt><dd>{hrs(m)}</dd></div>
        {isC && <div><dt>By hand</dt><dd>{hrs(h)}</dd></div>}
        {isC && <div><dt>Leverage</dt><dd>{m ? `${(h / m).toFixed(1)}×` : '—'}</dd></div>}
        <div><dt>Work value</dt><dd>{money((h / 60) * rate)}</dd></div>
        {entry.project_title && <div><dt>Project</dt><dd>{entry.project_title}</dd></div>}
        {entry.work_type && <div><dt>Type</dt><dd className="te-cap">{entry.work_type}</dd></div>}
        <div><dt>Billable</dt><dd>{entry.billable === false || (entry.billable as any) === 0 ? 'No' : 'Yes'}</dd></div>
      </dl>
      <div className="te-actions">
        {confirm
          ? <><button className="tp-btn" onClick={() => setConfirm(false)}>Keep it</button><button className="tp-btn is-danger" onClick={del}>Delete entry</button></>
          : <><button className="tp-btn" onClick={() => setConfirm(true)}><Trash2 size={14} /> Delete</button><button className="tp-btn is-primary" onClick={() => setEditing(true)}>Edit</button></>}
      </div>
    </Sheet>
  )
}
