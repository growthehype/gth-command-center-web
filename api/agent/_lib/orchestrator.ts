// The brain that decides what to run and when
import { getAgentConfig, createAgentRun, updateAgentRun } from './supabase-admin'
import { checkRateLimit, DEFAULT_LIMITS } from './rate-limiter'

// ─── Types ──────────────────────────────────────────────────────

export interface AgentAction {
  type: 'scrape_leads' | 'qualify_leads' | 'send_cold_emails' | 'check_inbox' | 'classify_replies' | 'send_followups' | 'send_sales_emails'
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
  // Default: 9 AM - 6 PM MST (UTC-7)
  const startHour = config?.working_hours_start ?? 9
  const endHour = config?.working_hours_end ?? 18
  const timezone = config?.timezone ?? 'America/Edmonton'

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
  const skipWeekends = config?.skip_weekends !== false // default true
  if (skipWeekends && (dayOfWeek === 'Sat' || dayOfWeek === 'Sun')) {
    return false
  }

  return currentHour >= startHour && currentHour < endHour
}

// ─── Determine Next Actions ─────────────────────────────────────

export function getNextActions(
  agentType: string,
  config: any,
  lastRun: any,
): AgentAction[] {
  switch (agentType) {
    case 'outbound_lead_gen':
      return getOutboundActions(config, lastRun)
    case 'inbound_reply_handler':
      return getInboundActions(config, lastRun)
    case 'sales_crm':
      return getSalesActions(config, lastRun)
    default:
      return []
  }
}

function getOutboundActions(config: any, lastRun: any): AgentAction[] {
  const actions: AgentAction[] = []

  // Always check inbox first for replies
  actions.push({ type: 'check_inbox', priority: 1 })
  actions.push({ type: 'classify_replies', priority: 2 })

  // If we haven't scraped recently, scrape new leads
  const hoursSinceLastScrape = lastRun?.last_scrape
    ? (Date.now() - new Date(lastRun.last_scrape).getTime()) / (1000 * 60 * 60)
    : Infinity

  const scrapeIntervalHours = config?.scrape_interval_hours ?? 24
  if (hoursSinceLastScrape >= scrapeIntervalHours) {
    actions.push({ type: 'scrape_leads', priority: 3, params: { niche: config?.target_niche, location: config?.target_location } })
  }

  // Qualify unscored leads
  actions.push({ type: 'qualify_leads', priority: 4 })

  // Send cold emails to qualified leads
  const maxEmailsPerDay = config?.max_emails_per_day ?? 30
  actions.push({ type: 'send_cold_emails', priority: 5, params: { max: maxEmailsPerDay } })

  // Follow-ups for non-responders
  actions.push({ type: 'send_followups', priority: 6 })

  // Sort by priority
  return actions.sort((a, b) => a.priority - b.priority)
}

function getInboundActions(_config: any, _lastRun: any): AgentAction[] {
  return [
    { type: 'check_inbox', priority: 1 },
    { type: 'classify_replies', priority: 2 },
    { type: 'send_followups', priority: 3 },
  ]
}

function getSalesActions(config: any, _lastRun: any): AgentAction[] {
  const actions: AgentAction[] = [
    { type: 'check_inbox', priority: 1 },
    { type: 'classify_replies', priority: 2 },
    { type: 'send_sales_emails', priority: 3, params: { max: config?.max_emails_per_day ?? 20 } },
    { type: 'send_followups', priority: 4 },
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
    status: 'running',
    trigger: 'scheduled',
    metadata: {
      email_budget_remaining: emailLimit.remaining,
      claude_budget_remaining: claudeLimit.remaining,
    },
  })

  // 5. Determine actions
  const lastRunMeta = agentConfig.last_run_metadata || null
  const actions = getNextActions(agentType, agentConfig, lastRunMeta)

  // Filter out email actions if rate-limited
  const filteredActions = actions.filter(a => {
    if ((a.type === 'send_cold_emails' || a.type === 'send_followups' || a.type === 'send_sales_emails') && !emailLimit.allowed) {
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
