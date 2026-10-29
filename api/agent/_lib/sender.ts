// Email sending engine: sends steps Omar has approved (status 'scheduled')
// through his Gmail, threads follow-ups, and queues the next step for review.
import { getAdminClient } from './supabase-admin'
import { sendEmail, createDraft, updateDraft, findSentInThread } from './gmail-server'
import { checkRateLimit, incrementCounter, DEFAULT_LIMITS } from './rate-limiter'
import { gthOptOutFooterHtml } from './gth-profile'
import { loadAttachments } from './visual-audit'
import { leadRecipients } from './lead-stage'

interface SendParams {
  userId: string
  agentRunId?: string | null
  dailyLimit?: number
  cfgInner?: any
}

interface SendResult {
  sent: number
  skipped: number
  errors: number
  firstError?: string
}

const STOPPED_SEQUENCE_STATES = ['replied', 'stopped', 'unsubscribed', 'completed', 'bounced']

export async function sendScheduledEmails(params: SendParams): Promise<SendResult> {
  const { userId } = params
  const sb = getAdminClient()
  const dailyLimit = params.dailyLimit || DEFAULT_LIMITS.email_send

  try { await syncGmailDrafts({ userId, cfgInner: params.cfgInner }) } catch { /* never block sending */ }

  let sent = 0
  let skipped = 0
  let errors = 0
  let firstError: string | undefined

  const now = new Date().toISOString()
  const { data: steps, error: fetchErr } = await sb
    .from('outreach_steps')
    .select('*, outreach_sequences!inner(id, lead_id, status, total_steps, agent_config_id)')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (fetchErr) throw fetchErr
  if (!steps || steps.length === 0) return { sent: 0, skipped: 0, errors: 0 }

  // Client agents are export-only: their drafts never go out from this Gmail
  const { data: exportCfgs } = await sb
    .from('agent_configs')
    .select('id, config')
    .eq('user_id', userId)
  const exportOnly = new Set((exportCfgs || []).filter((c: any) => c.config?.delivery === 'export').map((c: any) => c.id))

  for (const step of steps) {
    const seq = step.outreach_sequences
    if (seq?.agent_config_id && exportOnly.has(seq.agent_config_id)) { skipped++; continue }
    try {
      // Never send into a conversation that has ended (reply, opt-out, etc.)
      if (seq && STOPPED_SEQUENCE_STATES.includes(seq.status)) {
        await sb.from('outreach_steps')
          .update({ status: 'skipped', metadata: { ...(step.metadata || {}), skip_reason: `sequence ${seq.status}` }, updated_at: now })
          .eq('id', step.id)
        skipped++
        continue
      }

      const limit = await checkRateLimit(userId, 'email_send', dailyLimit)
      if (!limit.allowed) {
        // Leave it scheduled; it goes out on the next run
        skipped++
        continue
      }

      const leadId = seq?.lead_id || step.lead_id
      const { data: lead } = await sb
        .from('outreach_leads')
        .select('id, email, alt_emails, bounced_emails, name, stage, enrichment_data')
        .eq('id', leadId)
        .single()

      const recipients = lead ? leadRecipients(lead) : []
      if (!recipients.length) {
        await sb.from('outreach_steps')
          .update({ status: 'skipped', metadata: { ...(step.metadata || {}), skip_reason: lead?.email ? 'every address bounced' : 'no_email' }, updated_at: now })
          .eq('id', step.id)
        skipped++
        continue
      }
      if (['not_interested', 'unsubscribed'].includes(String(lead.stage || '').toLowerCase())) {
        await sb.from('outreach_steps')
          .update({ status: 'skipped', metadata: { ...(step.metadata || {}), skip_reason: 'lead opted out' }, updated_at: now })
          .eq('id', step.id)
        skipped++
        continue
      }

      // Thread follow-ups onto the previous email
      let threadId: string | undefined
      let replyTo: string | undefined
      if (step.step_number > 1) {
        const { data: prev } = await sb
          .from('outreach_steps')
          .select('gmail_thread_id, gmail_message_id, metadata')
          .eq('sequence_id', step.sequence_id)
          .eq('status', 'sent')
          .order('step_number', { ascending: false })
          .limit(1)
          .maybeSingle()
        threadId = prev?.gmail_thread_id || undefined
        replyTo = prev?.metadata?.rfc_message_id || undefined
      }

      // Claim the step first so a parallel run can't double-send it
      const { data: claimed } = await sb
        .from('outreach_steps')
        .update({ status: 'sending', updated_at: new Date().toISOString() })
        .eq('id', step.id)
        .eq('status', 'scheduled')
        .select('id')
      if (!claimed || claimed.length === 0) { skipped++; continue }

      const result = await sendEmail(userId, {
        to: recipients.join(', '),
        subject: step.subject || '',
        body: step.body || '',
        threadId,
        replyToMessageId: replyTo,
        footerHtml: gthOptOutFooterHtml(params.cfgInner),
        attachments: step.step_number === 1 ? await loadAttachments(lead).catch(() => []) : [],
      })

      const sentAt = new Date().toISOString()
      await sb.from('outreach_steps')
        .update({
          status: 'sent',
          executed_at: sentAt,
          gmail_message_id: result.id,
          gmail_thread_id: result.threadId,
          metadata: { ...(step.metadata || {}), rfc_message_id: result.rfcMessageId },
          updated_at: sentAt,
        })
        .eq('id', step.id)

      // Next step becomes due for Omar's review after its delay
      const total = seq?.total_steps || 3
      if (step.step_number < total) {
        const { data: nextStep } = await sb
          .from('outreach_steps')
          .select('id, delay_hours, step_number')
          .eq('sequence_id', step.sequence_id)
          .eq('step_number', step.step_number + 1)
          .maybeSingle()
        if (nextStep) {
          const gapHours = Math.max(24, (nextStep.delay_hours || 72) - (step.delay_hours || 0))
          // Once Omar approves the first email, follow-ups go out on their own
          // (a reply or opt-out stops them). He can turn this off per agent.
          const autoFollow = params.cfgInner?.auto_followups !== false
          await sb.from('outreach_steps')
            .update({
              scheduled_at: new Date(Date.now() + gapHours * 3600_000).toISOString(),
              ...(autoFollow ? { status: 'scheduled', approval_status: 'approved' } : {}),
              updated_at: sentAt,
            })
            .eq('id', nextStep.id)
            .eq('status', 'pending')
        }
        await sb.from('outreach_sequences')
          .update({ status: 'active', current_step: step.step_number, updated_at: sentAt })
          .eq('id', step.sequence_id)
      } else {
        await sb.from('outreach_sequences')
          .update({ status: 'completed', current_step: step.step_number, updated_at: sentAt })
          .eq('id', step.sequence_id)
      }

      if (step.step_number === 1) {
        await sb.from('outreach_leads')
          .update({ stage: 'contacted', last_contact: sentAt.slice(0, 10) })
          .eq('id', lead.id)
      }

      await incrementCounter(userId, 'email_send')
      sent++
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!firstError) firstError = msg.slice(0, 300)
      try {
        await sb.from('outreach_steps')
          .update({ status: 'failed', metadata: { ...(step.metadata || {}), error: msg.slice(0, 500) }, updated_at: new Date().toISOString() })
          .eq('id', step.id)
      } catch { /* ignore */ }
      errors++
    }
  }

  return { sent, skipped, errors, ...(firstError ? { firstError } : {}) }
}


// ─── Gmail Drafts path ──────────────────────────────────────────
// Omar can push an email into his Gmail Drafts and send it from there.
// The step leaves the review queue as 'approved' with the draft's thread id,
// and syncGmailDrafts() marks it sent once Gmail shows it went out.

export async function draftStepToGmail(params: { userId: string; stepId: string; cfgInner?: any }) {
  const sb = getAdminClient()
  const { data: step, error } = await sb
    .from('outreach_steps')
    .select('*, outreach_sequences!inner(id, lead_id, status, agent_config_id)')
    .eq('id', params.stepId)
    .eq('user_id', params.userId)
    .single()
  if (error || !step) throw new Error('Email not found')
  if (['sent', 'replied'].includes(step.status)) throw new Error('This email has already gone out')
  const { data: lead } = await sb.from('outreach_leads').select('id, email, alt_emails, bounced_emails, name, enrichment_data').eq('id', step.outreach_sequences.lead_id).single()
  const recipients = lead ? leadRecipients(lead) : []
  if (!recipients.length) throw new Error(lead?.email ? 'Every address for this lead has bounced. Add one that works first.' : 'This lead has no email address')
  // First email carries the screenshots of what we saw on their site
  const attachments = step.step_number === 1 ? await loadAttachments(lead).catch(() => []) : []

  // Follow-ups go into the same Gmail thread as the email before them
  let threadId: string | undefined
  let replyTo: string | undefined
  if (step.step_number > 1) {
    const { data: prev } = await sb.from('outreach_steps')
      .select('gmail_thread_id, metadata')
      .eq('sequence_id', step.sequence_id).eq('status', 'sent')
      .order('step_number', { ascending: false }).limit(1).maybeSingle()
    threadId = prev?.gmail_thread_id || undefined
    replyTo = prev?.metadata?.rfc_message_id || undefined
  }

  const mail = {
    to: recipients.join(', '),
    subject: step.subject || '',
    body: step.body || '',
    threadId,
    replyToMessageId: replyTo,
    footerHtml: gthOptOutFooterHtml(params.cfgInner),
    attachments,
  }
  // Already in his Drafts (e.g. the email was rewritten): replace it there
  // instead of leaving an old copy behind. Falls back to a new draft if he
  // deleted the old one.
  const existing = step.metadata?.gmail_draft_id as string | undefined
  let d = existing ? await updateDraft(params.userId, existing, { ...mail, threadId: threadId || step.gmail_thread_id || undefined }).catch(() => null) : null
  if (!d) d = await createDraft(params.userId, mail)

  const now = new Date().toISOString()
  await sb.from('outreach_steps').update({
    status: 'approved',
    approval_status: step.metadata?.edited ? 'edited' : 'approved',
    gmail_thread_id: d.threadId,
    metadata: { ...(step.metadata || {}), gmail_draft_id: d.draftId, gmail_draft_at: now, via: 'gmail_draft', draft_replaced: !!existing && d.draftId === existing },
    updated_at: now,
  }).eq('id', step.id)
  await sb.from('outreach_sequences').update({ status: 'active', updated_at: now }).eq('id', step.sequence_id).eq('status', 'draft')
  return { draftId: d.draftId, lead: lead.name }
}

/**
 * Record that a step went out from Omar's Gmail (from a draft, or an email he
 * wrote himself) and line up the next one, exactly like an automatic send.
 */
export async function markStepSent(step: any, found: { id: string; sentAt: string; rfcMessageId: string | null; threadId?: string }, cfgInner: any, extraMeta: Record<string, any> = {}) {
  const sb = getAdminClient()
  const seq = step.outreach_sequences
  const { data: claimed } = await sb.from('outreach_steps').update({
    status: 'sent',
    executed_at: found.sentAt,
    gmail_message_id: found.id,
    ...(found.threadId ? { gmail_thread_id: found.threadId } : {}),
    metadata: { ...(step.metadata || {}), rfc_message_id: found.rfcMessageId, ...extraMeta },
    updated_at: new Date().toISOString(),
  }).eq('id', step.id).neq('status', 'sent').select('id')
  if (!claimed?.length) return false

  const total = seq?.total_steps || 3
  if (step.step_number < total) {
    const { data: next } = await sb.from('outreach_steps')
      .select('id, delay_hours').eq('sequence_id', step.sequence_id).eq('step_number', step.step_number + 1).maybeSingle()
    if (next) {
      const gap = Math.max(24, (next.delay_hours || 72) - (step.delay_hours || 0))
      const auto = cfgInner?.auto_followups !== false
      await sb.from('outreach_steps').update({
        scheduled_at: new Date(new Date(found.sentAt).getTime() + gap * 3600_000).toISOString(),
        ...(auto ? { status: 'scheduled', approval_status: 'approved' } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', next.id).eq('status', 'pending')
    }
    await sb.from('outreach_sequences').update({ status: 'active', current_step: step.step_number, updated_at: new Date().toISOString() }).eq('id', step.sequence_id).in('status', ['draft', 'active', 'paused'])
  } else {
    await sb.from('outreach_sequences').update({ status: 'completed', current_step: step.step_number, updated_at: new Date().toISOString() }).eq('id', step.sequence_id).in('status', ['draft', 'active', 'paused'])
  }
  if (step.step_number === 1) {
    // Only move leads still at the start; never pull back a lead Omar moved on
    const { data: lead } = await sb.from('outreach_leads').select('stage').eq('id', seq.lead_id).single()
    const st = String(lead?.stage || '').toLowerCase()
    await sb.from('outreach_leads').update({
      last_contact: found.sentAt.slice(0, 10),
      ...(!st || /new|lead|qualified|researched|prospect/.test(st) ? { stage: 'contacted' } : {}),
    }).eq('id', seq.lead_id)
  }
  return true
}

/** Mark Gmail-drafted emails as sent once Omar has sent them from Gmail. */
export async function syncGmailDrafts(params: { userId: string; cfgInner?: any }): Promise<{ checked: number; nowSent: number }> {
  const sb = getAdminClient()
  const { data: steps } = await sb
    .from('outreach_steps')
    .select('*, outreach_sequences!inner(id, lead_id, status, total_steps)')
    .eq('user_id', params.userId)
    .eq('status', 'approved')
    .not('gmail_thread_id', 'is', null)
    .limit(50)
  let nowSent = 0
  for (const step of steps || []) {
    if (step.metadata?.via !== 'gmail_draft') continue
    let found: Awaited<ReturnType<typeof findSentInThread>> = null
    const { data: done } = await sb.from('outreach_steps').select('gmail_message_id').eq('sequence_id', step.sequence_id).not('gmail_message_id', 'is', null)
    const exclude = (done || []).map((d: any) => d.gmail_message_id)
    try { found = await findSentInThread(params.userId, step.gmail_thread_id, exclude) } catch { continue }
    if (!found) continue
    if (await markStepSent(step, found, params.cfgInner)) nowSent++
  }
  return { checked: (steps || []).length, nowSent }
}
