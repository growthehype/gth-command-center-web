// Manual trigger: POST to run an agent on demand, or to send approved emails now
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient, getAgentConfig, getAgentConfigById, updateAgentRun } from './_lib/supabase-admin'
import { runAgentTick } from './_lib/orchestrator'
import { runActions, summariseRun } from './_lib/actions'
import { sendScheduledEmails, draftStepToGmail } from './_lib/sender'
import { syncTracker, reopenSequence } from './_lib/tracker-sync'
import { rescoreLeads, huntLeads } from './_lib/qualifier'
import { isGthAgent } from './_lib/gth-profile'
import { draftForLead, generateOutreach } from './_lib/email-generator'
import { diagnoseCapture } from './_lib/visual-audit'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ------ Step tracker so the response tells us WHERE it blew up ----
  let step = 'init'

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // ── Auth: require Supabase JWT ──
    step = 'auth'
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const token = authHeader.slice(7)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase not configured' })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    step = 'parse_body'
    const { agentType, configId, mode } = (req.body ?? {}) as any
    const userId = user.id

    // Fast path: Omar approved an email in the queue, send what's due now
    if (mode === 'send_approved') {
      step = 'send_approved'
      const cfg = configId ? await getAgentConfigById(configId) : await getAgentConfig(userId, agentType || 'lead_gen')
      if (cfg && cfg.user_id !== userId) return res.status(403).json({ error: 'Config does not belong to this user', step })
      const inner = cfg?.config || {}
      const result = await sendScheduledEmails({
        userId,
        dailyLimit: Number(inner.daily_email_limit) || undefined,
        cfgInner: inner,
      })
      return res.status(200).json({ status: 'completed', results: { send_emails: result } })
    }

    // Re-check every lead of one agent with the current scoring (v2)
    if (mode === 'rescore') {
      step = 'rescore'
      if (!configId) return res.status(400).json({ error: 'Missing configId', step })
      const cfg = await getAgentConfigById(configId)
      if (!cfg) return res.status(404).json({ error: 'Agent config not found', step })
      if (cfg.user_id !== userId) return res.status(403).json({ error: 'Config does not belong to this user', step })
      if (!isGthAgent(cfg)) return res.status(400).json({ error: 'Rescore is available for the GTH agent', step })
      const result = await rescoreLeads({ userId, agentConfig: cfg, deadlineMs: 200_000, pool: 4 })
      return res.status(200).json({ status: 'completed', results: { rescore: result } })
    }

    // Put one email into Omar's Gmail Drafts so he can send it from Gmail
    if (mode === 'gmail_draft' || mode === 'sync_drafts') {
      step = mode
      const cfg = configId ? await getAgentConfigById(configId) : null
      if (cfg && cfg.user_id !== userId) return res.status(403).json({ error: 'Config does not belong to this user', step })
      if (mode === 'sync_drafts') {
        const r = await syncTracker({ userId, cfgInner: cfg?.config || {} })
        return res.status(200).json({ status: 'completed', results: { sync_drafts: r } })
      }
      const { stepId } = (req.body ?? {}) as any
      if (!stepId) return res.status(400).json({ error: 'Missing stepId', step })
      const r = await draftStepToGmail({ userId, stepId, cfgInner: cfg?.config || {} })
      return res.status(200).json({ status: 'completed', results: { gmail_draft: r } })
    }

    // Pick a bounced or closed lead back up, optionally with addresses that work
    if (mode === 'reopen_lead') {
      step = 'reopen_lead'
      const { leadId, emails } = (req.body ?? {}) as any
      if (!leadId) return res.status(400).json({ error: 'Missing leadId', step })
      const cfg = configId ? await getAgentConfigById(configId) : null
      if (cfg && cfg.user_id !== userId) return res.status(403).json({ error: 'Config does not belong to this user', step })
      const r = await reopenSequence({ userId, leadId, addEmails: Array.isArray(emails) ? emails : [], cfgInner: cfg?.config || {} })
      return res.status(200).json({ status: 'completed', results: { reopen: r } })
    }

    // Find leads now (GTH): screen pending businesses, search for more, stop at a few 60+
    if (mode === 'hunt') {
      step = 'hunt'
      if (!configId) return res.status(400).json({ error: 'Missing configId', step })
      const cfg = await getAgentConfigById(configId)
      if (!cfg) return res.status(404).json({ error: 'Agent config not found', step })
      if (cfg.user_id !== userId) return res.status(403).json({ error: 'Config does not belong to this user', step })
      const r = await huntLeads({ userId, agentConfig: cfg, deadlineMs: 200_000 })
      await getAdminClient().from('agent_configs').update({ last_run_at: new Date().toISOString(), last_run_status: 'completed', last_run_summary: `Checked ${r.screened} businesses, ${r.qualified} qualified at 60+` }).eq('id', cfg.id)
      return res.status(200).json({ status: 'completed', results: { hunt: r } })
    }

    // Self-test: can we actually open and screenshot a site from here?
    if (mode === 'diag') {
      step = 'diag'
      const { url } = (req.body ?? {}) as any
      const r = await diagnoseCapture(String(url || 'https://growthehype.ca'))
      return res.status(200).json({ status: 'completed', results: { diag: r } })
    }

    // Write emails for every hot/warm lead that doesn't have them yet (no scraping)
    if (mode === 'draft_batch') {
      step = 'draft_batch'
      if (!configId) return res.status(400).json({ error: 'Missing configId', step })
      const cfg = await getAgentConfigById(configId)
      if (!cfg) return res.status(404).json({ error: 'Agent config not found', step })
      if (cfg.user_id !== userId) return res.status(403).json({ error: 'Config does not belong to this user', step })
      const r = await generateOutreach({ userId, agentRunId: null as any, agentType: cfg.agent_type, agentConfig: cfg })
      return res.status(200).json({ status: 'completed', results: { generate_emails: r } })
    }

    // Write (or rewrite) the emails for one lead, straight from its lead file
    if (mode === 'draft_lead') {
      step = 'draft_lead'
      const { leadId } = (req.body ?? {}) as any
      if (!configId || !leadId) return res.status(400).json({ error: 'Missing configId or leadId', step })
      const cfg = await getAgentConfigById(configId)
      if (!cfg) return res.status(404).json({ error: 'Agent config not found', step })
      if (cfg.user_id !== userId) return res.status(403).json({ error: 'Config does not belong to this user', step })
      const result = await draftForLead({ userId, agentConfig: cfg, leadId })
      return res.status(200).json({ status: 'completed', results: { draft_lead: result } })
    }

    if (!agentType) {
      return res.status(400).json({ error: 'Missing agentType', step })
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

    // 4. Execute actions with per-action timeouts and an overall deadline
    step = 'execute_actions'
    const { results: actionResults, timings: actionTimings } = await runActions(tick.actions, userId, runId, cfg, 270_000)

    // 5. Mark run as completed and stamp the agent
    step = 'finalize_run'
    const summaryText = summariseRun(actionResults)
    const hadErrors = Object.values(actionResults).some((v: any) => v?.error)
    try {
      await updateAgentRun(runId, {
        status: hadErrors ? 'partial' : 'completed',
        summary: summaryText,
        metadata: actionResults,
      })
      await getAdminClient()
        .from('agent_configs')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: hadErrors ? 'partial' : 'completed',
          last_run_summary: summaryText.slice(0, 500),
          last_run_duration_ms: Object.values(actionTimings).reduce((a, b) => a + b, 0),
          last_run_metadata: { ...(cfg.last_run_metadata || {}), last_scrape: actionResults.scrape_leads && !actionResults.scrape_leads.error ? new Date().toISOString() : (cfg.last_run_metadata?.last_scrape || null) },
        })
        .eq('id', cfg.id)
    } catch (finErr: any) {
      console.error('finalize_run failed (non-fatal):', finErr)
    }

    return res.status(200).json({
      runId,
      summary: summaryText,
      status: hadErrors ? 'partial' : 'completed',
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
