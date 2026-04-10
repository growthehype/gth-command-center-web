// Inbox monitoring and reply classification engine
import { getAdminClient } from './supabase-admin'
import { listNewMessages, getMessageContent } from './gmail-server'
import { askClaude, extractToolUse, REPLY_CLASSIFIER_PROMPT, REPLY_CLASSIFIER_TOOLS } from './claude'

// ─── Types ──────────────────────────────────────────────────────

interface ClassifyParams {
  userId: string
  agentRunId: string
}

interface ClassifyResult {
  classified: number
  replies: number
  meetings: number
}

// ─── Helpers ────────────────────────────────────────────────────

/** Extract raw email address from a "Name <email>" string */
function extractEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/)
  if (match) return match[1].toLowerCase()
  // If no angle brackets, treat the whole string as the email
  return fromHeader.trim().toLowerCase()
}

/** Map classification to a lead stage */
function classificationToStage(classification: string): string | null {
  switch (classification) {
    case 'positive_interest':
      return 'interested'
    case 'objection':
      return 'objection'
    case 'not_interested':
      return 'not_interested'
    case 'out_of_office':
      return null // don't change stage for OOO
    case 'spam':
      return null
    default:
      return null
  }
}

// ─── Main Export ────────────────────────────────────────────────

export async function classifyInbox(params: ClassifyParams): Promise<ClassifyResult> {
  const { userId, agentRunId } = params
  const sb = getAdminClient()

  let classified = 0
  let replies = 0
  let meetings = 0

  try {
    // 1. Get recent unread messages — gracefully skip if Gmail not connected
    let messages: any[] = []
    try {
      messages = await listNewMessages(userId, 'is:unread')
    } catch (gmailErr: any) {
      const msg = String(gmailErr?.message || gmailErr || '')
      // Gmail not linked is NOT a real failure for a lead-gen agent;
      // just no-op so the rest of the run can proceed.
      if (msg.includes('No Gmail refresh token') || msg.toLowerCase().includes('refresh token')) {
        console.warn('classifyInbox: Gmail not connected, skipping')
        return { classified: 0, replies: 0, meetings: 0 }
      }
      throw gmailErr
    }

    if (!messages || messages.length === 0) {
      return { classified: 0, replies: 0, meetings: 0 }
    }

    // 2. Fetch all outreach lead emails for this user (for matching)
    const { data: leads } = await sb
      .from('outreach_leads')
      .select('id, email, name, stage')
      .eq('user_id', userId)
      .not('email', 'is', null)

    const leadsByEmail = new Map<string, any>()
    for (const lead of (leads || [])) {
      if (lead.email) {
        leadsByEmail.set(lead.email.toLowerCase(), lead)
      }
    }

    // 3. Also check which messages we've already classified
    const messageIds = messages.map((m: any) => m.id)
    const { data: alreadyClassified } = await sb
      .from('agent_inbox_classifications')
      .select('gmail_message_id')
      .in('gmail_message_id', messageIds)

    const classifiedSet = new Set((alreadyClassified || []).map((c: any) => c.gmail_message_id))

    // 4. Process each message
    for (const msg of messages) {
      if (classifiedSet.has(msg.id)) continue

      try {
        // Get full message content
        const content = await getMessageContent(userId, msg.id)
        const senderEmail = extractEmail(content.from)

        // Check if sender matches any outreach lead
        const matchedLead = leadsByEmail.get(senderEmail)

        if (!matchedLead) {
          // Not from a known outreach lead — skip classification
          continue
        }

        replies++

        // Classify the reply via Claude
        const replyText = content.bodyText || content.snippet || ''
        const response = await askClaude({
          systemPrompt: REPLY_CLASSIFIER_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Classify this email reply from "${matchedLead.name}" (${senderEmail}):\n\nSubject: ${content.subject}\n\n${replyText}`,
            },
          ],
          tools: REPLY_CLASSIFIER_TOOLS,
        })

        const toolResult = extractToolUse(response)

        let classification = 'other'
        let confidence = 0.5
        let summary = ''
        let suggestedAction = 'flag_for_human'
        let draftResponse: string | null = null

        if (toolResult && toolResult.name === 'classify_reply') {
          classification = toolResult.input.classification || 'other'
          confidence = toolResult.input.confidence ?? 0.5
          summary = toolResult.input.summary || ''
          suggestedAction = toolResult.input.suggested_action || 'flag_for_human'
          draftResponse = toolResult.input.draft_response || null
        }

        // Insert classification record
        const { error: insertErr } = await sb
          .from('agent_inbox_classifications')
          .insert({
            user_id: userId,
            agent_run_id: agentRunId,
            gmail_message_id: msg.id,
            gmail_thread_id: content.threadId,
            lead_id: matchedLead.id,
            sender_email: senderEmail,
            subject: content.subject,
            classification,
            confidence,
            summary,
            suggested_action: suggestedAction,
            draft_response: draftResponse,
            classified_at: new Date().toISOString(),
          })

        if (insertErr) {
          console.error(`Error inserting classification for message ${msg.id}:`, insertErr)
          continue
        }

        classified++

        // Track meetings
        if (suggestedAction === 'schedule_call') {
          meetings++
        }

        // Update linked outreach_sequences status to 'replied'
        const { data: sequences } = await sb
          .from('outreach_sequences')
          .select('id')
          .eq('lead_id', matchedLead.id)
          .eq('user_id', userId)
          .in('status', ['active', 'draft'])

        if (sequences && sequences.length > 0) {
          const seqIds = sequences.map((s: any) => s.id)
          await sb
            .from('outreach_sequences')
            .update({ status: 'replied', replied_at: new Date().toISOString() })
            .in('id', seqIds)
        }

        // Update lead stage based on classification
        const newStage = classificationToStage(classification)
        if (newStage) {
          await sb
            .from('outreach_leads')
            .update({ stage: newStage })
            .eq('id', matchedLead.id)
        }
      } catch (msgErr) {
        console.error(`Error processing message ${msg.id}:`, msgErr)
        continue
      }
    }

    return { classified, replies, meetings }
  } catch (error) {
    console.error('classifyInbox failed:', error)
    throw error
  }
}
