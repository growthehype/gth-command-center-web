import { useEffect, useMemo, useState, useCallback } from 'react'
import { Server, Plus, Send, Eye, Check, Pause, Play, AlertCircle, CalendarClock, Repeat, Download, ShieldCheck } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { invoices as invoicesApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'

type Plan = {
  id: string; client_id: string; cadence: 'monthly' | 'yearly'; amount: number; tax_rate: number; description: string
  next_date: string; notice_days: number; due_days: number; send_to: string | null; cc: string | null; contact_name: string | null
  invoice_prefix: string | null; payment_instructions: string; status: 'active' | 'paused' | 'ended'; verified: boolean
  auto_send: boolean; bill_day: number | null; ends_on: string | null; started_on: string | null; notes: string | null; last_invoice_id: string | null; last_run_at: string | null
}
type LogRow = { id: string; plan_id: string; period: string; kind: string; invoice_id: string | null; detail: string | null; created_at: string }
type Preview = { num: string; to: string; cc: string; subject: string; body: string; total: number; tax: number; due: string; issue: string; label: string; problems: string[]; pdfBase64: string }

const TZ = 'America/Edmonton'
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const addDays = (d: string, n: number) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const diffDays = (a: string, b: string) => Math.round((new Date(a + 'T12:00:00Z').getTime() - new Date(b + 'T12:00:00Z').getTime()) / 86400000)
const nice = (d: string, withYear = false) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
const money = (n: number, cents = true) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
const withTax = (p: Plan) => Math.round(p.amount * (1 + p.tax_rate / 100) * 100) / 100
const sendDate = (p: Plan) => p.cadence === 'yearly' ? addDays(p.next_date, -p.notice_days) : p.next_date
const inDays = (n: number) => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} days ago` : `in ${n} days`
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i
const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')

async function callHosting(payload: any) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/hosting', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify(payload) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`)
  return j
}

const EMPTY = {
  client_id: '', cadence: 'monthly' as 'monthly' | 'yearly', amount: '', tax_rate: '5', description: 'Website hosting',
  next_date: '', notice_days: '30', due_days: '0', send_to: '', cc: '', contact_name: '', invoice_prefix: '',
  payment_instructions: 'Please send payment by Interac e-Transfer to omar@growthehype.ca', ends_on: '', auto_send: true, status: 'active' as Plan['status'], notes: '',
}

export default function Hosting() {
  const { clients, invoices, refreshInvoices, demoMode } = useAppStore()
  const [plans, setPlans] = useState<Plan[]>([])
  const [log, setLog] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const today = todayStr()

  const load = useCallback(async () => {
    if (demoMode) {
      // Sample plans on the demo clients so the page can be explored safely
      const t = todayStr()
      const cs = useAppStore.getState().clients.slice(0, 4)
      const base = { tax_rate: 5, description: 'Website hosting', notice_days: 30, due_days: 0, send_to: null, cc: null, contact_name: null, invoice_prefix: null, payment_instructions: EMPTY.payment_instructions, auto_send: true, started_on: t, notes: null, last_invoice_id: null, last_run_at: null }
      setPlans(cs.map((c, i) => ({ ...base, id: 'demo-' + i, client_id: c.id, cadence: i % 2 ? 'yearly' : 'monthly', amount: i % 2 ? 420 : 35, next_date: addDays(t, [12, 24, 3, 160][i] ?? 20), bill_day: null, ends_on: null, status: i === 3 ? 'paused' : 'active', verified: i !== 2 } as Plan)))
      setLoading(false); return
    }
    const [{ data: p }, { data: l }] = await Promise.all([
      supabase.from('hosting_plans').select('*').order('next_date'),
      supabase.from('hosting_log').select('*').order('created_at', { ascending: false }).limit(200),
    ])
    setPlans((p || []).map((x: any) => ({ ...x, amount: Number(x.amount), tax_rate: Number(x.tax_rate) })))
    setLog((l || []) as LogRow[])
    setLoading(false)
  }, [demoMode])
  useEffect(() => { load() }, [load])

  const clientName = (id: string) => clients.find(c => c.id === id)?.name || 'Unknown client'
  const hostingInvoices = useMemo(() => invoices.map(inv => {
    let n: any = null; try { n = inv.notes ? JSON.parse(inv.notes) : null } catch { /* not JSON */ }
    return n?.hosting_plan_id ? { inv, planId: n.hosting_plan_id as string, period: n.hosting_period as string } : null
  }).filter(Boolean) as { inv: typeof invoices[number]; planId: string; period: string }[], [invoices])

  const active = plans.filter(p => p.status === 'active')
  const monthlyValue = active.reduce((s, p) => s + (p.cadence === 'monthly' ? p.amount : p.amount / 12), 0)
  const next30 = active.filter(p => diffDays(sendDate(p), today) <= 30)
  const waiting = hostingInvoices.filter(h => h.inv.status === 'draft')
  const unpaid = hostingInvoices.filter(h => h.inv.status === 'sent' || h.inv.status === 'overdue')

  const problemsFor = (p: Plan) => {
    const c = clients.find(x => x.id === p.client_id)
    const to = (p.send_to || c?.email || '').trim()
    const out: string[] = []
    if (!EMAIL_RE.test(to)) out.push('No email to send to')
    if (!(p.amount > 0)) out.push('No amount')
    return out
  }

  // ── form ──
  const openNew = () => { setEditing(null); setForm({ ...EMPTY }); setFormOpen(true) }
  const openEdit = (p: Plan) => {
    setEditing(p)
    setForm({
      client_id: p.client_id, cadence: p.cadence, amount: String(p.amount), tax_rate: String(p.tax_rate), description: p.description,
      next_date: p.next_date, notice_days: String(p.notice_days), due_days: String(p.due_days), send_to: p.send_to || '', cc: p.cc || '',
      contact_name: p.contact_name || '', ends_on: p.ends_on || '', invoice_prefix: p.invoice_prefix || '', payment_instructions: p.payment_instructions,
      auto_send: p.auto_send, status: p.status, notes: p.notes || '',
    })
    setFormOpen(true)
  }
  const pickClient = (id: string) => {
    const c = clients.find(x => x.id === id)
    setForm(f => ({ ...f, client_id: id, send_to: f.send_to || c?.email || '', contact_name: f.contact_name || (c?.contact || '').split(/\s+/)[0] || '' }))
  }
  const formErrors = useMemo(() => {
    const e: string[] = []
    if (!form.client_id) e.push('Pick a client')
    if (!(Number(form.amount) > 0)) e.push('Enter the hosting amount')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.next_date)) e.push(form.cadence === 'monthly' ? 'Pick the next invoice date' : 'Pick the renewal date')
    const to = form.send_to.trim() || clients.find(c => c.id === form.client_id)?.email || ''
    if (form.client_id && !EMAIL_RE.test(to)) e.push('Add a valid email to send invoices to')
    if (form.cc.trim() && form.cc.split(',').some(x => !EMAIL_RE.test(x.trim()))) e.push('Check the CC address')
    return e
  }, [form, clients])

  const save = async () => {
    if (formErrors.length) { showToast(formErrors[0], 'error'); return }
    setSaving(true)
    const row: any = {
      client_id: form.client_id, cadence: form.cadence, amount: Math.round(Number(form.amount) * 100) / 100, tax_rate: Number(form.tax_rate) || 0,
      description: form.description.trim() || 'Website hosting', next_date: form.next_date, bill_day: Number(form.next_date.slice(8, 10)),
      notice_days: Math.max(0, Math.min(120, Number(form.notice_days) || 30)), due_days: Math.max(0, Math.min(60, Number(form.due_days) || 0)),
      send_to: form.send_to.trim() || null, cc: form.cc.trim() || null, contact_name: form.contact_name.trim() || null,
      invoice_prefix: form.invoice_prefix.trim().toUpperCase() || null, payment_instructions: form.payment_instructions.trim() || EMPTY.payment_instructions,
      ends_on: /^\d{4}-\d{2}-\d{2}$/.test(form.ends_on) ? form.ends_on : null, auto_send: form.auto_send, status: form.status, notes: form.notes.trim() || null, updated_at: new Date().toISOString(),
    }
    // Any change to who or how much gets billed needs a fresh approval before auto-sending again
    if (editing && (editing.amount !== row.amount || Number(editing.tax_rate) !== row.tax_rate || (editing.send_to || null) !== row.send_to || editing.client_id !== row.client_id)) row.verified = false
    const q = editing ? supabase.from('hosting_plans').update(row).eq('id', editing.id) : supabase.from('hosting_plans').insert({ ...row, started_on: today })
    const { error } = await q
    setSaving(false)
    if (error) { showToast(error.message, 'error'); return }
    showToast(editing ? 'Hosting plan updated' : 'Hosting plan added', 'success')
    setFormOpen(false); load()
  }

  // ── actions ──
  const doPreview = async (p: Plan) => {
    setBusy('preview:' + p.id)
    try { setPreview(await callHosting({ action: 'preview', planId: p.id })) } catch (e: any) { showToast(e.message, 'error') }
    setBusy(null)
  }
  const previewInvoice = async (invoiceId: string) => {
    setBusy('preview:' + invoiceId)
    try { setPreview(await callHosting({ action: 'preview_invoice', invoiceId })) } catch (e: any) { showToast(e.message, 'error') }
    setBusy(null)
  }
  const approve = async (invoiceId: string, trustPlan: boolean) => {
    setBusy('send:' + invoiceId)
    try {
      const r = await callHosting({ action: 'send', invoiceId, trustPlan })
      showToast(`Invoice ${r.num} sent to ${r.to}`, 'success')
      await Promise.all([refreshInvoices(), load()])
    } catch (e: any) { showToast(e.message, 'error') }
    setBusy(null)
  }
  const billNow = async (p: Plan) => {
    if (!window.confirm(`Create the ${p.cadence === 'monthly' ? 'next' : 'renewal'} hosting invoice for ${clientName(p.client_id)} now? It will wait here for you to send it.`)) return
    setBusy('bill:' + p.id)
    try {
      const r = await callHosting({ action: 'bill_now', planId: p.id })
      if (r.status === 'error') throw new Error(r.error)
      showToast(r.status === 'already_billed' ? 'That period is already invoiced' : `Invoice ${r.num} created. Review and send it above.`, 'success')
      await Promise.all([refreshInvoices(), load()])
    } catch (e: any) { showToast(e.message, 'error') }
    setBusy(null)
  }
  const togglePause = async (p: Plan) => {
    const status = p.status === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('hosting_plans').update({ status, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (error) showToast(error.message, 'error'); else { showToast(status === 'paused' ? 'Billing paused' : 'Billing resumed', 'success'); load() }
  }
  const markPaid = async (id: string) => {
    await invoicesApi.update(id, { status: 'paid', paid_at: new Date().toISOString() } as any)
    await refreshInvoices(); showToast('Marked as paid', 'success')
  }
  const openPdf = (b64: string, num: string, download = false) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    if (download) { const a = document.createElement('a'); a.href = url; a.download = `Invoice-${num}.pdf`; a.click() } else window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const sorted = [...plans].sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || sendDate(a).localeCompare(sendDate(b)))
  const lastFor = (p: Plan) => hostingInvoices.filter(h => h.planId === p.id).sort((a, b) => (b.period || '').localeCompare(a.period || ''))[0]
  const lastError = (p: Plan) => log.find(l => l.plan_id === p.id && (l.kind === 'error' || (l.detail || '').startsWith('send failed')))

  const ic = 'w-full bg-cell border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors'
  const yearlyClient = form.cadence === 'yearly'

  return (
    <div className="space-y-6 hs">
      <div className="flex items-center justify-between">
        <div>
          <h1>Hosting</h1>
          <p className="text-steel mt-1" style={{ fontSize: '14px' }}>
            {active.length} active {active.length === 1 ? 'site' : 'sites'} · invoices go out from your Gmail at 8 am
          </p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2"><Plus size={12} /> Add hosting</button>
      </div>

      <div className="hs-stats">
        <div className="hs-stat"><p className="label text-dim">Hosting per month</p><p className="hs-num">{money(monthlyValue, false)}</p><p className="hs-sub">{money(monthlyValue * 12, false)} a year, before GST</p></div>
        <div className="hs-stat"><p className="label text-dim">Billing next 30 days</p><p className="hs-num">{money(next30.reduce((s, p) => s + withTax(p), 0), false)}</p><p className="hs-sub">{next30.length} {next30.length === 1 ? 'invoice' : 'invoices'}</p></div>
        <div className={`hs-stat ${waiting.length ? 'is-warn' : ''}`}><p className="label text-dim">Waiting for you</p><p className="hs-num">{waiting.length}</p><p className="hs-sub">{waiting.length ? 'review and send' : 'nothing to approve'}</p></div>
        <div className={`hs-stat ${unpaid.length ? 'is-warn' : ''}`}><p className="label text-dim">Sent, not paid</p><p className="hs-num">{money(unpaid.reduce((s, h) => s + Number(h.inv.amount), 0), false)}</p><p className="hs-sub">{unpaid.length} {unpaid.length === 1 ? 'invoice' : 'invoices'}</p></div>
      </div>

      {(waiting.length > 0 || unpaid.length > 0) && (
        <section className="hs-needs">
          <p className="label text-dim mb-3">Needs you</p>
          <div className="space-y-2">
            {waiting.map(({ inv, planId }) => {
              const p = plans.find(x => x.id === planId)
              const failed = log.find(l => l.invoice_id === inv.id && (l.detail || '').startsWith('send failed'))
              return (
                <div key={inv.id} className="hs-need">
                  <AlertCircle size={15} className="hs-need-ic is-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="hs-need-t">{clientName(inv.client_id || '')} · {inv.num} · {money(Number(inv.amount))}</p>
                    <p className="hs-need-d">{failed ? 'Gmail could not send it. Check the address, then send.' : p && !p.verified ? 'First invoice on this plan. Check it once, then it sends on its own.' : 'Ready to send.'}</p>
                  </div>
                  <div className="hs-need-a">
                    <button className="btn-ghost" onClick={() => previewInvoice(inv.id)} disabled={!!busy}><Eye size={13} /> Check</button>
                    <button className="btn-primary" onClick={() => approve(inv.id, !!p && !p.verified)} disabled={!!busy}>
                      <Send size={12} /> {busy === 'send:' + inv.id ? 'Sending…' : p && !p.verified ? 'Send + auto from now' : 'Send'}
                    </button>
                  </div>
                </div>
              )
            })}
            {unpaid.map(({ inv }) => {
              const age = inv.due_date ? diffDays(today, inv.due_date) : 0
              return (
                <div key={inv.id} className="hs-need">
                  <CalendarClock size={15} className={`hs-need-ic ${age > 7 ? 'is-err' : ''}`} />
                  <div className="min-w-0 flex-1">
                    <p className="hs-need-t">{clientName(inv.client_id || '')} · {inv.num} · {money(Number(inv.amount))}</p>
                    <p className="hs-need-d">{age > 0 ? `Due ${nice(inv.due_date!)}, ${age} ${age === 1 ? 'day' : 'days'} past due` : inv.due_date ? `Sent, due ${nice(inv.due_date)}` : 'Sent'}</p>
                  </div>
                  <div className="hs-need-a"><button className="btn-ghost" onClick={() => markPaid(inv.id)}><Check size={13} /> Paid</button></div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <p className="label text-dim mb-3">Every site</p>
        {loading ? <p className="text-dim" style={{ fontSize: 14 }}>Loading…</p> : plans.length === 0 ? (
          <div className="hs-empty">
            <Server size={22} />
            <p>Add each hosting client once: monthly or yearly, the amount and the date. The CRM handles the invoices from there.</p>
            <button onClick={openNew} className="btn-primary flex items-center gap-2"><Plus size={12} /> Add hosting</button>
          </div>
        ) : (
          <div className="hs-list">
            {sorted.map(p => {
              const sd = sendDate(p); const d = diffDays(sd, today)
              const probs = problemsFor(p); const last = lastFor(p); const err = lastError(p)
              const cycle = p.cadence === 'monthly' ? 30 : 365
              const pct = Math.max(0, Math.min(100, 100 - (diffDays(p.next_date, today) / cycle) * 100))
              const state = p.status !== 'active' ? { t: p.status === 'paused' ? 'Paused' : 'Ended', c: 'badge-neutral' }
                : probs.length ? { t: probs[0], c: 'badge-err' }
                : !p.verified ? { t: 'First invoice: you approve', c: 'badge-warn' }
                : p.auto_send ? { t: 'Sends on its own', c: 'badge-ok' } : { t: 'You approve each one', c: 'badge-neutral' }
              return (
                <article key={p.id} className={`hs-row ${p.status !== 'active' ? 'is-off' : ''}`}>
                  <button className="hs-row-main" onClick={() => openEdit(p)}>
                    <div className="hs-row-head">
                      <span className="hs-name">{clientName(p.client_id)}</span>
                      <span className={`hs-cad hs-cad--${p.cadence}`}>{p.cadence === 'monthly' ? <><Repeat size={11} /> Monthly</> : <><CalendarClock size={11} /> Yearly</>}</span>
                    </div>
                    <p className="hs-when">
                      {p.status !== 'active' ? `Next period ${nice(p.next_date, true)}` : p.cadence === 'monthly'
                        ? <>Invoice {d < 0 ? 'was due' : 'sends'} <b>{nice(sd)}</b> · {inDays(d)}</>
                        : <>Renews <b>{nice(p.next_date, true)}</b> · notice and invoice {d < 0 ? 'were due' : 'go out'} {nice(sd)} ({inDays(d)})</>}
                    </p>
                    <div className="hs-bar" aria-hidden="true"><i style={{ width: `${p.status === 'active' ? pct : 0}%` }} /></div>
                    <div className="hs-row-foot">
                      <span className="hs-amt">{money(p.amount)} <em>+ GST = {money(withTax(p))}</em></span>
                      <span className={`badge ${state.c}`}>{state.t}</span>
                      {last && <span className={`hs-last ${last.inv.status === 'paid' ? 'is-ok' : ''}`}>Last: {last.inv.num} {last.inv.status === 'paid' ? 'paid' : last.inv.status === 'draft' ? 'waiting' : 'unpaid'}</span>}
                    </div>
                    {err && <p className="hs-err"><AlertCircle size={12} /> {err.detail}</p>}
                  </button>
                  <div className="hs-row-acts">
                    <button className="hs-icon" title="Check the next invoice and email" onClick={() => doPreview(p)} disabled={!!busy}><Eye size={15} /></button>
                    <button className="hs-icon" title="Create the next invoice now" onClick={() => billNow(p)} disabled={!!busy || p.status !== 'active'}><Send size={14} /></button>
                    <button className="hs-icon" title={p.status === 'active' ? 'Pause billing' : 'Resume billing'} onClick={() => togglePause(p)}>{p.status === 'active' ? <Pause size={14} /> : <Play size={14} />}</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Hosting: ${clientName(editing.client_id)}` : 'Add hosting'} width="620px">
        <div className="space-y-5">
          <div>
            <label className="label text-dim block mb-1.5">Client</label>
            <select className={ic} value={form.client_id} onChange={e => pickClient(e.target.value)}>
              <option value="">Choose a client…</option>
              {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="hs-seg" role="radiogroup">
            {(['monthly', 'yearly'] as const).map(c => (
              <button key={c} type="button" role="radio" aria-checked={form.cadence === c} className={form.cadence === c ? 'is-on' : ''} onClick={() => setForm(f => ({ ...f, cadence: c }))}>
                {c === 'monthly' ? 'Pays monthly' : 'Pays yearly'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-dim block mb-1.5">Amount before GST</label>
              <input className={ic} inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder={yearlyClient ? '420.00' : '35.00'} />
            </div>
            <div>
              <label className="label text-dim block mb-1.5">GST %</label>
              <input className={ic} inputMode="decimal" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value.replace(/[^0-9.]/g, '') }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-dim block mb-1.5">{yearlyClient ? 'Renewal date' : 'Next invoice date'}</label>
              <input type="date" className={ic} value={form.next_date} onChange={e => setForm(f => ({ ...f, next_date: e.target.value }))} />
            </div>
            {yearlyClient ? (
              <div>
                <label className="label text-dim block mb-1.5">Send notice + invoice</label>
                <select className={ic} value={form.notice_days} onChange={e => setForm(f => ({ ...f, notice_days: e.target.value }))}>
                  {[14, 21, 30, 45, 60].map(n => <option key={n} value={n}>{n} days before</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="label text-dim block mb-1.5">Payment due</label>
                <select className={ic} value={form.due_days} onChange={e => setForm(f => ({ ...f, due_days: e.target.value }))}>
                  <option value="0">On receipt</option><option value="7">In 7 days</option><option value="14">In 14 days</option><option value="30">In 30 days</option>
                </select>
              </div>
            )}
          </div>
          {Number(form.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(form.next_date) && (
            <p className="hs-explain">
              {yearlyClient
                ? <>On <b>{nice(addDays(form.next_date, -Number(form.notice_days)), true)}</b> the client gets a renewal notice with the invoice for <b>{money(Math.round(Number(form.amount) * (1 + Number(form.tax_rate) / 100) * 100) / 100)}</b>, due {nice(form.next_date, true)}. Then every year after.</>
                : <>On the <b>{ordinal(Number(form.next_date.slice(8)))}</b> of every month, starting {nice(form.next_date, true)}, the client gets an invoice for <b>{money(Math.round(Number(form.amount) * (1 + Number(form.tax_rate) / 100) * 100) / 100)}</b>.</>}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-dim block mb-1.5">Send invoices to</label>
              <input className={ic} type="email" value={form.send_to} onChange={e => setForm(f => ({ ...f, send_to: e.target.value }))} placeholder="billing@client.ca" />
            </div>
            <div>
              <label className="label text-dim block mb-1.5">Greeting name</label>
              <input className={ic} value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Riley" />
            </div>
          </div>
          <div>
            <label className="label text-dim block mb-1.5">Copy to (optional)</label>
            <input className={ic} value={form.cc} onChange={e => setForm(f => ({ ...f, cc: e.target.value }))} placeholder="accounts@client.ca" />
          </div>
          <details className="hs-more">
            <summary>More options</summary>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-dim block mb-1.5">Line item</label>
                  <input className={ic} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-dim block mb-1.5">Invoice prefix</label>
                  <input className={ic} value={form.invoice_prefix} onChange={e => setForm(f => ({ ...f, invoice_prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))} placeholder="Auto from past invoices" />
                </div>
              </div>
              <div>
                <label className="label text-dim block mb-1.5">Billing ends (optional)</label>
                <input type="date" className={ic} value={form.ends_on} onChange={e => setForm(f => ({ ...f, ends_on: e.target.value }))} />
              </div>
              <div>
                <label className="label text-dim block mb-1.5">Payment instructions</label>
                <textarea className={ic} rows={2} value={form.payment_instructions} onChange={e => setForm(f => ({ ...f, payment_instructions: e.target.value }))} />
              </div>
              <div>
                <label className="label text-dim block mb-1.5">Private notes</label>
                <textarea className={ic} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Only you see this" />
              </div>
            </div>
          </details>
          <label className="hs-toggle">
            <input type="checkbox" checked={form.auto_send} onChange={e => setForm(f => ({ ...f, auto_send: e.target.checked }))} />
            <span><b>Send on its own</b> once you have approved the first invoice. Turn off to approve every invoice.</span>
          </label>
          {editing && !editing.verified && <p className="hs-explain"><ShieldCheck size={13} /> The first invoice on this plan waits for your OK. Changing the amount, GST or email also asks again.</p>}
          {formErrors.length > 0 && form.client_id && <p className="hs-formerr">{formErrors[0]}</p>}
          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-1">
            {editing && <button className="btn-ghost" onClick={() => doPreview(editing)} disabled={!!busy}><Eye size={13} /> Check invoice</button>}
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add hosting'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `Invoice ${preview.num}` : 'Invoice'} width="620px">
        {preview && (
          <div className="space-y-4">
            {preview.problems.length > 0 && <p className="hs-formerr">{preview.problems.join('. ')}. It will not send until this is fixed.</p>}
            <dl className="hs-dl">
              <dt>To</dt><dd>{preview.to || 'missing'}{preview.cc ? `, cc ${preview.cc}` : ''}</dd>
              <dt>Subject</dt><dd>{preview.subject}</dd>
              <dt>Covers</dt><dd>{preview.label}</dd>
              <dt>Total</dt><dd>{money(preview.total)} <span className="text-dim">incl. {money(preview.tax)} GST</span></dd>
              <dt>Due</dt><dd>{preview.due === preview.issue ? 'On receipt' : nice(preview.due, true)}</dd>
            </dl>
            <pre className="hs-email">{preview.body}</pre>
            <p className="text-dim" style={{ fontSize: 12.5 }}>Your Gmail signature is added below. The invoice number shown is the next free one and is fixed when the invoice is created.</p>
            <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2">
              <button className="btn-ghost" onClick={() => openPdf(preview.pdfBase64, preview.num, true)}><Download size={13} /> Download PDF</button>
              <button className="btn-primary" onClick={() => openPdf(preview.pdfBase64, preview.num)}><Eye size={13} /> Open PDF</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
