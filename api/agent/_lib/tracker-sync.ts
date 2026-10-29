// Keeps the lead tracker in step with Omar's Gmail without him touching it.
// Runs every 20 minutes (hunt cron) and whenever the agents page opens.
//
// What it picks up:
// - Drafts he sent from Gmail (sender.syncGmailDrafts)
// - Emails he wrote to a lead himself, outside the queue. They count as the
//   next touch, so the automatic follow-ups never double up on someone.
// - Replies in the outreach thread, even ones archived or filtered out of
//   the inbox, then classified (interested, objection, not interested...)
// - Bounces: the sequence stops and the tracker says to find another address
// - Calendar invites accepted by the lead: Call booked
// - A proposal or quote he sent after they replied: Proposal
// A lead only ever moves forward on its own. Won and Closed are left alone.
import { getAdminClient } from './supabase-admin'
import { searchMessageMeta, getThreadMeta, type MessageMeta } from './gmail-server'
import { markStepSent, syncGmailDrafts } from './sender'
import { classifyInbox } from './inbox-classifier'
import { stageRank, advanceLead } from './lead-stage'

const LIVE = ['draft', 'active', 'paused']
const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i
const BOUNCE_SUBJ = /undeliver|delivery status notification|delivery has failed|mail delivery failed|returned mail|failure notice|address not found|message not delivered/i
const INVITE_OK = /^(accepted|invitation|updated invitation|new event)\b.*:/i
const PROPOSAL = /\b(proposal|quote|estimate|scope of work|agreement|contract)\b/i

const emails = (h: string) => [...String(h || '').matchAll(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/g)].map(m => m[0].toLowerCase())

/** Stop the automatic emails for a lead's live sequences. */
async function stopSequences(leadId: string, status: string, at: string) {
  const sb = getAdminClient()
  const { data: seqs } = await sb.from('outreach_sequences').select('id, replied_at').eq('lead_id', leadId).in('status', [...LIVE, 'completed'])
  const ids = (seqs || []).map((s: any) => s.id)
  if (!ids.length) return 0
  await sb.from('outreach_sequences').update({ status, ...(status === 'replied' ? { replied_at: (seqs as any[])[0]?.replied_at || at } : {}), updated_at: at }).in('id', ids)
  const { data } = await sb.from('outreach_steps').update({ status: 'skipped', updated_at: at }).in('sequence_id', ids).in('status', ['pending', 'scheduled', 'approved', 'draft']).select('id')
  return data?.length || 0
}

export interface TrackerSync {
  drafts: number
  ownEmails: number
  replies: number
  bounces: number
  calls: number
  proposals: number
  classified: number
  error?: string
}

export async function syncTracker(params: { userId: string; cfgInner?: any }): Promise<TrackerSync> {
  const { userId, cfgInner } = params
  const sb = getAdminClient()
  const out: TrackerSync = { drafts: 0, ownEmails: 0, replies: 0, bounces: 0, calls: 0, proposals: 0, classified: 0 }

  // 1. Drafts sent from Gmail
  try { out.drafts = (await syncGmailDrafts({ userId, cfgInner })).nowSent } catch { /* keep going */ }

  const { data: leads } = await sb.from('outreach_leads').select('id, email, name, stage').eq('user_id', userId).not('email', 'is', null)
  const byEmail = new Map<string, any>()
  for (const l of leads || []) if (l.email) byEmail.set(String(l.email).toLowerCase().trim(), l)
  if (!byEmail.size) return out

  // 2. Emails Omar wrote to a lead himself (last 10 days)
  let sent: MessageMeta[] = []
  try { sent = await searchMessageMeta(userId, 'in:sent newer_than:10d', 150) } catch (e: any) {
    out.error = String(e?.message || e).slice(0, 200)
    return out
  }
  sent.sort((a, b) => a.internalDate.localeCompare(b.internalDate))
  const sentIds = sent.map(m => m.id)
  const { data: knownRows } = sentIds.length
    ? await sb.from('outreach_steps').select('gmail_message_id').eq('user_id', userId).in('gmail_message_id', sentIds)
    : { data: [] as any[] }
  const known = new Set((knownRows || []).map((r: any) => r.gmail_message_id))

  for (const m of sent) {
    if (known.has(m.id) || m.labelIds.includes('DRAFT')) continue
    const lead = [...emails(m.to), ...emails(m.cc)].map(a => byEmail.get(a)).find(Boolean)
    if (!lead) continue
    const { data: seqs } = await sb.from('outreach_sequences').select('id, status, created_at').eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(1)
    const seq = seqs?.[0]

    if (seq && LIVE.includes(seq.status)) {
      if (m.internalDate < seq.created_at) continue
      const { data: steps } = await sb.from('outreach_steps')
        .select('*, outreach_sequences!inner(id, lead_id, status, total_steps)')
        .eq('sequence_id', seq.id).order('step_number', { ascending: true })
      const all = steps || []
      const lastSent = [...all].reverse().find((s: any) => s.status === 'sent')
      if (lastSent?.executed_at && m.internalDate <= lastSent.executed_at) continue
      const next = all.find((s: any) => ['pending', 'approved', 'scheduled', 'draft', 'failed'].includes(s.status))
      if (!next) continue
      const own = next.metadata?.via === 'gmail_draft' ? {} : { via: 'gmail_own', own_subject: m.subject.slice(0, 200) }
      const ok = await markStepSent(next, { id: m.id, sentAt: m.internalDate, rfcMessageId: m.rfcMessageId, threadId: m.threadId }, cfgInner, own)
      if (ok) { out.ownEmails++; known.add(m.id) }
      continue
    }

    // In conversation: a proposal or quote after they replied
    const rank = stageRank(lead.stage)
    const talking = seq?.status === 'replied' || (rank >= 3 && rank < 6)
    if (talking && (m.hasPdf || PROPOSAL.test(`${m.subject} ${m.snippet}`))) {
      if (await advanceLead(lead.id, 'Proposal Sent')) { out.proposals++; lead.stage = 'Proposal Sent' }
      continue
    }
    if (!seq && rank === 1) {
      await sb.from('outreach_leads').update({ stage: 'contacted', last_contact: m.internalDate.slice(0, 10) }).eq('id', lead.id)
      lead.stage = 'contacted'
    }
  }

  // 3. Replies and bounces inside outreach threads (archived or filtered ones too)
  const since = new Date(Date.now() - 45 * 86400_000).toISOString()
  const { data: openSteps } = await sb.from('outreach_steps')
    .select('gmail_thread_id, executed_at, outreach_sequences!inner(id, lead_id, status, user_id)')
    .eq('user_id', userId).eq('status', 'sent').eq('step_number', 1)
    .not('gmail_thread_id', 'is', null).gte('executed_at', since)
    .in('outreach_sequences.status', ['active', 'completed'])
    .limit(80)
  const replyIds: string[] = []
  for (const s of openSteps || []) {
    const seq = (s as any).outreach_sequences
    const msgs = await getThreadMeta(userId, s.gmail_thread_id).catch(() => null)
    if (!msgs) continue
    for (const m of msgs) {
      if (m.labelIds.includes('SENT') || m.labelIds.includes('DRAFT')) continue
      if (s.executed_at && m.internalDate < s.executed_at) continue
      if (BOUNCE_FROM.test(m.from) || BOUNCE_SUBJ.test(m.subject)) {
        const at = new Date().toISOString()
        await sb.from('outreach_sequences').update({ status: 'bounced', updated_at: at }).eq('id', seq.id)
        await sb.from('outreach_steps').update({ status: 'skipped', updated_at: at }).eq('sequence_id', seq.id).in('status', ['pending', 'scheduled', 'approved', 'draft'])
        out.bounces++
        break
      }
      replyIds.push(m.id)
    }
  }
  out.replies = replyIds.length

  // 4. Calendar invites the lead accepted, or sent to Omar
  try {
    const inv = await searchMessageMeta(userId, 'newer_than:14d -in:sent subject:(accepted OR invitation OR "new event")', 40)
    for (const m of inv) {
      if (!INVITE_OK.test(m.subject)) continue
      const lead = emails(m.from).map(a => byEmail.get(a)).find(Boolean)
        || (/calendar|calendly/i.test(m.from) ? [...emails(m.to), ...emails(m.snippet)].map(a => byEmail.get(a)).find(Boolean) : null)
      if (!lead) continue
      if (await advanceLead(lead.id, 'Meeting Set')) {
        out.calls++
        await stopSequences(lead.id, 'replied', m.internalDate)
      }
    }
  } catch { /* optional */ }

  // 5. Read and classify replies (inbox plus the thread replies found above)
  try {
    const r = await classifyInbox({ userId, agentRunId: null as any, extraMessageIds: replyIds })
    out.classified = r.classified
  } catch { /* Gmail may be offline */ }

  return out
}
