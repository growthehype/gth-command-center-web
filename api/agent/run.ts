// Manual trigger — POST to run an agent on demand
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAgentConfig, getAgentConfigById, updateAgentRun } from './_lib/supabase-admin'
import { runAgentTick, type AgentAction } from './_lib/orchestrator'
import { scrapeLeads } from './_lib/scraper'
import { qualifyLeads } from './_lib/qualifier'
import { generateOutreach } from './_lib/email-generator'
import { sendScheduledEmails } from './_lib/sender'
import { classifyInbox } from './_lib/inbox-classifier'

// ─── Action Executor ───────────────────────────────────────────

async function executeAction(
  action: AgentAction,
  userId: string,
  runId: string,
  config: any,
): Promise<any> {
  switch (action.type) {
    case 'classify_inbox':
      return classifyInbox({ userId, agentRunId: runId })

    case 'scrape_leads':
      return scrapeLeads({
        userId,
        agentRunId: runId,
        query:
          action.params?.query ||
          config?.config?.target_industries ||
          config?.config?.target_niche ||
          config?.target_niche ||
          'local businesses',
        location:
          action.params?.location ||
          config?.config?.target_location ||
          config?.target_location ||
          'Edmonton, AB',
        agentName: config?.agent_name || null,
        agentType: config?.agent_type || null,
        agentConfigId: config?.id || null,
        agentConfig: config,
      })

    case 'qualify_leads':
      return qualifyLeads({
        userId,
        agentRunId: runId,
        agentType: config?.agent_type || 'lead_gen',
        batchSize: 25,
        agentConfig: config,
      })

    case 'generate_emails':
      return generateOutreach({
        userId,
        agentRunId: runId,
        agentType: config?.agent_type || 'lead_gen',
        batchSize: 25,
        agentConfig: config,
      })

    case 'send_emails':
      return sendScheduledEmails({ userId, agentRunId: runId })

    default:
      return { skipped: true, reason: `Unknown action: ${action.type}` }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ------ Step tracker so the response tells us WHERE it blew up ----
  let step = 'init'

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    step = 'parse_body'
    const { agentType, userId, configId } = (req.body ?? {}) as any

    if (!agentType || !userId) {
      return res.status(400).json({ error: 'Missing agentType or userId', step })
    }

    const validTypes = ['lead_gen', 'sales', 'client']
    if (!validTypes.includes(agentType)) {
      return res.status(400).json({
        error: `Invalid agentType. Must be one of: ${validTypes.join(', ')}`,
        step,
      })
    }

    // 1. Read agent config — prefer exact configId (needed for client agents
    //    where multiple rows share agent_type='client')
    step = 'load_config'
    const cfg = configId
      ? await getAgentConfigById(configId)
      : await getAgentConfig(userId, agentType)
    if (!cfg) {
      return res.status(404).json({ error: 'Agent config not found', step })
    }
    if (cfg.user_id !== userId) {
      return res.status(403).json({ error: 'Config does not belong to this user', step })
    }

    // 2. Run orchestrator to determine actions
    //    Mark as manual so the working-hours gate is bypassed.
    step = 'orchestrator_tick'
    const tick = await runAgentTick(userId, cfg.agent_type, { ...cfg, __manualTrigger: true })

    if (tick.skipped) {
      return res.status(200).json({
        runId: tick.runId,
        status: 'skipped',
        reason: tick.reason,
      })
    }

    const runId = tick.runId!

    // 3. Stamp the run as manual
    step = 'stamp_manual'
    try {
      await updateAgentRun(runId, {
        metadata: { trigger: 'manual', config_id: cfg.id, agent_name: cfg.agent_name || null },
      })
    } catch (stampErr: any) {
      console.error('stamp_manual failed (non-fatal):', stampErr)
    }

    // 4. Execute each action in order, with a HARD per-action timeout
    //    so one hanging action (e.g. a website that never responds) can't
    //    blow the whole Vercel function budget.
    step = 'execute_actions'
    const actionResults: Record<string, any> = {}
    const actionTimings: Record<string, number> = {}

    const HARD_TIMEOUT_MS: Record<string, number> = {
      classify_inbox: 20_000,
      scrape_leads: 60_000,
      qualify_leads: 60_000,
      generate_emails: 60_000,
      send_emails: 30_000,
    }

    for (const action of tick.actions) {
      const t0 = Date.now()
      const budget = HARD_TIMEOUT_MS[action.type] ?? 30_000
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`action ${action.type} exceeded ${budget}ms hard timeout`)), budget)
        )
        const result = await Promise.race([
          executeAction(action, userId, runId, cfg),
          timeoutPromise,
        ])
        actionResults[action.type] = result
      } catch (actionErr: any) {
        console.error(`Action ${action.type} failed:`, actionErr)
        actionResults[action.type] = {
          error: (actionErr.message || String(actionErr)).slice(0, 500),
        }
      }
      actionTimings[action.type] = Date.now() - t0
    }

    // 5. Mark run as completed
    step = 'finalize_run'
    const summary = Object.entries(actionResults)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('; ')

    try {
      await updateAgentRun(runId, {
        status: 'completed',
        summary: summary.slice(0, 2000),
        metadata: actionResults,
      })
    } catch (finErr: any) {
      console.error('finalize_run failed (non-fatal):', finErr)
    }

    return res.status(200).json({
      runId,
      status: 'completed',
      actions: tick.actions.map(a => a.type),
      results: actionResults,
      timings: actionTimings,
    })
  } catch (err: any) {
    console.error(`Agent run error at step=${step}:`, err)
    return res.status(500).json({
      error: err?.message || 'Internal error',
      step,
      details: err?.details || err?.hint || null,
      code: err?.code || null,
      stack: (err?.stack || '').toString().split('\n').slice(0, 8).join('\n'),
    })
  }
}
