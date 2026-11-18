// Hosting billing endpoint.
//  - Daily Supabase cron (x-agent-token): { run: true } bills every plan that is due.
//  - Omar's app (his session): preview the next invoice, approve a waiting one, or bill a plan now.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from './agent/_lib/supabase-admin'
import { createDraft } from './agent/_lib/gmail-server'
import { generateInvoicePDF } from './agent/_lib/invoice-pdf'
import { runCalendarTime } from './agent/_lib/calendar-time'
import { runInboxTasks } from './agent/_lib/inbox-tasks'
import { runHosting, buildInvoice, billPlan, sendWaitingInvoice, rebuildSaved, type Plan } from './agent/_lib/hosting'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const sb = getAdminClient()
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {}

  const agentToken = String(req.headers['x-agent-token'] || '')
  if (agentToken) {
    const { data: ok } = await sb.rpc('agent_hunt_token_ok', { t: agentToken })
    if (ok !== true) return res.status(401).json({ error: 'Unauthorized' })
    if (body.run) return res.status(200).json(await runHosting())
    // Hourly: client emails that ask for something become CRM tasks
    if (body.inboxTasks) {
      // Scheduled runs pass the Edmonton hours they should run at (9 am, 5 pm, 9 pm), so it stays right through daylight saving
      if (Array.isArray(body.hours)) {
        const h = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
        if (!body.hours.map(Number).includes(h)) return res.status(200).json({ skipped: true, hour: h })
      }
      const inbox = await runInboxTasks({ days: Number(body.days) || 2 })
      const meetings = await runCalendarTime({ days: 2 }).catch((e: any) => ({ error: String(e?.message || e) }))
      return res.status(200).json({ inbox, meetings })
    }
    // Send one waiting hosting invoice that Omar approved in chat (hosting invoices only)
    if (body.sendWaiting) {
      const { data: inv } = await sb.from('invoices').select('user_id').eq('id', String(body.sendWaiting)).single()
      if (!inv) return res.status(404).json({ error: 'Invoice not found' })
      return res.status(200).json(await sendWaitingInvoice(inv.user_id, String(body.sendWaiting), { trustPlan: true }))
    }
    // Preview a saved hosting invoice's email exactly as it would go out
    if (body.previewSaved) {
      const { data: inv } = await sb.from('invoices').select('user_id').eq('id', String(body.previewSaved)).single()
      if (!inv) return res.status(404).json({ error: 'Invoice not found' })
      const { b } = await rebuildSaved(inv.user_id, String(body.previewSaved))
      return res.status(200).json({ to: b.to, cc: b.cc, subject: b.subject, body: b.body, total: b.total, problems: b.problems })
    }
    // Self-check of the Claude work clock: start, wait, log, then remove the test entry
    if (body.selfTest === 'timing') {
      const { callTool } = await import('./agent/_lib/crm-tools')
      const { data: owner } = await sb.from('integrations').select('user_id').eq('provider', 'gmail').limit(1).maybeSingle()
      const uid = owner!.user_id
      const { data: cl } = await sb.from('clients').select('name').eq('user_id', uid).eq('status', 'active').limit(1).single()
      const s1: any = await callTool(uid, 'start_work', { client: cl!.name, description: 'Clock self-test' })
      await new Promise(r => setTimeout(r, 4000))
      const l1 = await callTool(uid, 'log_work', { kind: 'claude', work_id: s1.work_id, description: 'Clock self-test', human_hours: 0.5 })
      const s2 = await callTool(uid, 'start_work', { work_id: s1.work_id })
      await new Promise(r => setTimeout(r, 2000))
      const l2 = await callTool(uid, 'log_work', { kind: 'claude', work_id: s1.work_id, description: 'Clock self-test round 2', human_hours: 0.5 })
      const { data: row } = await sb.from('time_entries').select('id, duration_minutes, timing, segments').eq('work_id', s1.work_id).single()
      await sb.from('time_entries').delete().eq('id', row!.id)
      await sb.from('activity_log').delete().eq('entity_id', row!.id)
      return res.status(200).json({ s1, l1, s2, l2, row })
    }
    // Log finished client meetings from Google Calendar as time (backfill with days)
    if (body.calendarTime) return res.status(200).json(await runCalendarTime({ days: Number(body.days) || 2 }))
    if (body.preview) {
      const { data: plan } = await sb.from('hosting_plans').select('*').eq('id', String(body.preview)).single()
      if (!plan) return res.status(404).json({ error: 'Plan not found' })
      const b = await buildInvoice(plan as Plan)
      return res.status(200).json({ num: b.num, to: b.to, cc: b.cc, subject: b.subject, body: b.body, total: b.total, due: b.due, issue: b.issue, problems: b.problems, pdfBytes: b.pdfBase64.length })
    }
    // Put any saved CRM invoice into Omar's Gmail drafts with its PDF attached (never sends)
    if (body.draftInvoice) {
      const { data: inv } = await sb.from('invoices').select('*').eq('id', String(body.draftInvoice)).single()
      if (!inv) return res.status(404).json({ error: 'Invoice not found' })
      const { data: cl } = await sb.from('clients').select('name, email').eq('id', inv.client_id).single()
      const n = JSON.parse(inv.notes || '{}')
      const pdf = generateInvoicePDF({
        invoiceNum: inv.num, date: inv.sent_date, dueDate: inv.due_date, fromName: n.from_name, fromEmail: n.from_email, fromPhone: n.from_phone,
        fromAddress: n.from_address, fromWebsite: n.from_website, gstNumber: n.gst_number, clientName: cl?.name || '', clientEmail: cl?.email || '',
        clientPhone: n.client_phone || undefined, clientAddress: n.client_address || undefined, clientContactName: n.client_contact_name || undefined,
        lineItems: n.line_items || [], taxRate: Number(n.tax_rate) || 0, taxLabel: n.tax_label, currency: n.currency, paymentTerms: n.payment_terms,
        paymentInstructions: n.payment_instructions, memo: n.memo || '', termsText: n.terms_text || undefined,
      } as any)
      const d = await createDraft(inv.user_id, {
        to: String(body.to || cl?.email || ''), cc: body.cc ? String(body.cc) : undefined, subject: String(body.subject || `Invoice ${inv.num}`), body: String(body.body || ''),
        attachments: [{ filename: `Invoice-${inv.num}.pdf`, contentType: 'application/pdf', base64: Buffer.from(pdf.output('arraybuffer')).toString('base64') }],
      })
      return res.status(200).json({ ok: true, draftId: d.draftId })
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  const { data: { user } } = await createClient(url, anon).auth.getUser(auth.slice(7))
  if (!user) return res.status(401).json({ error: 'Invalid session' })

  try {
    const loadPlan = async (id: string) => {
      const { data } = await sb.from('hosting_plans').select('*').eq('id', String(id)).eq('user_id', user.id).single()
      if (!data) throw new Error('Hosting plan not found')
      return data as Plan
    }
    if (body.action === 'preview') {
      const b = await buildInvoice(await loadPlan(body.planId))
      return res.status(200).json({ num: b.num, to: b.to, cc: b.cc, subject: b.subject, body: b.body, total: b.total, tax: b.tax, due: b.due, issue: b.issue, label: b.label, problems: b.problems, pdfBase64: b.pdfBase64 })
    }
    if (body.action === 'preview_invoice') {
      const { b } = await rebuildSaved(user.id, String(body.invoiceId))
      return res.status(200).json({ num: b.num, to: b.to, cc: b.cc, subject: b.subject, body: b.body, total: b.total, tax: b.tax, due: b.due, issue: b.issue, label: b.label, problems: b.problems, pdfBase64: b.pdfBase64 })
    }
    if (body.action === 'send') {
      return res.status(200).json(await sendWaitingInvoice(user.id, String(body.invoiceId), { trustPlan: !!body.trustPlan }))
    }
    if (body.action === 'bill_now') {
      return res.status(200).json(await billPlan(await loadPlan(body.planId), { forceDraft: true }))
    }
    return res.status(400).json({ error: 'Unknown action' })
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) })
  }
}
