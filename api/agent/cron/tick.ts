// Vercel Cron — runs every 15 min to tick enabled AI agents
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminClient, createAgentRun, updateAgentRun } from '../_lib/supabase-admin'

/* ------------------------------------------------------------------ */
/*  Cron-to-ms lookup (simple subset used by agent schedules)         */
/* ------------------------------------------------------------------ */
function cronToMs(cron: string): number {
  // Supports: */5 * * * * → every 5 min, */15 * * * * → every 15 min, etc.
  const parts = cron.trim().split(/\s+/)
  const minutePart = parts[0]
  if (minutePart?.startsWith('*/')) {
    const mins = parseInt(minutePart.slice(2), 10)
    if (!isNaN(mins) && mins > 0) return mins * 60 * 1000
  }
  // Fallback: treat as 15 min
  return 15 * 60 * 1000
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ------ Auth: Vercel Cron secret OR manual Bearer token ----------
  const authHeader = req.headers['authorization'] ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const results: Array<{ agentType: string; userId: string; action: string }> = []
  const sb = getAdminClient()

  try {
    // 1. Fetch all enabled agent configs
    const { data: configs, error: cfgErr } = await sb
      .from('agent_configs')
      .select('*')
      .eq('enabled', true)

    if (cfgErr) throw cfgErr
    if (!configs || configs.length === 0) {
      return res.status(200).json({ message: 'No enabled agents', results: [] })
    }

    const now = Date.now()

    for (const cfg of configs) {
      const intervalMs = cronToMs(cfg.schedule_cron ?? '*/15 * * * *')
      const lastRun = cfg.last_run_at ? new Date(cfg.last_run_at).getTime() : 0
      const elapsed = now - lastRun

      if (elapsed < intervalMs) {
        results.push({
          agentType: cfg.agent_type,
          userId: cfg.user_id,
          action: 'skipped — not enough time elapsed',
        })
        continue
      }

      // 2. Create agent_runs record (status: running)
      const runId = await createAgentRun({
        user_id: cfg.user_id,
        agent_type: cfg.agent_type,
        status: 'running',
        trigger: 'scheduled',
        metadata: { config_id: cfg.id },
      })

      // 3. Phase 1: Log what WOULD happen (orchestrator placeholder)
      const summary = `[Phase 1 dry-run] Agent "${cfg.agent_type}" for user ${cfg.user_id} would execute. Config: ${JSON.stringify(cfg.config ?? {})}`
      console.log(summary)

      // 4. Mark run as completed
      await updateAgentRun(runId, { status: 'completed', summary })

      // 5. Update last_run_at on the config
      await sb
        .from('agent_configs')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', cfg.id)

      results.push({
        agentType: cfg.agent_type,
        userId: cfg.user_id,
        action: 'success (dry-run)',
      })
    }

    return res.status(200).json({ message: 'Cron tick complete', results })
  } catch (err: any) {
    console.error('Cron tick error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
