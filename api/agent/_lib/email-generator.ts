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

  const parts: string[] = [
    `You are a cold email specialist writing on behalf of: ${c.client_business}`,
    'Write short, personalized, non-spammy cold emails. Reference the prospect\'s specific business and explain how the client\'s services could help them.',
    'Keep it under 150 words. No generic templates.',
  ]
  if (c.outreach_tone) parts.push(`Tone: ${c.outreach_tone}`)
  if (c.ideal_customer_profile) parts.push(`The ideal customer is: ${c.ideal_customer_profile}`)
  return parts.join('\n')
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
      if (toolResult && (toolResult.name === toolName)) {
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

// ─── Main Export ────────────────────────────────────────────────

export async function generateOutreach(params: GenerateParams): Promise<GenerateResult> {
  const { userId, agentRunId, agentType, minScore = 60, batchSize = 10, agentConfig } = params
  const sb = getAdminClient()

  try {
    // 1. Fetch qualified leads without an existing sequence
    //    Join check: leads with score >= minScore that have no outreach_sequences row
    const { data: allQualified, error: fetchErr } = await sb
      .from('outreach_leads')
      .select('*')
      .eq('user_id', userId)
      .gte('qualification_score', minScore)
      .order('qualification_score', { ascending: false })
      .limit(batchSize * 2) // fetch extra to filter

    if (fetchErr) throw fetchErr
    if (!allQualified || allQualified.length === 0) {
      return { sequencesCreated: 0, emailsDrafted: 0 }
    }

    // 2. Check which leads already have sequences
    const leadIds = allQualified.map((l: any) => l.id)
    const { data: existingSequences } = await sb
      .from('outreach_sequences')
      .select('lead_id')
      .in('lead_id', leadIds)

    const leadsWithSequences = new Set((existingSequences || []).map((s: any) => s.lead_id))
    const eligibleLeads = allQualified
      .filter((l: any) => !leadsWithSequences.has(l.id))
      .slice(0, batchSize)

    if (eligibleLeads.length === 0) {
      return { sequencesCreated: 0, emailsDrafted: 0 }
    }

    // 3. Generate emails and create sequences for ALL eligible leads IN PARALLEL.
    //    Was serial: 25 leads × 3 sequential Claude calls = 75 round-trips
    //    blowing the 60s function budget. Now parallel: ~3s total.
    const results = await Promise.all(eligibleLeads.map(async (lead: any) => {
      try {
        const drafts = await generateEmailsForLead(lead, agentType, agentConfig)

        const { data: sequence, error: seqErr } = await sb
          .from('outreach_sequences')
          .insert({
            user_id: userId,
            lead_id: lead.id,
            agent_run_id: agentRunId,
            agent_type: agentType,
            status: 'draft',
            total_steps: SEQUENCE_STEPS.length,
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (seqErr || !sequence) {
          console.error(`Error creating sequence for lead ${lead.id}:`, seqErr)
          return { ok: false, drafts: 0 }
        }

        const steps = SEQUENCE_STEPS.map((step, i) => ({
          sequence_id: sequence.id,
          user_id: userId,
          lead_id: lead.id,
          step_number: step.stepNumber,
          type: step.type,
          label: step.label,
          delay_hours: step.delayHours,
          subject: drafts[i]?.subject || '',
          body: drafts[i]?.body || '',
          status: 'pending',
          created_at: new Date().toISOString(),
        }))

        const { error: stepsErr } = await sb
          .from('outreach_steps')
          .insert(steps)

        if (stepsErr) {
          console.error(`Error creating steps for sequence ${sequence.id}:`, stepsErr)
          return { ok: false, drafts: 0 }
        }

        return { ok: true, drafts: drafts.length }
      } catch (leadErr) {
        console.error(`Error processing lead ${lead.id} (${lead.name}):`, leadErr)
        return { ok: false, drafts: 0 }
      }
    }))

    const sequencesCreated = results.filter(r => r.ok).length
    const emailsDrafted = results.reduce((sum, r) => sum + r.drafts, 0)

    return { sequencesCreated, emailsDrafted }
  } catch (error) {
    console.error('generateOutreach failed:', error)
    throw error
  }
}
