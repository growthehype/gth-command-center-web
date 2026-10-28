// Background lead hunting. Called every 20 minutes by a Supabase pg_cron job,
// around the clock, for every enabled agent that has background hunting on.
// Each call: check businesses not yet looked at, search for more when the
// queue runs dry, then write emails for anything that reached 60+.
// Auth: the x-agent-token header must match a secret kept in Supabase Vault.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminClient, createAgentRun, updateAgentRun } from '../_lib/supabase-admin'
import { huntLeads } from '../_lib/qualifier'
import { generateOutreach } from '../_lib/email-generator'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sb = getAdminClient()
  const token = String(req.headers['x-agent-token'] || '')
  if (!token || token.length < 32) return res.status(401).json({ error: 'Unauthorized' })

  const { data: secret } = await sb.rpc('agent_hunt_token_ok', { t: token })
  if (secret !== true) return res.status(401).json({ error: 'Unauthorized' })

  const started = Date.now()
  const { data: configs } = await sb.from('agent_configs').select('*').eq('enabled', true)
  const agents = (configs || []).filter((c: any) => c.config?.profile === 'gth' && c.config?.background_hunt !== false)
  const out: any[] = []

  for (const cfg of agents) {
    const left = 270_000 - (Date.now() - started)
    if (left < 100_000) break
    const runId = await createAgentRun({ user_id: cfg.user_id, agent_type: cfg.agent_type, agent_config_id: cfg.id, trigger: 'cron' }).catch(() => null)
    try {
      const h = await huntLeads({ userId: cfg.user_id, agentConfig: cfg, deadlineMs: Math.min(185_000, left - 80_000), target: 50 })
      let drafted = 0
      if (Date.now() - started < 230_000) {
        const g: any = await generateOutreach({ userId: cfg.user_id, agentRunId: runId as any, agentType: cfg.agent_type, agentConfig: cfg }).catch(() => null)
        drafted = g?.sequencesCreated || 0
      }
      const text = `Background: checked ${h.screened}, ${h.qualified} qualified at 60+, ${drafted} emails written${h.newFound ? `, ${h.newFound} new businesses found` : ''}`
      if (runId) await updateAgentRun(runId, { status: 'completed', summary: { text, hunt: h, drafted } })
      await sb.from('agent_configs').update({ last_run_at: new Date().toISOString(), last_run_status: 'completed', last_run_summary: text }).eq('id', cfg.id)
      out.push({ agent: cfg.agent_name, ...h, drafted })
    } catch (err: any) {
      if (runId) await updateAgentRun(runId, { status: 'failed', error: String(err?.message || err).slice(0, 300) })
      out.push({ agent: cfg.agent_name, error: String(err?.message || err).slice(0, 200) })
    }
  }
  return res.status(200).json({ ok: true, results: out })
}
