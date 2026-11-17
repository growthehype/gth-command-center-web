import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, CornerDownLeft, Mail, Receipt, Server, CalendarDays, Sparkles, AlertCircle, Send, Building2, Bot, CircleDollarSign } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { tasks as tasksApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import { isGoogleConnected, fetchGoogleEvents } from '@/lib/google-calendar'

// ── dates (browser local time) ──
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d) }
const diff = (a: string, b: string) => Math.round((new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86400000)
const dayName = (s: string, len: 'short' | 'long' = 'short') => new Date(s + 'T12:00:00').toLocaleDateString('en-CA', { weekday: len })
const nice = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
const when = (s: string, today: string) => { const n = diff(s, today); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n < 0 ? `${-n} days late` : n < 7 ? dayName(s, 'long') : nice(s) }
const money = (n: number, cents = false) => '$' + (cents ? n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString('en-CA'))
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago` }

// ── quick capture: "Send Tarin the BC page friday !" ──
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
function parseCapture(raw: string, today: string, clients: { id: string; name: string }[]) {
  let text = ' ' + raw.trim() + ' '
  let due: string | null = null
  let priority = 'medium'
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => string | null) => { const m = text.match(re); if (m) { const d = fn(m); if (d) { due = d; text = text.replace(m[0], ' ') } } }
  if (/\s!+\s/.test(text)) { priority = 'high'; text = text.replace(/\s!+\s/, ' ') }
  take(/\s(today|tonight)\s/i, () => today)
  take(/\s(tomorrow|tmrw)\s/i, () => addDays(today, 1))
  take(/\snext week\s/i, () => addDays(today, 7))
  take(/\sin (\d{1,2}) days?\s/i, m => addDays(today, Number(m[1])))
  take(/\s(?:on |by |this )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\s/i, m => {
    const i = WEEKDAYS.findIndex(w => w.startsWith(m[1].toLowerCase().slice(0, 3)))
    const cur = new Date(today + 'T12:00:00').getDay()
    return addDays(today, ((i - cur + 7) % 7) || 7)
  })
  take(/\s(?:on |by )?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* (\d{1,2})\s/i, m => {
    const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase().slice(0, 3))
    let y = Number(today.slice(0, 4)); const cand = `${y}-${pad(mi + 1)}-${pad(Number(m[2]))}`
    return cand < today ? `${y + 1}-${pad(mi + 1)}-${pad(Number(m[2]))}` : cand
  })
  const low = text.toLowerCase()
  const client = clients.find(c => low.includes(c.name.toLowerCase()))
    || clients.find(c => { const w = c.name.split(/[^A-Za-z&]+/).find(x => x.length >= 4 && !/^(the|and|group|centre|center|company|consulting|management|property|services)$/i.test(x)); return !!w && new RegExp(`\\b${w.replace(/[^A-Za-z&]/g, '')}\\b`, 'i').test(text) })
  return { text: text.replace(/\s+/g, ' ').trim(), due, priority, client: client || null }
}

type Plan = { id: string; client_id: string; cadence: 'monthly' | 'yearly'; amount: number; tax_rate: number; next_date: string; notice_days: number; verified: boolean; status: string }
type Need = { key: string; tone: 'err' | 'warn' | 'info'; icon: any; kind: string; title: string; meta: string; action?: { label: string; run: () => void }; open: () => void }

export default function Home() {
  const { clients, tasks, projects, invoices, events, activity, leads, settings, setCurrentPage, setSelectedTaskId, setSelectedInvoiceId, setClientWindowId, refreshTasks, refreshActivity, dataLoaded } = useAppStore()
  const today = ymd(new Date())
  const [plans, setPlans] = useState<Plan[]>([])
  const [drafts, setDrafts] = useState(0)
  const [gEvents, setGEvents] = useState<{ title: string; date: string; startTime: string; allDay: boolean }[]>([])
  const [horizon, setHorizon] = useState<'today' | 'week' | 'month'>(() => { try { return (localStorage.getItem('gth_home_h') as any) || 'today' } catch { return 'today' } })
  const [capture, setCapture] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { try { localStorage.setItem('gth_home_h', horizon) } catch { /* private mode */ } }, [horizon])
  useEffect(() => {
    supabase.from('hosting_plans').select('id, client_id, cadence, amount, tax_rate, next_date, notice_days, verified, status').eq('status', 'active')
      .then(({ data }) => setPlans((data || []).map((p: any) => ({ ...p, amount: Number(p.amount), tax_rate: Number(p.tax_rate) }))))
    supabase.from('outreach_steps').select('id', { count: 'exact', head: true }).eq('step_number', 1).eq('status', 'pending')
      .then(({ count }) => setDrafts(count || 0))
    if (isGoogleConnected()) {
      const s = new Date(); s.setHours(0, 0, 0, 0); const e = new Date(s); e.setDate(e.getDate() + 7)
      fetchGoogleEvents(s.toISOString(), e.toISOString()).then(l => setGEvents(l.map(x => ({ title: x.title, date: x.date, startTime: x.startTime, allDay: x.allDay })))).catch(() => {})
    }
    // Live: new tasks from email or from Claude show up without a refresh
    const ch = supabase.channel('home-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => { refreshTasks() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => { refreshActivity() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])
  // "n" jumps to quick capture
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'n' && !(e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) { e.preventDefault(); inputRef.current?.focus() } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  const cname = (id?: string | null) => clients.find(c => c.id === id)?.name || ''
  const openTask = (id: string) => { setSelectedTaskId(id); setCurrentPage('tasks') }
  const openInvoice = (id: string) => { setSelectedInvoiceId(id); setCurrentPage('invoices') }
  const openClient = (id?: string | null) => { if (!id) return; setClientWindowId(id); setCurrentPage('clients') }
  const complete = async (id: string, text: string) => {
    setBusy(id)
    try { await tasksApi.update(id, { done: true, completed_at: new Date().toISOString() } as any); await refreshTasks(); showToast(`Done: ${text}`, 'success') } catch (e: any) { showToast(e.message || 'Could not update', 'error') }
    setBusy(null)
  }

  const open = tasks.filter(t => !t.done)
  const hostingInv = (n?: string | null) => { try { return !!JSON.parse(n || '{}').hosting_plan_id } catch { return false } }
  const sendOn = (p: Plan) => p.cadence === 'yearly' ? addDays(p.next_date, -p.notice_days) : p.next_date
  const withTax = (p: Plan) => Math.round(p.amount * (1 + p.tax_rate / 100) * 100) / 100

  // ── Needs you, most urgent first ──
  const needs = useMemo<Need[]>(() => {
    const out: Need[] = []
    for (const t of open.filter(t => t.due_date && t.due_date < today).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1)))
      out.push({ key: 't' + t.id, tone: 'err', icon: AlertCircle, kind: 'Late', title: t.text, meta: `${t.client_name ? t.client_name + ' · ' : ''}due ${when(t.due_date!, today)}`, action: { label: 'Done', run: () => complete(t.id, t.text) }, open: () => openTask(t.id) })
    for (const i of invoices.filter(i => (i.status === 'sent' || i.status === 'overdue') && i.due_date && i.due_date < today))
      out.push({ key: 'u' + i.id, tone: 'err', icon: CircleDollarSign, kind: 'Unpaid', title: `${i.client_name || cname(i.client_id)} · ${i.num} · ${money(i.amount, true)}`, meta: `due ${when(i.due_date!, today)}`, open: () => openInvoice(i.id) })
    for (const i of invoices.filter(i => i.status === 'draft'))
      out.push({ key: 'd' + i.id, tone: 'warn', icon: hostingInv(i.notes) ? Server : Receipt, kind: hostingInv(i.notes) ? 'Approve' : 'Draft', title: `${i.client_name || cname(i.client_id)} · ${i.num} · ${money(i.amount, true)}`, meta: hostingInv(i.notes) ? 'Hosting invoice waiting for your OK' : 'Invoice ready to send', open: () => hostingInv(i.notes) ? setCurrentPage('hosting') : openInvoice(i.id) })
    for (const t of open.filter(t => (t.tags || '').includes('from-email') && Date.now() - new Date(t.created_at).getTime() < 3 * 86400000))
      out.push({ key: 'e' + t.id, tone: 'info', icon: Mail, kind: 'New ask', title: t.text, meta: `${t.client_name || 'Client'} emailed ${ago(t.created_at)}`, action: { label: 'Done', run: () => complete(t.id, t.text) }, open: () => openTask(t.id) })
    for (const l of leads.filter(l => /repl|interest|meeting/i.test(l.stage || '')).slice(0, 3))
      out.push({ key: 'l' + l.id, tone: 'info', icon: Send, kind: 'Lead', title: l.name, meta: `Stage: ${l.stage}`, open: () => setCurrentPage('agents') })
    return out
  }, [tasks, invoices, leads, today, clients])

  // ── Today ──
  const crmEventsOn = (d: string) => events.filter(e => e.date === d)
  const gOn = (d: string) => gEvents.filter(e => e.date === d)
  const dueOn = (d: string) => open.filter(t => t.due_date === d)
  const plansOn = (d: string) => plans.filter(p => sendOn(p) === d)
  const invDueOn = (d: string) => invoices.filter(i => (i.status === 'sent' || i.status === 'overdue') && i.due_date === d)
  const agenda = useMemo(() => {
    const rows: { time: string; title: string; sub?: string; kind: string; onClick?: () => void; taskId?: string }[] = []
    for (const e of gOn(today)) rows.push({ time: e.allDay ? 'All day' : e.startTime, title: e.title, kind: 'event' })
    for (const e of crmEventsOn(today)) rows.push({ time: e.start_time || 'All day', title: e.title, sub: e.client_name || undefined, kind: 'event' })
    rows.sort((a, b) => a.time.localeCompare(b.time))
    for (const t of dueOn(today)) rows.push({ time: 'Due', title: t.text, sub: t.client_name || undefined, kind: 'task', onClick: () => openTask(t.id), taskId: t.id })
    for (const p of plansOn(today)) rows.push({ time: '8:00', title: `Hosting invoice · ${cname(p.client_id)}`, sub: `${money(withTax(p), true)} ${p.verified ? 'goes out automatically' : 'waits for your OK'}`, kind: 'money', onClick: () => setCurrentPage('hosting') })
    for (const i of invDueOn(today)) rows.push({ time: 'Due', title: `${i.client_name || cname(i.client_id)} pays ${i.num}`, sub: money(i.amount, true), kind: 'money', onClick: () => openInvoice(i.id) })
    return rows
  }, [tasks, events, gEvents, plans, invoices, today])
  const nextUp = useMemo(() => open.filter(t => !t.due_date || t.due_date > today).sort((a, b) => (a.due_date || '9') < (b.due_date || '9') ? -1 : 1).slice(0, 5), [tasks, today])

  // ── Week ──
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i))

  // ── Month ──
  const m0 = today.slice(0, 7)
  const monthEnd = ymd(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0))
  const invoiced = invoices.filter(i => i.status !== 'draft' && (i.sent_date || '').startsWith(m0)).reduce((s, i) => s + Number(i.amount), 0)
  const collected = invoices.filter(i => i.status === 'paid' && (i.paid_at || '').startsWith(m0)).reduce((s, i) => s + Number(i.amount), 0)
  const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0)
  const recurring = plans.reduce((s, p) => s + (p.cadence === 'monthly' ? p.amount : p.amount / 12), 0)
  const billingLeft = plans.filter(p => sendOn(p) >= today && sendOn(p) <= monthEnd)
  const doneThisMonth = tasks.filter(t => t.done && (t.completed_at || '').startsWith(m0)).length
  const monthPct = Math.round((Number(today.slice(8)) / Number(monthEnd.slice(8))) * 100)

  // ── Clients that need attention first ──
  const clientRows = useMemo(() => clients.filter(c => c.status === 'active' || (c.status !== 'prospect' && (projects.some(p => p.client_id === c.id && p.status !== 'done') || open.some(t => t.client_id === c.id)))).map(c => {
    const ct = open.filter(t => t.client_id === c.id)
    const proj = projects.find(p => p.client_id === c.id && p.status !== 'done')
    const late = ct.filter(t => t.due_date && t.due_date < today).length
    const idle = c.last_activity ? diff(today, c.last_activity.slice(0, 10)) : null
    const nextT = ct.filter(t => t.due_date).sort((a, b) => a.due_date! < b.due_date! ? -1 : 1)[0]
    const score = late * 100 + ct.length * 10 + (idle && idle > 14 ? 5 : 0)
    return { c, open: ct.length, late, proj, idle, next: nextT, score }
  }).sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name)), [clients, tasks, projects, today])

  // ── Pipeline ──
  const stageCount = (re: RegExp) => leads.filter(l => re.test(l.stage || '')).length
  const pipe = [
    { label: 'Drafts ready', n: drafts },
    { label: 'Contacted', n: stageCount(/contact|email|follow/i) },
    { label: 'Replied', n: stageCount(/repl|interest/i) },
    { label: 'Meetings', n: stageCount(/meeting|proposal/i) },
  ]

  const submit = async () => {
    const p = parseCapture(capture, today, clients)
    if (!p.text) return
    setBusy('capture')
    try {
      await tasksApi.create({ text: p.text, done: false, priority: p.priority, due_date: p.due, client_id: p.client?.id || null })
      await refreshTasks()
      showToast(`Added${p.client ? ` for ${p.client.name}` : ''}${p.due ? `, due ${when(p.due, today)}` : ''}`, 'success')
      setCapture('')
    } catch (e: any) { showToast(e.message || 'Could not add', 'error') }
    setBusy(null)
  }
  const preview = capture.trim() ? parseCapture(capture, today, clients) : null

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = (settings.display_name || 'Omar').split(' ')[0]
  const late = needs.filter(n => n.tone === 'err').length
  const summary = [
    needs.length ? `${needs.length} ${needs.length === 1 ? 'thing needs' : 'things need'} you${late ? `, ${late} late` : ''}` : 'Nothing is waiting on you',
    agenda.length ? `${agenda.length} on today` : null,
    outstanding ? `${money(outstanding)} out with clients` : null,
  ].filter(Boolean).join(' · ')

  const ACT_ICON: Record<string, any> = { task: Check, invoice: Receipt, note: Sparkles, project: Building2, client: Building2, security: Bot }

  return (
    <div className="hm">
      {/* Hero */}
      <header className="hm-hero">
        <div>
          <p className="hm-date">{new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="hm-greet">{greet}, {first}.</h1>
          <p className="hm-sum">{dataLoaded ? summary : 'Loading your day…'}</p>
        </div>
        <form className="hm-capture" onSubmit={e => { e.preventDefault(); submit() }}>
          <input ref={inputRef} value={capture} onChange={e => setCapture(e.target.value)} placeholder="Add a task: “Send Tarin the BC page friday”" aria-label="Add a task" />
          <button type="submit" disabled={!capture.trim() || busy === 'capture'} aria-label="Add task"><CornerDownLeft size={15} /></button>
          {preview && (preview.client || preview.due || preview.priority === 'high') && (
            <p className="hm-capture-hint">
              {preview.client && <span>{preview.client.name}</span>}
              {preview.due && <span>due {when(preview.due, today)}</span>}
              {preview.priority === 'high' && <span>high priority</span>}
            </p>
          )}
        </form>
      </header>

      <div className="hm-grid">
        <div className="hm-main">
          {/* Needs you */}
          <section className="hm-card">
            <div className="hm-head"><h2>Needs you</h2><span className="hm-count">{needs.length}</span></div>
            {needs.length === 0 ? <p className="hm-empty"><Check size={14} /> You're clear. New asks from client emails land here automatically.</p> : (
              <ul className="hm-needs">
                {needs.slice(0, 8).map(n => (
                  <li key={n.key} className={`hm-need is-${n.tone}`}>
                    <button className="hm-need-main" onClick={n.open}>
                      <span className="hm-need-ic"><n.icon size={14} /></span>
                      <span className="hm-need-kind">{n.kind}</span>
                      <span className="hm-need-body"><span className="hm-need-t">{n.title}</span><span className="hm-need-m">{n.meta}</span></span>
                    </button>
                    {n.action ? <button className="hm-chip" onClick={n.action.run} disabled={busy === n.key.slice(1)}><Check size={12} /> {n.action.label}</button> : <ArrowRight size={14} className="hm-go" />}
                  </li>
                ))}
              </ul>
            )}
            {needs.length > 8 && <button className="hm-more" onClick={() => setCurrentPage('tasks')}>See all {needs.length}</button>}
          </section>

          {/* Horizon */}
          <section className="hm-card">
            <div className="hm-head">
              <div className="hm-seg" role="tablist">
                {(['today', 'week', 'month'] as const).map(h => <button key={h} role="tab" aria-selected={horizon === h} className={horizon === h ? 'is-on' : ''} onClick={() => setHorizon(h)}>{h === 'today' ? 'Today' : h === 'week' ? 'This week' : 'This month'}</button>)}
              </div>
            </div>

            {horizon === 'today' && (
              <div className="hm-today">
                {agenda.length === 0 ? <p className="hm-empty">Nothing scheduled or due today.</p> : (
                  <ol className="hm-agenda">
                    {agenda.map((r, i) => (
                      <li key={i} className={`hm-ag is-${r.kind}`}>
                        <span className="hm-ag-time">{r.time}</span>
                        <button className="hm-ag-body" onClick={r.onClick} disabled={!r.onClick}><span className="hm-ag-t">{r.title}</span>{r.sub && <span className="hm-ag-s">{r.sub}</span>}</button>
                        {r.taskId && <button className="hm-tick" aria-label="Mark done" onClick={() => complete(r.taskId!, r.title)}><Check size={13} /></button>}
                      </li>
                    ))}
                  </ol>
                )}
                {nextUp.length > 0 && <>
                  <p className="hm-sub">Up next</p>
                  <ul className="hm-list">
                    {nextUp.map(t => (
                      <li key={t.id}>
                        <button className="hm-tick" aria-label="Mark done" onClick={() => complete(t.id, t.text)} disabled={busy === t.id}><Check size={13} /></button>
                        <button className="hm-list-t" onClick={() => openTask(t.id)}>{t.text}{t.client_name && <em> · {t.client_name}</em>}</button>
                        <span className="hm-list-d">{t.due_date ? when(t.due_date, today) : ''}</span>
                      </li>
                    ))}
                  </ul>
                </>}
              </div>
            )}

            {horizon === 'week' && (
              <div className="hm-week">
                {week.map(d => {
                  const items = [
                    ...gOn(d).map(e => ({ k: 'event', t: e.title })),
                    ...crmEventsOn(d).map(e => ({ k: 'event', t: e.title })),
                    ...dueOn(d).map(t => ({ k: 'task', t: t.text })),
                    ...plansOn(d).map(p => ({ k: 'money', t: `Hosting · ${cname(p.client_id)}` })),
                    ...invDueOn(d).map(i => ({ k: 'money', t: `${i.num} due` })),
                  ]
                  return (
                    <div key={d} className={`hm-day ${d === today ? 'is-today' : ''}`}>
                      <p className="hm-day-h"><span>{dayName(d)}</span><b>{Number(d.slice(8))}</b></p>
                      {items.length === 0 ? <span className="hm-day-none" /> : items.slice(0, 5).map((it, i) => <p key={i} className={`hm-day-i is-${it.k}`}>{it.t}</p>)}
                      {items.length > 5 && <p className="hm-day-more">+{items.length - 5} more</p>}
                    </div>
                  )
                })}
              </div>
            )}

            {horizon === 'month' && (
              <div className="hm-month">
                <div className="hm-bar"><i style={{ width: `${monthPct}%` }} /><span>{new Date().toLocaleDateString('en-CA', { month: 'long' })} · {monthPct}% through</span></div>
                <div className="hm-stats">
                  <div><p className="hm-k">Invoiced</p><p className="hm-n">{money(invoiced)}</p></div>
                  <div><p className="hm-k">Collected</p><p className="hm-n">{money(collected)}</p></div>
                  <div><p className="hm-k">Waiting on clients</p><p className="hm-n">{money(outstanding)}</p></div>
                  <div><p className="hm-k">Hosting per month</p><p className="hm-n">{money(recurring)}</p></div>
                </div>
                <p className="hm-sub">Still to bill this month</p>
                {billingLeft.length === 0 ? <p className="hm-empty">No more hosting invoices this month.</p> : (
                  <ul className="hm-list">
                    {billingLeft.sort((a, b) => sendOn(a) < sendOn(b) ? -1 : 1).map(p => (
                      <li key={p.id}><Server size={13} className="hm-list-ic" /><button className="hm-list-t" onClick={() => setCurrentPage('hosting')}>{cname(p.client_id)}<em> · {p.cadence}</em></button><span className="hm-list-d">{nice(sendOn(p))} · {money(withTax(p), true)}</span></li>
                    ))}
                  </ul>
                )}
                <p className="hm-foot">{doneThisMonth} {doneThisMonth === 1 ? 'task' : 'tasks'} done this month</p>
              </div>
            )}
          </section>
        </div>

        <aside className="hm-side">
          {/* Clients */}
          <section className="hm-card">
            <div className="hm-head"><h2>Clients</h2><button className="hm-link" onClick={() => setCurrentPage('clients')}>All <ArrowRight size={12} /></button></div>
            <ul className="hm-clients">
              {clientRows.slice(0, 9).map(r => (
                <li key={r.c.id}>
                  <button onClick={() => openClient(r.c.id)}>
                    <span className="hm-cl-n">{r.c.name}</span>
                    <span className="hm-cl-m">
                      {r.late ? <b className="is-err">{r.late} late</b> : r.open ? <b>{r.open} open</b> : <span>no open tasks</span>}
                      {r.proj && <span className="hm-pill">{r.proj.status === 'progress' ? 'In progress' : r.proj.status === 'review' ? 'In review' : 'Backlog'}</span>}
                      {r.idle !== null && r.idle > 14 && <span className="hm-quiet">quiet {r.idle}d</span>}
                    </span>
                    {r.next && <span className="hm-cl-next">Next: {r.next.text} · {when(r.next.due_date!, today)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Pipeline */}
          <section className="hm-card">
            <div className="hm-head"><h2>Pipeline</h2><button className="hm-link" onClick={() => setCurrentPage('agents')}>Open <ArrowRight size={12} /></button></div>
            <div className="hm-pipe">{pipe.map(p => <div key={p.label}><p className="hm-n">{p.n}</p><p className="hm-k">{p.label}</p></div>)}</div>
          </section>

          {/* Claude log */}
          <section className="hm-card">
            <div className="hm-head"><h2>What changed</h2><span className="hm-live"><i /> Live</span></div>
            {activity.length === 0 ? <p className="hm-empty">Updates from Claude, your inbox and the hosting job show up here.</p> : (
              <ul className="hm-log">
                {activity.slice(0, 8).map(a => { const I = ACT_ICON[a.type] || CalendarDays; return (
                  <li key={a.id}><I size={13} /><span className="hm-log-t">{a.description}</span><span className="hm-log-d">{ago(a.timestamp)}</span></li>
                ) })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
