// The brain that decides what to run and when
import { getAgentConfig, createAgentRun, updateAgentRun } from './supabase-admin'
import { checkRateLimit, DEFAULT_LIMITS } from './rate-limiter'

// ─── Types ──────────────────────────────────────────────────────

export type ActionType =
  | 'classify_inbox'
  | 'scrape_leads'
  | 'qualify_leads'
  | 'generate_emails'
  | 'send_emails'

export interface AgentAction {
  type: ActionType
  priority: number // 1 = highest
  params?: Record<string, any>
}

interface TickResult {
  runId: string | null
  actions: AgentAction[]
  skipped: boolean
  reason?: string
}

// ─── Working Hours ──────────────────────────────────────────────

export function isWithinWorkingHours(config?: any): boolean {
  // Look in either the top-level config row or its nested `config` JSONB
  const inner = config?.config || {}

  // working_hours_start/end may be a number (9) or a string ("09:00")
  function parseHour(v: any, fallback: number): number {
    if (v == null) return fallback
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const h = parseInt(v.split(':')[0], 10)
      return isNaN(h) ? fallback : h
    }
    return fallback
  }

  const startHour = parseHour(inner.working_hours_start ?? config?.working_hours_start, 9)
  const endHour = parseHour(inner.working_hours_end ?? config?.working_hours_end, 18)
  const timezone = inner.timezone ?? config?.timezone ?? 'America/Edmonton'

  const now = new Date()
  // Get current hour in the configured timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  })
  const currentHour = parseInt(formatter.format(now), 10)

  // Also check day of week (skip weekends by default unless configured)
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  })
  const dayOfWeek = dayFormatter.format(now)
  const skipWeekends = (inner.skip_weekends ?? config?.skip_weekends) !== false // default true
  if (skipWeekends && (dayOfWeek === 'Sat' || dayOfWeek === 'Sun')) {
    return false
  }

  // Manual triggers should ALWAYS be allowed regardless of clock
  if (config?.__manualTrigger === true) return true

  return currentHour >= startHour && currentHour < endHour
}

// ─── Determine Next Actions ─────────────────────────────────────

export function getNextActions(
  agentType: string,
  config: any,
  lastRun: any,
): AgentAction[] {
  switch (agentType) {
    case 'lead_gen':
    case 'client':
      return getLeadGenActions(config, lastRun)
    case 'sales':
      return getSalesActions(config, lastRun)
    default:
      return []
  }
}

function getLeadGenActions(config: any, lastRun: any): AgentAction[] {
  const actions: AgentAction[] = []
  const inner = config?.config || {}

  // 1. Always check inbox first for replies
  actions.push({ type: 'classify_inbox', priority: 1 })

  // 2. Scrape new leads if enough time has passed
  const hoursSinceLastScrape = lastRun?.last_scrape
    ? (Date.now() - new Date(lastRun.last_scrape).getTime()) / (1000 * 60 * 60)
    : Infinity

  // Manual triggers ignore the cooldown
  const isManual = config?.__manualTrigger === true
  const scrapeIntervalHours = inner.scrape_interval_hours ?? config?.scrape_interval_hours ?? 24
  if (isManual || hoursSinceLastScrape >= scrapeIntervalHours) {
    actions.push({
      type: 'scrape_leads',
      priority: 2,
      params: {
        query:
          inner.target_industries ||
          inner.target_niche ||
          inner.target_audience ||
          config?.target_niche,
        location: inner.target_location || config?.target_location,
      },
    })
  }

  // 3. Qualify unscored leads
  actions.push({ type: 'qualify_leads', priority: 3 })

  // 4. Generate email drafts for qualified leads
  actions.push({ type: 'generate_emails', priority: 4 })

  // 5. Send scheduled/approved emails
  actions.push({ type: 'send_emails', priority: 5 })

  return actions.sort((a, b) => a.priority - b.priority)
}

function getSalesActions(config: any, _lastRun: any): AgentAction[] {
  const actions: AgentAction[] = [
    { type: 'classify_inbox', priority: 1 },
    { type: 'generate_emails', priority: 2 },
    { type: 'send_emails', priority: 3 },
  ]
  return actions
}

// ─── Main Orchestrator Tick ─────────────────────────────────────

export async function runAgentTick(
  userId: string,
  agentType: string,
  config?: any,
): Promise<TickResult> {
  // 1. Load config from DB if not provided
  const agentConfig = config || await getAgentConfig(userId, agentType)
  if (!agentConfig || agentConfig.enabled === false) {
    return { runId: null, actions: [], skipped: true, reason: 'Agent disabled or not configured' }
  }

  // 2. Check working hours
  if (!isWithinWorkingHours(agentConfig)) {
    return { runId: null, actions: [], skipped: true, reason: 'Outside working hours' }
  }

  // 3. Check rate limits
  const emailLimit = await checkRateLimit(userId, 'email_send', agentConfig.max_emails_per_day ?? DEFAULT_LIMITS.email_send)
  const claudeLimit = await checkRateLimit(userId, 'claude_call', agentConfig.max_claude_calls_per_day ?? DEFAULT_LIMITS.claude_call)

  if (!claudeLimit.allowed) {
    return { runId: null, actions: [], skipped: true, reason: `Claude API rate limit reached (${claudeLimit.used}/${claudeLimit.limit})` }
  }

  // 4. Create a run record
  const runId = await createAgentRun({
    user_id: userId,
    agent_type: agentType,
    agent_config_id: agentConfig.id || null,
    status: 'running',
    trigger: agentConfig.__manualTrigger ? 'manual' : 'cron',
    metadata: {
      email_budget_remaining: emailLimit.remaining,
      claude_budget_remaining: claudeLimit.remaining,
      agent_name: agentConfig.agent_name || null,
    },
  })

  // 5. Determine actions
  const lastRunMeta = agentConfig.last_run_metadata || null
  const actions = getNextActions(agentType, agentConfig, lastRunMeta)

  // Filter out email send actions if rate-limited
  const filteredActions = actions.filter(a => {
    if (a.type === 'send_emails' && !emailLimit.allowed) {
      return false
    }
    return true
  })

  // 6. If no actions remain, mark as completed
  if (filteredActions.length === 0) {
    await updateAgentRun(runId, {
      status: 'completed',
      summary: 'No actions needed or all rate-limited',
    })
    return { runId, actions: [], skipped: true, reason: 'No actionable items' }
  }

  return { runId, actions: filteredActions, skipped: false }
}
