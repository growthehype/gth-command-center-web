// Lead stages only move forward on their own. Shared by the inbox
// classifier and the Gmail tracker sync.
import { getAdminClient } from './supabase-admin'

/** Where a saved lead.stage sits in the pipeline. 6 = won, 7 = closed, both final. */
export function stageRank(raw: string | null | undefined): number {
  const s = String(raw || '').toLowerCase().replace(/[_-]/g, ' ')
  if (/won/.test(s)) return 6
  if (/lost|not interested|unsubscribed|closed/.test(s)) return 7
  if (/proposal|quote/.test(s)) return 5
  if (/meeting|call/.test(s)) return 4
  if (/respond|interested|objection|replied/.test(s)) return 3
  if (/contacted|emailed/.test(s)) return 2
  return 1
}

/** Move a lead forward to `stage` if it isn't already there or past it. */
export async function advanceLead(leadId: string, stage: string, opts: { allowFinal?: boolean } = {}) {
  const sb = getAdminClient()
  const { data: lead } = await sb.from('outreach_leads').select('stage').eq('id', leadId).single()
  const cur = stageRank(lead?.stage)
  const to = stageRank(stage)
  if (cur === 6) return false
  if (cur === 7 && !opts.allowFinal) return false
  if (to !== 7 && to <= cur) return false
  await sb.from('outreach_leads').update({ stage, last_contact: new Date().toISOString().slice(0, 10) }).eq('id', leadId)
  return true
}

/** Everyone at the business who should get outreach: main address plus extras, minus anything that bounced. */
export function leadRecipients(lead: { email?: string | null; alt_emails?: string[] | null; bounced_emails?: string[] | null }): string[] {
  const bounced = new Set((lead.bounced_emails || []).map(e => e.toLowerCase().trim()))
  const out: string[] = []
  for (const e of [lead.email, ...(lead.alt_emails || [])]) {
    const v = String(e || '').toLowerCase().trim()
    if (v && v.includes('@') && !bounced.has(v) && !out.includes(v)) out.push(v)
  }
  return out
}

/** Spend guard set by the Vercel spend webhook (api/agent/spend.ts); resets each month. */
export function spendLevel(cfgInner: any): 'lean' | 'off' | null {
  const a = cfgInner?.spend_alert
  if (!a?.level || a.month !== new Date().toISOString().slice(0, 7)) return null
  return a.level === 'off' ? 'off' : a.level === 'lean' ? 'lean' : null
}
