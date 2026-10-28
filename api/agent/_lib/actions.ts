// One place that turns an orchestrator action into real work, shared by the
// manual "Run now" endpoint and the daily cron.
import type { AgentAction } from './orchestrator'
import { scrapeLeads, scrapeRotation } from './scraper'
import { qualifyLeads } from './qualifier'
import { generateOutreach } from './email-generator'
import { sendScheduledEmails } from './sender'
import { classifyInbox } from './inbox-classifier'
import { isGthAgent } from './gth-profile'

export const ACTION_BUDGET_MS: Record<string, number> = {
  classify_inbox: 25_000,
  scrape_leads: 70_000,
  // GTH v2 opens each site in Lighthouse and has Claude look at it, so it needs longer
  qualify_leads: 150_000,
  generate_emails: 110_000,
  send_emails: 30_000,
}

export async function executeAgentAction(
  action: AgentAction,
  userId: string,
  runId: string,
  config: any,
): Promise<any> {
  const inner = config?.config || {}
  switch (action.type) {
    case 'classify_inbox':
      return classifyInbox({ userId, agentRunId: runId })

    case 'scrape_leads':
      if (isGthAgent(config) || Array.isArray(inner.search_terms)) {
        return scrapeRotation({ userId, agentRunId: runId, agentConfig: config, deadlineMs: ACTION_BUDGET_MS.scrape_leads })
      }
      return scrapeLeads({
        userId,
        agentRunId: runId,
        query: action.params?.query || inner.target_industries || inner.target_niche || config?.target_niche || 'local businesses',
        location: action.params?.location || inner.target_location || config?.target_location || 'Edmonton, AB',
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
        batchSize: isGthAgent(config) ? 16 : 14,
        agentConfig: config,
        // Leave headroom so the last leads in flight finish inside the action budget
        deadlineMs: ACTION_BUDGET_MS.qualify_leads - 5_000,
      })

    case 'generate_emails':
      return generateOutreach({
        userId,
        agentRunId: runId,
        agentType: config?.agent_type || 'lead_gen',
        agentConfig: config,
      })

    case 'send_emails':
      return sendScheduledEmails({
        userId,
        agentRunId: runId,
        dailyLimit: Number(inner.daily_email_limit) || undefined,
        cfgInner: inner,
      })

    default:
      return { skipped: true, reason: `Unknown action: ${action.type}` }
  }
}

/** Run actions in order with per-action timeouts and an overall deadline. */
export async function runActions(
  actions: AgentAction[],
  userId: string,
  runId: string,
  config: any,
  totalBudgetMs = 280_000,
): Promise<{ results: Record<string, any>; timings: Record<string, number> }> {
  const results: Record<string, any> = {}
  const timings: Record<string, number> = {}
  const deadline = Date.now() + totalBudgetMs

  for (const action of actions) {
    const left = deadline - Date.now()
    if (left < 8_000) {
      results[action.type] = { skipped: true, reason: 'out of time this run, will continue next run' }
      continue
    }
    const budget = Math.min(ACTION_BUDGET_MS[action.type] ?? 30_000, left - 4_000)
    const t0 = Date.now()
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${action.type} ran past ${Math.round(budget / 1000)}s, continuing next run`)), budget)
      })
      results[action.type] = await Promise.race([executeAgentAction(action, userId, runId, config), timeout])
      if (timer) clearTimeout(timer)
    } catch (err: any) {
      results[action.type] = { error: String(err?.message || err).slice(0, 500) }
    }
    timings[action.type] = Date.now() - t0
  }
  return { results, timings }
}

/** Human summary for the run log and the Agents page. */
export function summariseRun(results: Record<string, any>): string {
  const parts: string[] = []
  const s = results.scrape_leads
  if (s && !s.error) parts.push(`${s.leadsNew ?? 0} new leads${s.note ? ` (${s.note})` : ''}`)
  const q = results.qualify_leads
  if (q && !q.error) parts.push(`${q.qualified ?? 0} scored`)
  const g = results.generate_emails
  if (g && !g.error) parts.push(`${g.sequencesCreated ?? 0} drafts ready`)
  const e = results.send_emails
  if (e && !e.error) parts.push(`${e.sent ?? 0} sent`)
  const c = results.classify_inbox
  if (c && !c.error && c.replies) parts.push(`${c.replies} replies`)
  const errs = Object.entries(results).filter(([, v]) => v?.error).map(([k]) => k)
  if (errs.length) parts.push(`issues: ${errs.join(', ')}`)
  return parts.join(' · ') || 'Nothing to do'
}
