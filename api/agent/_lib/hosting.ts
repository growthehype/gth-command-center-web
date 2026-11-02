// Hosting billing. Every morning the daily job looks at each active hosting
// plan and, when one is due, creates the invoice in the CRM, attaches the PDF
// and emails it from Omar's Gmail. A plan only sends on its own once Omar has
// approved its first invoice ("verified"); until then the invoice waits in the
// Hosting page for one tap. Each billing period can only ever produce one
// invoice (unique index on hosting_log), so a retry can never double-bill.
import { getAdminClient } from './supabase-admin'
import { sendEmail } from './gmail-server'
import { generateInvoicePDF } from './invoice-pdf'

const TZ = 'America/Edmonton'
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i
const DEFAULTS = {
  from_name: 'Grow The Hype Inc.',
  from_email: 'omar@growthehype.ca',
  from_phone: '7809664986',
  from_address: '983 Lamb Crescent Northwest, Edmonton, Alberta T6R 2X8, Canada',
  from_website: 'www.growthehype.ca',
  gst_number: '720385129',
}

export type Plan = {
  id: string; user_id: string; client_id: string; cadence: 'monthly' | 'yearly'
  amount: number; tax_rate: number; description: string; next_date: string
  notice_days: number; due_days: number; send_to: string | null; cc: string | null
  contact_name: string | null; invoice_prefix: string | null; payment_instructions: string
  status: string; verified: boolean; auto_send: boolean; bill_day: number | null
}

// ── dates (all in Edmonton time, as plain YYYY-MM-DD) ──
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
const parse = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd } }
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
export function addDays(d: string, n: number): string {
  const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10)
}
export function addMonths(d: string, n: number, anchorDay?: number | null): string {
  const p = parse(d); let m = p.m + n; let y = p.y + Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1
  return iso(y, m, Math.min(anchorDay || p.d, daysIn(y, m)))
}
export const nextPeriod = (p: Plan, d: string) => p.cadence === 'monthly' ? addMonths(d, 1, p.bill_day) : addMonths(d, 12, p.bill_day)
/** The day the invoice goes out: monthly on the billing day, yearly `notice_days` before renewal. */
export const sendDate = (p: Plan) => p.cadence === 'yearly' ? addDays(p.next_date, -p.notice_days) : p.next_date
const long = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })
const monthName = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const money = (n: number) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
const firstName = (s?: string | null) => (s || '').trim().split(/\s+/)[0] || ''

// ── invoice numbers continue each client's own series (TC01, CVE04...) ──
async function nextNumber(userId: string, clientId: string, clientName: string, prefix: string | null) {
  const sb = getAdminClient()
  const { data } = await sb.from('invoices').select('num').eq('user_id', userId).eq('client_id', clientId)
  const nums = (data || []).map(r => String(r.num || ''))
  let pre = (prefix || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (!pre) {
    const seen = nums.map(n => n.match(/^([A-Z]+)\d+$/i)?.[1]?.toUpperCase()).filter(Boolean) as string[]
    pre = seen[seen.length - 1] || clientName.split(/[^A-Za-z]+/).filter(w => w && !/^(and|the|of|inc|ltd|llp)$/i.test(w)).map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'GTH'
  }
  const { data: all } = await sb.from('invoices').select('num').eq('user_id', userId).ilike('num', `${pre}%`)
  const max = Math.max(0, ...(all || []).map(r => Number(String(r.num).slice(pre.length)) || 0).filter(n => Number.isFinite(n)))
  return pre + String(max + 1).padStart(2, '0')
}

async function senderDetails(userId: string) {
  const sb = getAdminClient()
  const { data } = await sb.from('invoices').select('notes').eq('user_id', userId).not('notes', 'is', null).order('created_at', { ascending: false }).limit(5)
  for (const r of data || []) {
    try { const n = JSON.parse(r.notes as string); if (n.from_name && n.from_email) return { ...DEFAULTS, ...Object.fromEntries(Object.entries(n).filter(([k, v]) => k.startsWith('from_') && v)), gst_number: n.gst_number || DEFAULTS.gst_number } } catch { /* skip */ }
  }
  return DEFAULTS
}

export function periodLabel(p: Plan, period: string) {
  return p.cadence === 'monthly' ? monthName(period) : `${long(period)} to ${long(addDays(addMonths(period, 12), -1))}`
}

/** Everything the invoice and email will say, computed once so preview and send always match. */
export async function buildInvoice(p: Plan, opts: { issueDate?: string; num?: string } = {}) {
  const sb = getAdminClient()
  const { data: client } = await sb.from('clients').select('id, name, email, contact').eq('id', p.client_id).single()
  if (!client) throw new Error('Client not found')
  const to = (p.send_to || client.email || '').trim()
  const problems: string[] = []
  if (!EMAIL_RE.test(to)) problems.push('No valid email address to send to')
  if (p.cc && p.cc.split(',').some(e => !EMAIL_RE.test(e.trim()))) problems.push('A copy (CC) address is not valid')
  if (!(Number(p.amount) > 0)) problems.push('Amount is missing')
  const issue = opts.issueDate || today()
  const period = p.next_date
  const due = p.cadence === 'yearly' ? (period > issue ? period : issue) : addDays(issue, p.due_days || 0)
  const sub = r2(Number(p.amount))
  const tax = r2(sub * Number(p.tax_rate) / 100)
  const total = r2(sub + tax)
  const from = await senderDetails(p.user_id)
  const num = opts.num || await nextNumber(p.user_id, p.client_id, client.name, p.invoice_prefix)
  const contact = p.contact_name || client.contact || ''
  const label = periodLabel(p, period)
  const terms = due === issue ? 'Due on Receipt' : `Due ${long(due)}`
  const lineItems = [{ description: `${p.description}: ${label}`, qty: 1, rate: sub }]
  const memo = p.cadence === 'monthly' ? `Thank you, ${firstName(contact) || client.name}. We appreciate you trusting us with your website.` : `Thank you for another year with us, ${firstName(contact) || client.name}.`
  const notes = {
    line_items: lineItems, tax_rate: Number(p.tax_rate), tax_label: 'GST', gst_number: from.gst_number, currency: 'CAD',
    payment_terms: terms, payment_instructions: p.payment_instructions, terms_text: '', memo,
    from_name: from.from_name, from_email: from.from_email, from_phone: from.from_phone, from_address: from.from_address, from_website: from.from_website,
    client_phone: '', client_address: '', client_contact_name: contact,
    hosting_plan_id: p.id, hosting_period: period,
  }
  const pdf = generateInvoicePDF({
    invoiceNum: num, date: issue, dueDate: due, fromName: from.from_name, fromEmail: from.from_email, fromPhone: from.from_phone,
    fromAddress: from.from_address, fromWebsite: from.from_website, gstNumber: from.gst_number, clientName: client.name, clientEmail: to,
    clientContactName: contact || undefined, lineItems, taxRate: Number(p.tax_rate), taxLabel: 'GST', currency: 'CAD',
    paymentTerms: terms, paymentInstructions: p.payment_instructions, memo,
  } as any)
  const pdfBase64 = Buffer.from(pdf.output('arraybuffer')).toString('base64')

  const pay = p.payment_instructions.trim().replace(/[.\s]+$/, '') + '.'
  const hi = firstName(contact) ? `Hi ${firstName(contact)},` : 'Hi there,'
  const dueLine = due === issue ? 'Due: on receipt' : `Due: ${long(due)}`
  const subject = p.cadence === 'monthly'
    ? `${client.name}: website hosting for ${monthName(period)} (invoice ${num})`
    : `${client.name}: your website hosting renews ${long(period)} (invoice ${num})`
  const body = p.cadence === 'monthly'
    ? `${hi}\n\nYour website hosting invoice for ${monthName(period)} is attached.\n\nInvoice: ${num}\nAmount: ${money(total)} (includes ${money(tax)} GST)\n${dueLine}\n\n${pay}\n\nThank you for trusting us with your website. If anything on it needs a refresh, just reply to this email.`
    : `${hi}\n\nA quick heads-up that your yearly website hosting renews on ${long(period)}. The renewal invoice is attached and covers ${label}.\n\nInvoice: ${num}\nAmount: ${money(total)} (includes ${money(tax)} GST)\n${dueLine}\n\n${pay}\n\nThank you for another year with us. If anything about your site or hosting should change before the renewal, just reply here and we will sort it out.`
  return { client, to, cc: p.cc || '', problems, issue, due, period, sub, tax, total, num, notes, pdfBase64, subject, body, label }
}

/** Create the invoice for the plan's current period, send it when allowed, then move the plan forward. */
export async function billPlan(p: Plan, opts: { forceDraft?: boolean } = {}) {
  const sb = getAdminClient()
  const period = p.next_date
  // Claim this period first. If it was already billed, the unique index stops a second invoice.
  const { data: claim, error: claimErr } = await sb.from('hosting_log').insert({ user_id: p.user_id, plan_id: p.id, period, kind: 'invoice', detail: 'creating' }).select('id').single()
  if (claimErr) return { status: 'already_billed', period }
  let invoiceId: string | null = null
  try {
    const b = await buildInvoice(p)
    const { data: inv, error } = await sb.from('invoices').insert({
      user_id: p.user_id, client_id: p.client_id, num: b.num, amount: b.total, sent_date: b.issue, due_date: b.due, status: 'draft', notes: JSON.stringify(b.notes),
    }).select('id').single()
    if (error || !inv) throw new Error('Could not save invoice: ' + (error?.message || 'unknown'))
    invoiceId = inv.id
    const autoOk = p.verified && p.auto_send && !opts.forceDraft && b.problems.length === 0
    let detail = ''
    if (autoOk) {
      const sent = await sendEmail(p.user_id, { to: b.to, cc: b.cc || undefined, subject: b.subject, body: b.body, attachments: [{ filename: `Invoice-${b.num}.pdf`, contentType: 'application/pdf', base64: b.pdfBase64 }] })
      await sb.from('invoices').update({ status: 'sent', sent_date: b.issue }).eq('id', inv.id)
      detail = `sent to ${b.to}${b.cc ? ` (cc ${b.cc})` : ''} · gmail ${sent.id}`
    } else {
      detail = b.problems.length ? `waiting: ${b.problems.join('; ')}` : 'waiting for approval'
    }
    await sb.from('hosting_log').update({ invoice_id: inv.id, detail }).eq('id', claim!.id)
    await sb.from('hosting_plans').update({ next_date: nextPeriod(p, period), last_invoice_id: inv.id, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', p.id)
    await sb.from('activity_log').insert({ user_id: p.user_id, type: 'invoice', description: autoOk ? `Hosting invoice ${b.num} sent to ${b.client.name} (${money(b.total)})` : `Hosting invoice ${b.num} for ${b.client.name} is ready for your approval`, timestamp: new Date().toISOString() }).then(() => {}, () => {})
    return { status: autoOk ? 'sent' : 'waiting', invoiceId: inv.id, num: b.num, period }
  } catch (e: any) {
    if (!invoiceId) {
      // Nothing was created: release the claim so tomorrow's run tries again
      await sb.from('hosting_log').delete().eq('id', claim!.id)
    } else {
      // The invoice exists but did not go out: it waits in the Hosting page, never re-created
      await sb.from('hosting_log').update({ invoice_id: invoiceId, detail: `send failed: ${String(e?.message || e).slice(0, 300)}` }).eq('id', claim!.id)
      await sb.from('hosting_plans').update({ next_date: nextPeriod(p, period), last_invoice_id: invoiceId, last_run_at: new Date().toISOString() }).eq('id', p.id)
    }
    await sb.from('hosting_log').insert({ user_id: p.user_id, plan_id: p.id, period, kind: 'error', invoice_id: invoiceId, detail: String(e?.message || e).slice(0, 500) })
    return { status: 'error', error: String(e?.message || e), invoiceId, period }
  }
}

/** Daily job: bill every active plan whose send day has arrived (catching up any missed day). */
export async function runHosting() {
  const sb = getAdminClient()
  const t = today()
  const { data: plans } = await sb.from('hosting_plans').select('*').eq('status', 'active')
  const out: any[] = []
  for (const p of (plans || []) as Plan[]) {
    let plan = p
    // At most 2 periods per run so a long gap never fires a burst of invoices
    for (let i = 0; i < 2 && sendDate(plan) <= t; i++) {
      const r = await billPlan(plan)
      out.push({ plan: plan.id, ...r })
      if (r.status === 'already_billed' || r.status === 'error') break
      const { data: fresh } = await sb.from('hosting_plans').select('*').eq('id', plan.id).single()
      if (!fresh) break
      plan = fresh as Plan
    }
  }
  return { date: t, results: out }
}

/** Rebuild a saved hosting invoice (same number, period and date) so the PDF and email match it exactly. */
export async function rebuildSaved(userId: string, invoiceId: string) {
  const sb = getAdminClient()
  const { data: inv } = await sb.from('invoices').select('*').eq('id', invoiceId).eq('user_id', userId).single()
  if (!inv) throw new Error('Invoice not found')
  const n = JSON.parse(inv.notes || '{}')
  if (!n.hosting_plan_id) throw new Error('Not a hosting invoice')
  const { data: plan } = await sb.from('hosting_plans').select('*').eq('id', n.hosting_plan_id).eq('user_id', userId).single()
  if (!plan) throw new Error('Hosting plan not found')
  const b = await buildInvoice({ ...(plan as Plan), next_date: n.hosting_period }, { issueDate: inv.sent_date, num: inv.num })
  return { inv, plan: plan as Plan, n, b }
}

/** Omar approves a waiting hosting invoice: email it from his Gmail now. */
export async function sendWaitingInvoice(userId: string, invoiceId: string, opts: { trustPlan?: boolean } = {}) {
  const sb = getAdminClient()
  const { inv, plan, n, b } = await rebuildSaved(userId, invoiceId)
  if (inv.status !== 'draft') throw new Error(`Invoice ${inv.num} is already ${inv.status}`)
  if (b.problems.length) throw new Error(b.problems.join('; '))
  if (Math.abs(b.total - Number(inv.amount)) > 0.009) throw new Error(`The plan amount changed since this invoice was made (${money(Number(inv.amount))} on the invoice, ${money(b.total)} now). Edit the invoice or plan first.`)
  const sent = await sendEmail(userId, { to: b.to, cc: b.cc || undefined, subject: b.subject, body: b.body, attachments: [{ filename: `Invoice-${b.num}.pdf`, contentType: 'application/pdf', base64: b.pdfBase64 }] })
  await sb.from('invoices').update({ status: 'sent' }).eq('id', inv.id)
  await sb.from('hosting_log').update({ detail: `sent to ${b.to}${b.cc ? ` (cc ${b.cc})` : ''} · approved · gmail ${sent.id}` }).eq('plan_id', plan.id).eq('period', n.hosting_period).eq('kind', 'invoice')
  if (opts.trustPlan) await sb.from('hosting_plans').update({ verified: true, updated_at: new Date().toISOString() }).eq('id', plan.id)
  await sb.from('activity_log').insert({ user_id: userId, type: 'invoice', description: `Hosting invoice ${b.num} sent to ${b.client.name} (${money(b.total)})`, timestamp: new Date().toISOString() }).then(() => {}, () => {})
  return { ok: true, num: b.num, to: b.to }
}
