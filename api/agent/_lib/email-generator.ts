// AI cold email generation engine
import { getAdminClient } from './supabase-admin'
import {
  askClaude,
  extractToolUse,
  COLD_EMAIL_WRITER_PROMPT,
  SALES_EMAIL_WRITER_PROMPT,
  COLD_EMAIL_TOOLS,
  SALES_EMAIL_TOOLS,
} from './claude'
import {
  isGthAgent,
  GTH_WRITER_PROMPT,
  GTH_WRITER_TOOLS,
  validateSequence,
  repairSequence,
  type SequenceDraft,
} from './gth-profile'

// ─── Types ──────────────────────────────────────────────────────

interface GenerateParams {
  userId: string
  agentRunId: string
  agentType: string
  minScore?: number
  batchSize?: number
  agentConfig?: any
}

interface GenerateResult {
  sequencesCreated: number
  emailsDrafted: number
}

interface EmailDraft {
  subject: string
  body: string
}

// ─── Step Delays ────────────────────────────────────────────────

const SEQUENCE_STEPS = [
  { stepNumber: 1, type: 'email', delayHours: 0, label: 'initial_email' },
  { stepNumber: 2, type: 'email', delayHours: 72, label: 'follow_up_1' },
  { stepNumber: 3, type: 'email', delayHours: 120, label: 'break_up' },
] as const

// ─── Generate Emails for a Single Lead ──────────────────────────

function buildEmailPrompt(agentType: string, cfg?: any): string {
  const isSales = agentType === 'sales' || agentType === 'sales_crm'
  if (isSales) return SALES_EMAIL_WRITER_PROMPT

  const c = cfg?.config || {}
  if (!c.client_business) return COLD_EMAIL_WRITER_PROMPT

  const sender = c.sender_name ? `${c.sender_name} at ${c.client_name || c.client_business}` : (c.client_name || c.client_business)
  const parts: string[] = [
    `You write cold emails as ${sender}. The business: ${c.client_business}`,
    c.client_offer ? `What we are offering this prospect: ${c.client_offer}` : '',
    c.ideal_customer_profile ? `Who we want to work with: ${c.ideal_customer_profile}` : '',
    c.outreach_tone ? `Tone: ${c.outreach_tone}` : 'Tone: plain, direct and friendly, like one local business owner writing to another.',
    'Rules, follow every one:',
    '- Under 120 words. Short sentences. One clear ask, usually a short call.',
    '- Open with something specific to their business, never with who we are.',
    '- Sound like a person typed it. No marketing language, no hype, no buzzwords.',
    '- Never use em dashes, exclamation marks, emojis, or phrases like "I hope this finds you well", "leverage", "elevate", "unlock", "game-changer", "in today\'s world".',
    '- Do not invent facts, numbers, clients or results. Only use what is in the business info.',
    '- Canadian spelling. Sign off with the sender\'s first name only.',
  ]
  return parts.filter(Boolean).join('\n')
}

async function generateEmailsForLead(
  lead: any,
  agentType: string,
  agentConfig?: any,
): Promise<EmailDraft[]> {
  const isSales = agentType === 'sales' || agentType === 'sales_crm'
  const systemPrompt = buildEmailPrompt(agentType, agentConfig)
  const tools = isSales ? SALES_EMAIL_TOOLS : COLD_EMAIL_TOOLS
  const toolName = isSales ? 'compose_sales_email' : 'compose_email'

  const enrichment = lead.enrichment_data || {}
  const dm = enrichment.decision_makers?.[0]
  const leadInfoParts = [
    `Business Name: ${lead.name || 'Unknown'}`,
    `Business Type: ${lead.industry || 'Unknown'}`,
    `Location: ${lead.address || 'Unknown'}`,
    `Website: ${lead.website || 'None'}`,
    `Qualification Score: ${lead.qualification_score ?? 'N/A'}`,
    `Qualification Reason: ${lead.qualification_reason || 'N/A'}`,
  ]
  // Add website intelligence for personalization
  if (dm) leadInfoParts.push(`Decision Maker: ${dm.name} (${dm.title})`)
  if (lead.contact_name) leadInfoParts.push(`Contact Name: ${lead.contact_name}`)
  if (enrichment.services_found?.length > 0) leadInfoParts.push(`Services they offer: ${enrichment.services_found.join(', ')}`)
  if (enrichment.website_summary) leadInfoParts.push(`About them: ${enrichment.website_summary}`)

  const leadInfo = leadInfoParts.join('\n')

  // Generate all 3 steps IN PARALLEL (was serial — 3 round-trips per lead)
  const stepPrompts = [
    `Write an initial cold outreach email for this business. Make it personal and reference their specific business.\n\n${leadInfo}`,
    `Write a follow-up email (72 hours after the initial email with no reply). Reference the first email briefly, add new value, keep it shorter.\n\nBusiness info:\n${leadInfo}`,
    `Write a final "break-up" email (5 days after initial). This is the last attempt — be friendly, leave the door open, keep it very short.\n\nBusiness info:\n${leadInfo}`,
  ]

  const drafts = await Promise.all(stepPrompts.map(async (prompt) => {
    try {
      const response = await askClaude({
        systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        tools,
      })
      const toolResult = extractToolUse(response)
      if (toolResult && (toolResult.name === toolName || toolResult.name === 'text_json')) {
        return {
          subject: toolResult.input.subject || 'Quick question',
          body: toolResult.input.body || '',
        }
      }
    } catch (err) {
      console.error(`Error generating email step for lead ${lead.id}:`, err)
    }
    return {
      subject: `Following up — ${lead.name}`,
      body: 'Email generation failed. Please draft manually.',
    }
  }))

  return drafts
}

// ─── Grow The Hype sequence writer ─────────────────────────────

function firstName(full?: string | null): string | null {
  if (!full) return null
  const cleaned = full.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '').trim()
  const first = cleaned.split(/\s+/)[0]
  return first && /^[A-Za-z'-]{2,}$/.test(first) ? first : null
}

function gthLeadBrief(lead: any): string {
  const e = lead.enrichment_data || {}
  const a = e.website_audit || null
  const dm = e.decision_makers?.[0]
  const contact = lead.contact_name || dm?.name || null
  const parts = [
    `Business: ${lead.name}`,
    `Type: ${lead.industry || 'local business'}`,
    `Area: ${lead.location || lead.address || 'Edmonton area'}`,
    `Contact first name: ${firstName(contact) || 'unknown (use "Hi there,")'}`,
    `Website: ${lead.website || 'none listed on Google'}`,
    `Google rating: ${lead.rating ?? 'n/a'}`,
  ]
  if (e.website_summary) parts.push(`What their site says about them: ${String(e.website_summary).slice(0, 280)}`)
  if (e.services_found?.length) parts.push(`Services they list: ${e.services_found.slice(0, 6).join(', ')}`)
  if (a) {
    parts.push(`Website check: HTTPS ${a.https ? 'yes' : 'no'}, phone-ready ${a.mobileReady ? 'yes' : 'no'}, online booking ${a.hasOnlineBooking ? (a.bookingTool || 'yes') : 'none'}, builder ${a.builder || 'unknown'}`)
    if (a.issues?.length) parts.push(`Gaps we found: ${a.issues.join('; ')}`)
  }
  parts.push(`Observation to build the email on: ${e.observation || lead.qualification_reason || 'none, keep it general but honest'}`)
  parts.push(`Best angle: ${e.pitch_angle || 'website'}`)
  return parts.join('\n')
}

async function writeGthSequence(lead: any): Promise<{ draft: SequenceDraft; issues: string[]; repaired: boolean }> {
  const brief = gthLeadBrief(lead)
  const ask = async (extra?: string) => {
    const response = await askClaude({
      systemPrompt: GTH_WRITER_PROMPT,
      messages: [{
        role: 'user',
        content: `Write the sequence for this business using compose_sequence.\n\n${brief}${extra ? `\n\n${extra}` : ''}`,
      }],
      tools: GTH_WRITER_TOOLS,
      tier: 'write',
      maxTokens: 1200,
      temperature: 0.7,
    })
    const tool = extractToolUse(response)
    return (tool?.input || {}) as SequenceDraft
  }

  let draft = await ask()
  let issues = validateSequence(draft)
  if (issues.length === 0) return { draft, issues, repaired: false }

  // One rewrite with the exact problems listed
  draft = await ask(`Your previous draft broke these rules, rewrite all three emails and fix every one:\n- ${issues.join('\n- ')}`)
  issues = validateSequence(draft)
  if (issues.length === 0) return { draft, issues, repaired: false }

  const repaired = repairSequence(draft)
  return { draft: repaired, issues: validateSequence(repaired), repaired: true }
}

async function runPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

// ─── Main Export ────────────────────────────────────────────────

export async function generateOutreach(params: GenerateParams): Promise<GenerateResult & { skippedNoEmail?: number; flaggedForReview?: number; errors?: string[] }> {
  const { userId, agentRunId, agentType, agentConfig } = params
  const sb = getAdminClient()
  const inner = agentConfig?.config || {}
  const gth = isGthAgent(agentConfig)
  const minScore = Number(inner.min_score) || params.minScore || 60
  const batchSize = gth ? Math.max(1, Math.min(12, Number(inner.drafts_per_run) || 8)) : (params.batchSize || 10)

  // 1. Qualified leads for THIS agent that have an email and no sequence yet
  let q = sb
    .from('outreach_leads')
    .select('*')
    .eq('user_id', userId)
    .gte('qualification_score', minScore)
    .not('email', 'is', null)
  if (agentConfig?.id) q = q.eq('agent_config_id', agentConfig.id)
  const { data: allQualified, error: fetchErr } = await q
    .order('qualification_score', { ascending: false })
    .limit(batchSize * 4)

  if (fetchErr) throw fetchErr
  if (!allQualified || allQualified.length === 0) {
    return { sequencesCreated: 0, emailsDrafted: 0 }
  }

  const leadIds = allQualified.map((l: any) => l.id)
  const { data: existingSequences } = await sb
    .from('outreach_sequences')
    .select('lead_id')
    .in('lead_id', leadIds)
  const hasSequence = new Set((existingSequences || []).map((s: any) => s.lead_id))
  const eligible = allQualified
    .filter((l: any) => !hasSequence.has(l.id))
    .filter((l: any) => !['contacted', 'interested', 'not_interested', 'objection', 'skipped', 'closed', 'lost'].includes(String(l.stage || '').toLowerCase()))
    .slice(0, batchSize)

  if (eligible.length === 0) return { sequencesCreated: 0, emailsDrafted: 0 }

  const errors: string[] = []
  let flagged = 0

  // 2. Write and store, three leads at a time (keeps us well inside the
  //    function budget and under API rate limits)
  const results = await runPool(eligible, 3, async (lead: any) => {
    try {
      let steps: { subject: string; body: string }[]
      let meta: Record<string, any> = {}

      if (gth) {
        const { draft, issues, repaired } = await writeGthSequence(lead)
        const subject = (draft.subject || '').trim()
        steps = [
          { subject, body: draft.email_1 },
          { subject: `Re: ${subject}`, body: draft.follow_up_1 },
          { subject: `Re: ${subject}`, body: draft.follow_up_2 },
        ]
        meta = {
          angle: draft.angle_used || lead.enrichment_data?.pitch_angle || null,
          validator_issues: issues,
          repaired,
          email_source: lead.enrichment_data?.email_source || null,
        }
        if (issues.length > 0 || repaired) flagged++
      } else {
        steps = await generateEmailsForLead(lead, agentType, agentConfig)
      }

      const { data: sequence, error: seqErr } = await sb
        .from('outreach_sequences')
        .insert({
          user_id: userId,
          lead_id: lead.id,
          agent_run_id: agentRunId,
          agent_config_id: agentConfig?.id || null,
          agent_type: agentType,
          sequence_name: gth ? 'GTH intro' : 'Outreach',
          status: 'draft',
          total_steps: SEQUENCE_STEPS.length,
          max_steps: SEQUENCE_STEPS.length,
          current_step: 1,
        })
        .select('id')
        .single()

      if (seqErr || !sequence) {
        errors.push(`sequence ${lead.name}: ${seqErr?.message || 'insert failed'}`)
        return { ok: false, drafts: 0 }
      }

      const now = new Date().toISOString()
      const rows = SEQUENCE_STEPS.map((step, i) => ({
        sequence_id: sequence.id,
        user_id: userId,
        lead_id: lead.id,
        step_number: step.stepNumber,
        step_type: 'email',
        label: step.label,
        delay_hours: step.delayHours,
        subject: steps[i]?.subject || '',
        body: steps[i]?.body || '',
        status: 'pending',
        approval_status: 'pending',
        // Only the first email is ready for review now; follow-ups become
        // due once the previous email has actually been sent.
        scheduled_at: i === 0 ? now : null,
        metadata: meta,
      }))

      const { error: stepsErr } = await sb.from('outreach_steps').insert(rows)
      if (stepsErr) {
        errors.push(`steps ${lead.name}: ${stepsErr.message}`)
        await sb.from('outreach_sequences').delete().eq('id', sequence.id)
        return { ok: false, drafts: 0 }
      }
      return { ok: true, drafts: rows.length }
    } catch (err: any) {
      errors.push(`${lead.name}: ${String(err?.message || err).slice(0, 200)}`)
      return { ok: false, drafts: 0 }
    }
  })

  const sequencesCreated = results.filter(r => r.ok).length
  const emailsDrafted = results.reduce((sum, r) => sum + r.drafts, 0)
  return {
    sequencesCreated,
    emailsDrafted,
    ...(flagged ? { flaggedForReview: flagged } : {}),
    ...(errors.length ? { errors: errors.slice(0, 3) } : {}),
  }
}
