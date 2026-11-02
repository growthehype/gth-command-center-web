// Hosting billing endpoint.
//  - Daily Supabase cron (x-agent-token): { run: true } bills every plan that is due.
//  - Omar's app (his session): preview the next invoice, approve a waiting one, or bill a plan now.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from './agent/_lib/supabase-admin'
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
    if (body.preview) {
      const { data: plan } = await sb.from('hosting_plans').select('*').eq('id', String(body.preview)).single()
      if (!plan) return res.status(404).json({ error: 'Plan not found' })
      const b = await buildInvoice(plan as Plan)
      return res.status(200).json({ num: b.num, to: b.to, cc: b.cc, subject: b.subject, body: b.body, total: b.total, due: b.due, issue: b.issue, problems: b.problems, pdfBytes: b.pdfBase64.length })
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
