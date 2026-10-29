// Inbox monitoring and reply classification engine
import { getAdminClient } from './supabase-admin'
import { searchMessageMeta, getMessageContent } from './gmail-server'
import { askClaude, extractToolUse, REPLY_CLASSIFIER_PROMPT, REPLY_CLASSIFIER_TOOLS } from './claude'
import { advanceLead } from './lead-stage'

// ─── Types ──────────────────────────────────────────────────────

interface ClassifyParams {
  userId: string
  agentRunId: string
  /** Replies found inside outreach threads (may be archived or filtered) */
  extraMessageIds?: string[]
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
  const { userId, agentRunId, extraMessageIds = [] } = params
  const sb = getAdminClient()

  let classified = 0
  let replies = 0
  let meetings = 0

  try {
    // 1. Get recent unread messages — gracefully skip if Gmail not connected
    let messages: any[] = []
    try {
      // Read state doesn't matter: Omar may open a reply before the agent runs.
      // Already-classified messages are skipped below.
      messages = await searchMessageMeta(userId, 'in:inbox newer_than:14d -from:me -category:promotions -category:social', 150)
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

    for (const id of extraMessageIds) if (!messages.some((m: any) => m.id === id)) messages.push({ id })
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

    // Only open messages that could be from a lead: a known address, an
    // outreach thread, or a reply the thread check already found
    const { data: threadRows } = await sb.from('outreach_steps').select('gmail_thread_id').eq('user_id', userId).not('gmail_thread_id', 'is', null)
    const outreachThreads = new Set((threadRows || []).map((r: any) => r.gmail_thread_id))
    const extra = new Set(extraMessageIds)
    messages = messages.filter((m: any) => extra.has(m.id) || !m.from || leadsByEmail.has(extractEmail(m.from)) || outreachThreads.has(m.threadId))

    // 4. Process each message
    for (const msg of messages) {
      if (classifiedSet.has(msg.id)) continue

      try {
        // Get full message content
        const content = await getMessageContent(userId, msg.id)
        const senderEmail = extractEmail(content.from)

        // Match the sender to a lead: exact address first, then the thread
        // (people often reply from a different address than the one we found)
        let matchedLead = leadsByEmail.get(senderEmail)
        if (!matchedLead && content.threadId) {
          const { data: threadStep } = await sb
            .from('outreach_steps')
            .select('lead_id, outreach_sequences(lead_id)')
            .eq('user_id', userId)
            .eq('gmail_thread_id', content.threadId)
            .limit(1)
            .maybeSingle()
          const tl = (threadStep as any)?.lead_id || (threadStep as any)?.outreach_sequences?.lead_id
          if (tl) matchedLead = (leads || []).find((l: any) => l.id === tl) || { id: tl, name: senderEmail, email: senderEmail }
        }

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
          tier: 'fast',
          maxTokens: 700,
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
            linked_lead_id: matchedLead.id,
            from_email: senderEmail,
            subject: content.subject,
            classification,
            confidence,
            summary,
            suggested_action: suggestedAction,
            draft_response: draftResponse,
            processed_at: new Date().toISOString(),
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

        // Any real reply ends the automated sequence. Out-of-office and spam
        // don't count. "Not interested" is treated as an opt-out (CASL).
        if (classification !== 'out_of_office' && classification !== 'spam') {
          const { data: sequences } = await sb
            .from('outreach_sequences')
            .select('id')
            .eq('lead_id', matchedLead.id)
            .eq('user_id', userId)
            .in('status', ['active', 'draft', 'paused'])

          if (sequences && sequences.length > 0) {
            const seqIds = sequences.map((s: any) => s.id)
            const stamp = new Date().toISOString()
            await sb
              .from('outreach_sequences')
              .update({
                status: classification === 'not_interested' ? 'unsubscribed' : 'replied',
                replied_at: stamp,
                updated_at: stamp,
              })
              .in('id', seqIds)
            await sb
              .from('outreach_steps')
              .update({ status: 'skipped', updated_at: stamp })
              .in('sequence_id', seqIds)
              .in('status', ['pending', 'scheduled', 'approved', 'draft'])
          }
        }

        // Update lead stage based on classification
        // Forward only: a lead already at Call booked or Proposal stays there
        const newStage = classificationToStage(classification)
        if (newStage) await advanceLead(matchedLead.id, newStage)
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
