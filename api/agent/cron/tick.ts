// Vercel Cron: runs once each weekday morning (see vercel.json) and works
// every enabled agent through the full pipeline.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminClient, updateAgentRun } from '../_lib/supabase-admin'
import { runAgentTick } from '../_lib/orchestrator'
import { runActions, summariseRun } from '../_lib/actions'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'] ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET is not configured' })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const sb = getAdminClient()
  const results: Array<{ agent: string; outcome: string }> = []
  const started = Date.now()
  const TOTAL_BUDGET = 285_000

  try {
    const { data: configs, error: cfgErr } = await sb
      .from('agent_configs')
      .select('*')
      .eq('enabled', true)
      .order('created_at', { ascending: true })

    if (cfgErr) throw cfgErr
    if (!configs || configs.length === 0) {
      return res.status(200).json({ message: 'No enabled agents', results: [] })
    }

    for (const cfg of configs) {
      const label = cfg.agent_name || cfg.agent_type
      const left = TOTAL_BUDGET - (Date.now() - started)
      if (left < 30_000) {
        results.push({ agent: label, outcome: 'skipped, out of time for this tick' })
        continue
      }

      const tick = await runAgentTick(cfg.user_id, cfg.agent_type, cfg)
      if (tick.skipped) {
        results.push({ agent: label, outcome: `skipped, ${tick.reason}` })
        continue
      }

      const runId = tick.runId!
      // Share the remaining time between the agents still to run
      const remainingAgents = configs.length - configs.indexOf(cfg)
      const budget = Math.max(30_000, Math.floor(left / remainingAgents))
      const { results: actionResults, timings } = await runActions(tick.actions, cfg.user_id, runId, cfg, budget)
      const summaryText = summariseRun(actionResults)
      const hadErrors = Object.values(actionResults).some((v: any) => v?.error)

      await updateAgentRun(runId, {
        status: hadErrors ? 'partial' : 'completed',
        summary: summaryText,
        metadata: actionResults,
      })

      await sb
        .from('agent_configs')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: hadErrors ? 'partial' : 'completed',
          last_run_summary: summaryText.slice(0, 500),
          last_run_duration_ms: Object.values(timings).reduce((a, b) => a + b, 0),
          last_run_metadata: {
            ...(cfg.last_run_metadata || {}),
            last_scrape: actionResults.scrape_leads && !actionResults.scrape_leads.error
              ? new Date().toISOString()
              : (cfg.last_run_metadata?.last_scrape || null),
          },
        })
        .eq('id', cfg.id)

      results.push({ agent: label, outcome: summaryText })
    }

    return res.status(200).json({ message: 'Cron tick complete', results })
  } catch (err: any) {
    console.error('Cron tick error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
