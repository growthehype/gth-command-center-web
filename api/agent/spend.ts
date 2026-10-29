// Vercel Spend Management webhook. Vercel calls this at 50%, 75% and 100% of
// the On-Demand Budget. Instead of waiting for Vercel to pause the whole CRM,
// we scale back the expensive background work first:
//   50%: lean mode, lead hunting runs one shift a day, concept builds stop
//   75%: background hunting and concept builds stop; Gmail tracking keeps running
// Everything returns to normal on the first of the next month.
// The URL carries its own key as ?key=... (Vault secret spend_webhook_key).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminClient } from './_lib/supabase-admin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const sb = getAdminClient()
  const key = String(req.query.key || '')
  const { data: ok } = await sb.rpc('spend_key_ok', { t: key })
  if (ok !== true) return res.status(401).json({ error: 'Unauthorized' })

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {}
  const pct = Number(body.thresholdPercent) || (body.budgetAmount ? Math.round((Number(body.currentSpend) / Number(body.budgetAmount)) * 100) : 0)
  const level = pct >= 75 ? 'off' : pct >= 50 ? 'lean' : null
  const month = new Date().toISOString().slice(0, 7)
  const note = `Vercel spend at ${pct}% of the $${body.budgetAmount ?? '?'} on-demand budget (${month}). ` +
    (level === 'off' ? 'Background hunting and concept builds paused until next month. Gmail tracking still runs.'
      : level === 'lean' ? 'Lean mode: hunting one shift a day, concept builds paused until next month.' : 'No change.')

  const { data: cfgs } = await sb.from('agent_configs').select('id, config').eq('enabled', true)
  for (const c of cfgs || []) {
    if ((c.config as any)?.profile !== 'gth') continue
    const config = { ...(c.config as any), spend_alert: { pct, level, month, at: new Date().toISOString(), budget: body.budgetAmount ?? null, spend: body.currentSpend ?? null } }
    await sb.from('agent_configs').update({ config, last_run_summary: note }).eq('id', c.id)
  }
  return res.status(200).json({ ok: true, pct, level })
}
