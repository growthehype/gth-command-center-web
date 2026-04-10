// Vercel Cron — runs every 15 min to tick enabled AI agents
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminClient, createAgentRun, updateAgentRun } from '../_lib/supabase-admin'
import { runAgentTick, type AgentAction } from '../_lib/orchestrator'
import { scrapeLeads } from '../_lib/scraper'
import { qualifyLeads } from '../_lib/qualifier'
import { generateOutreach } from '../_lib/email-generator'
import { sendScheduledEmails } from '../_lib/sender'
import { classifyInbox } from '../_lib/inbox-classifier'

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

// ─── Action Executor ───────────────────────────────────────────

async function executeAction(
  action: AgentAction,
  userId: string,
  runId: string,
  config: any,
): Promise<any> {
  // Keep batch sizes small to stay within Vercel 10s timeout on Hobby
  switch (action.type) {
    case 'classify_inbox':
      return classifyInbox({ userId, agentRunId: runId })

    case 'scrape_leads':
      return scrapeLeads({
        userId,
        agentRunId: runId,
        query: action.params?.query || config?.config?.target_niche || config?.target_niche || 'local businesses',
        location: action.params?.location || config?.config?.target_location || config?.target_location || 'Edmonton, AB',
        agentName: config?.agent_name || null,
        agentType: config?.agent_type || null,
        agentConfigId: config?.id || null,
      })

    case 'qualify_leads':
      return qualifyLeads({
        userId,
        agentRunId: runId,
        agentType: config?.agent_type || 'lead_gen',
        batchSize: 3, // small batch for timeout safety
      })

    case 'generate_emails':
      return generateOutreach({
        userId,
        agentRunId: runId,
        agentType: config?.agent_type || 'lead_gen',
        batchSize: 3,
      })

    case 'send_emails':
      return sendScheduledEmails({ userId, agentRunId: runId })

    default:
      return { skipped: true, reason: `Unknown action: ${action.type}` }
  }
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

      // 2. Run orchestrator to get actions
      const tick = await runAgentTick(cfg.user_id, cfg.agent_type, cfg)

      if (tick.skipped) {
        results.push({
          agentType: cfg.agent_type,
          userId: cfg.user_id,
          action: `skipped — ${tick.reason}`,
        })
        continue
      }

      const runId = tick.runId!
      const actionResults: Record<string, any> = {}

      // 3. Execute each action (with try/catch per action)
      for (const action of tick.actions) {
        try {
          const result = await executeAction(action, cfg.user_id, runId, cfg)
          actionResults[action.type] = result
        } catch (actionErr: any) {
          console.error(`Action ${action.type} failed for user ${cfg.user_id}:`, actionErr)
          actionResults[action.type] = { error: actionErr.message || String(actionErr) }
        }
      }

      // 4. Mark run as completed
      const summary = Object.entries(actionResults)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join('; ')

      await updateAgentRun(runId, {
        status: 'completed',
        summary: summary.slice(0, 2000),
        metadata: actionResults,
      })

      // 5. Update last_run_at on the config
      await sb
        .from('agent_configs')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', cfg.id)

      results.push({
        agentType: cfg.agent_type,
        userId: cfg.user_id,
        action: `executed ${tick.actions.length} actions`,
      })
    }

    return res.status(200).json({ message: 'Cron tick complete', results })
  } catch (err: any) {
    console.error('Cron tick error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
