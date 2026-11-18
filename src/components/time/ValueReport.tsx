import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import type { TimeEntry, Invoice } from '@/lib/store'
import { preTax, hrs } from '@/pages/Profitability'

type Range = 'all' | 'month' | 'quarter' | 'year'
const TZ = 'America/Edmonton'
const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`
const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
const TYPE_LABEL: Record<string, string> = { design: 'Design', development: 'Development', copywriting: 'Copywriting', strategy: 'Strategy', ads: 'Advertising', email: 'Email', admin: 'Admin', meeting: 'Meetings', video: 'Photo and video', other: 'Other' }

/**
 * A one-page value report for a client. Internal view shows everything (your
 * time, Claude time, earnings per hour). Client view shows only what the client
 * received: the work, the hours it represents and its value at the agency rate.
 */
export default function ValueReport({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { timeEntries, invoices, clients, settings } = useAppStore() as any
  const [range, setRange] = useState<Range>('all')
  const [view, setView] = useState<'internal' | 'client'>('internal')
  const rate = Number(settings?.agency_hourly_rate) || 125
  const client = (clients as any[]).find(c => c.id === clientId)

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); document.body.classList.add('vr-open')
    return () => { window.removeEventListener('keydown', k); document.body.classList.remove('vr-open') }
  }, [onClose])

  const t = day(new Date())
  const from = range === 'all' ? '2000-01-01' : range === 'month' ? `${t.slice(0, 7)}-01` : range === 'year' ? `${t.slice(0, 4)}-01-01` : day(new Date(Date.now() - 89 * 86400000))
  const inR = (iso?: string | null) => !!iso && day(new Date(iso)) >= from

  const d = useMemo(() => {
    const es: TimeEntry[] = (timeEntries as TimeEntry[]).filter(e => e.client_id === clientId && e.duration_minutes && inR(e.started_at)).sort((a, b) => a.started_at.localeCompare(b.started_at))
    let claude = 0, you = 0, human = 0, est = 0
    const types = new Map<string, number>()
    for (const e of es) {
      const m = e.duration_minutes || 0
      const h = e.source === 'claude' ? e.human_minutes || m : m
      if (e.source === 'claude') { claude += m; if (e.timing === 'estimate') est += m } else you += m
      human += h
      const k = e.work_type || (e.source === 'calendar' ? 'meeting' : 'other')
      types.set(k, (types.get(k) || 0) + h)
    }
    const billed = (invoices as Invoice[]).filter(i => i.client_id === clientId && i.status !== 'draft' && i.sent_date && i.sent_date >= from).reduce((s, i) => s + preTax(i), 0)
    const first = es[0]?.started_at, last = es[es.length - 1]?.started_at
    return { es, claude, you, human, est, billed, types: [...types.entries()].sort((a, b) => b[1] - a[1]), first, last }
  }, [timeEntries, invoices, clientId, from])

  const worked = d.claude + d.you
  const value = (d.human / 60) * rate
  const speed = worked ? d.human / worked : 0
  const perHour = worked ? d.billed / (worked / 60) : 0
  const saved = value - d.billed
  const maxType = Math.max(1, ...d.types.map(x => x[1]))
  const fmtD = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ }) : ''
  const span = d.first ? (fmtD(d.first) === fmtD(d.last) ? fmtD(d.first) : `${fmtD(d.first)} to ${fmtD(d.last)}`) : 'No work logged yet'

  return createPortal(
    <div className="tp vr-layer">
      <div className="vr-bar no-print">
        <div className="hm-seg">{(['all', 'year', 'quarter', 'month'] as Range[]).map(r => <button key={r} className={range === r ? 'is-on' : ''} onClick={() => setRange(r)}>{r === 'all' ? 'All time' : r === 'year' ? 'This year' : r === 'quarter' ? '90 days' : 'This month'}</button>)}</div>
        <div className="hm-seg">{(['internal', 'client'] as const).map(v => <button key={v} className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>{v === 'internal' ? 'Internal' : 'Client view'}</button>)}</div>
        <span className="vr-grow" />
        <button className="tp-btn" onClick={() => window.print()}><Printer size={14} /><span className="vr-pdf-t">Save as PDF</span></button>
        <button className="tp-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      <article className="vr-page">
        <header className="vr-head">
          <p className="vr-brand">Grow The Hype</p>
          <p className="vr-kicker">{view === 'client' ? 'Work and value report' : 'Time and value report · internal'}</p>
          <h1>{client?.name || 'Client'}</h1>
          <p className="vr-span">{span}</p>
        </header>

        <section className="vr-hero">
          <div><p className="vr-k">Agency work delivered</p><p className="vr-n">{hrs(d.human)}</p><p className="vr-s">what this work takes a skilled team by hand</p></div>
          <div><p className="vr-k">Value at {money(rate)}/h</p><p className="vr-n">{money(value)}</p><p className="vr-s">standard agency rate</p></div>
          {view === 'client'
            ? <div><p className="vr-k">Invoiced</p><p className="vr-n">{money(d.billed)}</p><p className="vr-s">{saved > 0 ? `${money(saved)} less than the work is worth` : 'before GST'}</p></div>
            : <div><p className="vr-k">Time it actually took</p><p className="vr-n">{hrs(worked)}</p><p className="vr-s">{speed ? `${speed.toFixed(1)}× faster than by hand` : 'nothing logged'}</p></div>}
        </section>

        {view === 'internal' && (
          <section className="vr-split">
            <div className="vr-cell"><p className="vr-k">Claude time</p><p className="vr-m">{hrs(d.claude)}</p><p className="vr-s">{d.claude ? (d.est ? `${hrs(d.claude - d.est)} timed · ${hrs(d.est)} estimated` : 'all timed') : '—'}</p></div>
            <div className="vr-cell"><p className="vr-k">Your time</p><p className="vr-m">{hrs(d.you)}</p><p className="vr-s">meetings, calls and your own work</p></div>
            <div className="vr-cell"><p className="vr-k">Invoiced</p><p className="vr-m">{money(d.billed)}</p><p className="vr-s">before GST</p></div>
            <div className="vr-cell"><p className="vr-k">Earned per hour</p><p className="vr-m">{worked && d.billed ? money(perHour) : '—'}</p><p className="vr-s">invoiced ÷ your time and Claude time</p></div>
          </section>
        )}

        {d.human > 0 && (
          <section className="vr-compare">
            <p className="vr-h">By hand versus how we work</p>
            <div className="vr-row"><span>By hand</span><i style={{ width: '100%' }} className="is-human" /><b>{hrs(d.human)}</b></div>
            <div className="vr-row"><span>{view === 'client' ? 'Our time' : 'You and Claude'}</span><i style={{ width: `${Math.max(1.5, (worked / d.human) * 100)}%` }} className="is-claude" /><b>{hrs(worked)}</b></div>
          </section>
        )}

        {d.types.length > 0 && (
          <section>
            <p className="vr-h">Where the work went</p>
            <div className="vr-types">
              {d.types.map(([k, m]) => (
                <div key={k} className="vr-row"><span>{TYPE_LABEL[k] || k}</span><i style={{ width: `${(m / maxType) * 100}%` }} className="is-human" /><b>{hrs(m)}</b></div>
              ))}
            </div>
          </section>
        )}

        <section>
          <p className="vr-h">What was done</p>
          <ol className="vr-log">
            {d.es.map(e => {
              const h = e.source === 'claude' ? e.human_minutes || e.duration_minutes || 0 : e.duration_minutes || 0
              return (
                <li key={e.id}>
                  <span className="vr-date">{new Date(e.started_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: TZ })}</span>
                  <span className="vr-desc">{e.description || e.notes}</span>
                  <span className="vr-hrs">
                    {hrs(h)}{view === 'internal' && e.source === 'claude' && <em>{hrs(e.duration_minutes || 0)} Claude{e.timing === 'estimate' ? ' (est.)' : ''}</em>}
                    {view === 'internal' && e.source !== 'claude' && <em>{e.source === 'calendar' ? 'meeting' : 'your time'}</em>}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        <footer className="vr-foot">
          {view === 'client'
            ? `Hours show what each piece of work takes a skilled agency team by hand. Value uses a standard rate of ${money(rate)} an hour.`
            : `By-hand hours are estimates of what a skilled agency team would need. Claude time marked "est." was logged before timing existed. Rate ${money(rate)}/h, set on Time & profit.`}
        </footer>
      </article>
    </div>,
    document.body,
  )
}
