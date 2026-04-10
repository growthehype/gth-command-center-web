// Email sending engine — dispatches scheduled outreach steps via Gmail
import { getAdminClient } from './supabase-admin'
import { sendEmail } from './gmail-server'
import { checkRateLimit, incrementCounter, DEFAULT_LIMITS } from './rate-limiter'

// ─── Types ──────────────────────────────────────────────────────

interface SendParams {
  userId: string
  agentRunId: string
}

interface SendResult {
  sent: number
  skipped: number
  errors: number
}

// ─── Main Export ────────────────────────────────────────────────

export async function sendScheduledEmails(params: SendParams): Promise<SendResult> {
  const { userId, agentRunId } = params
  const sb = getAdminClient()

  let sent = 0
  let skipped = 0
  let errors = 0

  try {
    // 1. Fetch steps that are scheduled and due
    const now = new Date().toISOString()
    const { data: steps, error: fetchErr } = await sb
      .from('outreach_steps')
      .select('*, outreach_sequences!inner(id, lead_id, status)')
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })

    if (fetchErr) throw fetchErr
    if (!steps || steps.length === 0) {
      return { sent: 0, skipped: 0, errors: 0 }
    }

    // 2. Process each step
    for (const step of steps) {
      try {
        // Check rate limit before each send
        const limit = await checkRateLimit(userId, 'email_send', DEFAULT_LIMITS.email_send)
        if (!limit.allowed) {
          console.error(`Rate limit reached for user ${userId} — stopping email sends`)
          skipped += (steps.length - sent - skipped - errors)
          break
        }

        // Look up the lead to get recipient email
        const leadId = step.outreach_sequences?.lead_id || step.lead_id
        if (!leadId) {
          console.error(`Step ${step.id} has no associated lead`)
          errors++
          continue
        }

        const { data: lead, error: leadErr } = await sb
          .from('outreach_leads')
          .select('email, name')
          .eq('id', leadId)
          .single()

        if (leadErr || !lead) {
          console.error(`Lead ${leadId} not found for step ${step.id}:`, leadErr)
          errors++
          continue
        }

        if (!lead.email) {
          console.error(`Lead ${leadId} (${lead.name}) has no email address — skipping`)
          // Mark as skipped so we don't retry endlessly
          await sb
            .from('outreach_steps')
            .update({ status: 'skipped', metadata: { reason: 'no_email' } })
            .eq('id', step.id)
          skipped++
          continue
        }

        // Determine if this is a reply in a thread
        let threadId: string | undefined
        let replyToMessageId: string | undefined

        if (step.step_number > 1) {
          // Look for the previous step's gmail IDs to thread the conversation
          const { data: prevStep } = await sb
            .from('outreach_steps')
            .select('gmail_message_id, gmail_thread_id')
            .eq('sequence_id', step.sequence_id)
            .eq('status', 'sent')
            .order('step_number', { ascending: false })
            .limit(1)
            .single()

          if (prevStep) {
            threadId = prevStep.gmail_thread_id || undefined
            replyToMessageId = prevStep.gmail_message_id || undefined
          }
        }

        // Send the email via Gmail
        const result = await sendEmail(userId, {
          to: lead.email,
          subject: step.subject,
          body: step.body,
          threadId,
          replyToMessageId,
        })

        // Update the step record
        await sb
          .from('outreach_steps')
          .update({
            status: 'sent',
            executed_at: new Date().toISOString(),
            gmail_message_id: result.id,
            gmail_thread_id: result.threadId,
          })
          .eq('id', step.id)

        // Update lead stage if this is the first email
        if (step.step_number === 1) {
          await sb
            .from('outreach_leads')
            .update({ stage: 'contacted' })
            .eq('id', leadId)
        } else if (step.step_number >= 3) {
          // After break-up email, update to 'follow_up_exhausted' if no reply
          await sb
            .from('outreach_leads')
            .update({ stage: 'follow_up_sent' })
            .eq('id', leadId)
        }

        // Increment rate limit counter
        await incrementCounter(userId, 'email_send')

        sent++
      } catch (stepErr) {
        console.error(`Error sending step ${step.id}:`, stepErr)

        // Mark step as failed
        try {
          await sb
            .from('outreach_steps')
            .update({
              status: 'failed',
              metadata: { error: stepErr instanceof Error ? stepErr.message : String(stepErr) },
            })
            .eq('id', step.id)
        } catch (updateErr) {
          console.error(`Failed to mark step ${step.id} as failed:`, updateErr)
        }

        errors++
      }
    }

    return { sent, skipped, errors }
  } catch (error) {
    console.error('sendScheduledEmails failed:', error)
    throw error
  }
}
