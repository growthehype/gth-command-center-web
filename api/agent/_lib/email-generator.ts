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
import { isGthAgent, GTH_WRITER_TOOLS } from './gth-profile'
import { buildGthWriterPrompt, pickProofLink, validateVoice, repairVoice, type VoiceDraft as SequenceDraft } from './gth-voice'

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

function gthLeadBrief(lead: any, proof: string | null): string {
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
    `Google rating: ${lead.rating ?? 'n/a'}${e.review_count || e.user_rating_count ? ` from ${e.review_count || e.user_rating_count} reviews` : ''}`,
  ]
  // Only things we actually checked go to the writer
  const findings: string[] = []
  const qual = e.qual
  if (qual?.breakdown?.length) {
    for (const b of qual.breakdown) if (b.status === 'fail' && b.group === 'need' && b.detail) findings.push(b.detail)
    if (qual.design?.verdict && qual.design?.note && qual.design.verdict !== 'modern') findings.push(`Design looks ${qual.design.verdict}: ${qual.design.note}`)
  } else if (a?.issues?.length) {
    findings.push(...a.issues)
  }
  parts.push(`Verified findings (the ONLY site facts you may mention): ${findings.length ? findings.join('; ') : 'none, so do not claim anything specific about their site'}`)
  parts.push(`Work to show: ${proof || 'none'}`)
  if (e.website_summary) parts.push(`What their site says about them: ${String(e.website_summary).slice(0, 280)}`)
  if (e.services_found?.length) parts.push(`Services they list: ${e.services_found.slice(0, 6).join(', ')}`)
  if (a) {
    parts.push(`Website check: HTTPS ${a.https ? 'yes' : 'no'}, phone-ready ${a.mobileReady ? 'yes' : 'no'}, online booking ${a.hasOnlineBooking ? (a.bookingTool || 'yes') : 'none'}, builder ${a.builder || 'unknown'}`)
  }
  parts.push(`Lead with this observation: ${qual?.observation || e.observation || 'none, keep it general but honest'}`)
  parts.push(`Pitch angle: ${qual?.pitch_angle || e.pitch_angle || 'website'}`)
  return parts.join('\n')
}

async function writeGthSequence(lead: any, cfgInner: any): Promise<{ draft: SequenceDraft; issues: string[]; repaired: boolean }> {
  const proof = pickProofLink(cfgInner, lead.industry || '', lead.name || '')
  const allowedLinks = [proof, (cfgInner?.booking_link || '').trim()].filter(Boolean) as string[]
  const brief = gthLeadBrief(lead, proof)
  const systemPrompt = buildGthWriterPrompt(cfgInner)
  const validateSequence = (d: SequenceDraft) => validateVoice(d, allowedLinks)
  const pick = (o: any, keys: string[]) => {
    for (const k of keys) if (typeof o?.[k] === 'string' && o[k].trim()) return o[k]
    return ''
  }
  // Accept the field names models actually use, not just the ones we asked for
  const normalise = (o: any): SequenceDraft => {
    const arr = Array.isArray(o?.emails) ? o.emails : null
    return {
      subject: pick(o, ['subject', 'subject_line']) || (arr?.[0]?.subject ?? ''),
      email_1: pick(o, ['email_1', 'email1', 'first_email', 'initial_email', 'body']) || (arr?.[0]?.body ?? ''),
      follow_up_1: pick(o, ['follow_up_1', 'followup_1', 'follow_up', 'email_2', 'second_email']) || (arr?.[1]?.body ?? ''),
      follow_up_2: pick(o, ['follow_up_2', 'followup_2', 'final_note', 'email_3', 'third_email']) || (arr?.[2]?.body ?? ''),
      angle_used: o?.angle_used,
    }
  }
  const empty = (d: SequenceDraft) => !d.email_1?.trim() || !d.follow_up_1?.trim() || !d.follow_up_2?.trim()
  let lastStop = ''

  const ask = async (extra?: string, plainJson = false) => {
    const response = await askClaude({
      systemPrompt: plainJson
        ? `${systemPrompt}\n\nReply with ONLY a JSON object, no other text: {"subject": "...", "email_1": "...", "follow_up_1": "...", "follow_up_2": "...", "angle_used": "website|ai|both"}`
        : systemPrompt,
      messages: [{
        role: 'user',
        content: `${plainJson ? 'Write the three-email sequence for this business.' : 'Write the sequence for this business using compose_sequence.'}\n\n${brief}${extra ? `\n\n${extra}` : ''}`,
      }],
      ...(plainJson ? {} : { tools: GTH_WRITER_TOOLS }),
      tier: 'write',
      // Room for the model's own reasoning plus all three emails
      maxTokens: 8000,
      temperature: 0.6,
    })
    lastStop = response?.stop_reason || ''
    const tool = extractToolUse(response)
    return normalise(tool?.input || {})
  }

  let draft = await ask()
  if (empty(draft)) draft = await ask(undefined, true)
  if (empty(draft)) throw new Error(`the writer came back without email text (stop: ${lastStop || 'unknown'})`)
  let issues = validateSequence(draft)
  if (issues.length === 0) return { draft, issues, repaired: false }

  // One rewrite with the exact problems listed
  const retry = await ask(`Your previous draft broke these rules, rewrite all three emails and fix every one:\n- ${issues.join('\n- ')}`)
  if (!empty(retry)) draft = retry
  issues = validateSequence(draft)
  if (issues.length === 0) return { draft, issues, repaired: false }

  const repaired = repairVoice(draft)
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

// ─── One lead → one three-step sequence ─────────────────────────

interface SeqCtx { userId: string; agentRunId: string | null; agentType: string; agentConfig: any; inner: any; gth: boolean }

async function buildSequence(lead: any, ctx: SeqCtx): Promise<{ ok: boolean; drafts: number; flagged?: boolean; error?: string }> {
  const { userId, agentRunId, agentType, agentConfig, inner, gth } = ctx
  const sb = getAdminClient()
  let flagged = false
    let steps: { subject: string; body: string }[]
    let meta: Record<string, any> = {}

    if (gth) {
      const { draft, issues, repaired } = await writeGthSequence(lead, inner)
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
      flagged = issues.length > 0 || repaired
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
      return { ok: false, drafts: 0, error: `sequence ${lead.name}: ${seqErr?.message || 'insert failed'}` }
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
      await sb.from('outreach_sequences').delete().eq('id', sequence.id)
      return { ok: false, drafts: 0, error: `steps ${lead.name}: ${stepsErr.message}` }
    }
    return { ok: true, drafts: rows.length, flagged }
}

/** Write (or rewrite) the sequence for one lead on demand. Never touches a sequence that has already sent. */
export async function draftForLead(params: { userId: string; agentConfig: any; leadId: string; agentRunId?: string | null }) {
  const sb = getAdminClient()
  const { data: lead, error } = await sb.from('outreach_leads').select('*').eq('id', params.leadId).eq('user_id', params.userId).single()
  if (error || !lead) throw new Error('Lead not found')
  if (!lead.email) throw new Error('This lead has no email address yet')

  const { data: seqs } = await sb.from('outreach_sequences').select('id').eq('lead_id', lead.id)
  for (const sq of seqs || []) {
    const { count } = await sb.from('outreach_steps').select('id', { count: 'exact', head: true }).eq('sequence_id', sq.id).eq('status', 'sent')
    if ((count || 0) > 0) throw new Error('Emails have already gone to this lead, so the sequence is locked')
    await sb.from('outreach_steps').delete().eq('sequence_id', sq.id)
    await sb.from('outreach_sequences').delete().eq('id', sq.id)
  }

  const cfg = params.agentConfig
  const r = await buildSequence(lead, {
    userId: params.userId,
    agentRunId: params.agentRunId || null,
    agentType: cfg?.agent_type || 'lead_gen',
    agentConfig: cfg,
    inner: cfg?.config || {},
    gth: isGthAgent(cfg),
  })
  if (!r.ok) throw new Error(r.error || 'Could not write the emails')
  return { drafted: r.drafts, flagged: !!r.flagged }
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
  const ctx: SeqCtx = { userId, agentRunId, agentType, agentConfig, inner, gth }
  const results = await runPool(eligible, 3, async (lead: any) => {
    try {
      const r = await buildSequence(lead, ctx)
      if (r.flagged) flagged++
      if (!r.ok && r.error) errors.push(r.error)
      return r
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
