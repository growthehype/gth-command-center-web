// Homepage concepts for hot leads. Each call does the next stage for a lead
// (kit, page, review and publish). Omar's app calls it with his session to
// build or rebuild one lead's concept; a Supabase cron job calls it with the
// agent token to work through hot leads in the background.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from './_lib/supabase-admin'
import { advancePreview, leadsNeedingPreview } from './_lib/preview'

const BUDGET_MS = Number(process.env.PREVIEW_BUDGET_MS) || 740_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const started = Date.now()
  const deadline = started + BUDGET_MS
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const sb = getAdminClient()

  // Background: Supabase cron with the agent token
  const agentToken = String(req.headers['x-agent-token'] || '')
  if (agentToken) {
    const { data: ok } = await sb.rpc('agent_hunt_token_ok', { t: agentToken })
    if (ok !== true) return res.status(401).json({ error: 'Unauthorized' })
    const { data: configs } = await sb.from('agent_configs').select('id, agent_name, config').eq('enabled', true)
    const agents = (configs || []).filter((c: any) => c.config?.profile === 'gth' && c.config?.build_previews !== false)
    const done: any[] = []
    for (const a of agents) {
      const leads = await leadsNeedingPreview(a.id, 3)
      for (const l of leads) {
        // A page draft takes several minutes; only start a stage with room left
        if (Date.now() > started + BUDGET_MS * 0.35 && done.length) break
        const s = await advancePreview(l.id, { deadline })
        done.push({ lead: l.name, status: s.status, error: s.error || null })
        if (s.status !== 'ready' && s.status !== 'failed') break // one lead at a time
      }
    }
    return res.status(200).json({ ok: true, done })
  }

  // Omar, from the app
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) return res.status(500).json({ error: 'Supabase not configured' })
  const { data: { user } } = await createClient(url, anon).auth.getUser(auth.slice(7))
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { leadId, rebuild, feedback } = (req.body ?? {}) as { leadId?: string; rebuild?: boolean; feedback?: string }
  if (!leadId) return res.status(400).json({ error: 'leadId required' })
  const { data: lead } = await sb.from('outreach_leads').select('id, user_id').eq('id', leadId).single()
  if (!lead || lead.user_id !== user.id) return res.status(404).json({ error: 'Lead not found' })
  try {
    const notes = typeof feedback === 'string' && feedback.trim() ? feedback.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 12) : undefined
    const state = await advancePreview(leadId, { deadline, rebuild: !!rebuild, feedback: notes })
    return res.status(200).json({ ok: true, preview: state })
  } catch (err: any) {
    return res.status(500).json({ error: String(err?.message || err).slice(0, 300) })
  }
}
