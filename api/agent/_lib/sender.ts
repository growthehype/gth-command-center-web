// Email sending engine: sends steps Omar has approved (status 'scheduled')
// through his Gmail, threads follow-ups, and queues the next step for review.
import { getAdminClient } from './supabase-admin'
import { sendEmail } from './gmail-server'
import { checkRateLimit, incrementCounter, DEFAULT_LIMITS } from './rate-limiter'
import { gthOptOutFooterHtml } from './gth-profile'

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

  let sent = 0
  let skipped = 0
  let errors = 0
  let firstError: string | undefined

  const now = new Date().toISOString()
  const { data: steps, error: fetchErr } = await sb
    .from('outreach_steps')
    .select('*, outreach_sequences!inner(id, lead_id, status, total_steps)')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (fetchErr) throw fetchErr
  if (!steps || steps.length === 0) return { sent: 0, skipped: 0, errors: 0 }

  for (const step of steps) {
    const seq = step.outreach_sequences
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
        .select('id, email, name, stage')
        .eq('id', leadId)
        .single()

      if (!lead?.email) {
        await sb.from('outreach_steps')
          .update({ status: 'skipped', metadata: { ...(step.metadata || {}), skip_reason: 'no_email' }, updated_at: now })
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
        to: lead.email,
        subject: step.subject || '',
        body: step.body || '',
        threadId,
        replyToMessageId: replyTo,
        footerHtml: gthOptOutFooterHtml(params.cfgInner),
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
          await sb.from('outreach_steps')
            .update({ scheduled_at: new Date(Date.now() + gapHours * 3600_000).toISOString(), updated_at: sentAt })
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
