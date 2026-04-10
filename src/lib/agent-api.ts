// Frontend API wrapper for AI agent system
import { supabase } from './supabase'

// ─── Gmail Integration ─────────────────────────────────────────

/** Persist the Gmail refresh token from localStorage to Supabase via the server endpoint */
export async function linkGmailRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('gth_gmail_refresh_token')
  if (!refreshToken) return false

  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return false

  try {
    const res = await fetch('/api/agent/link-gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, refreshToken }),
    })
    const json = await res.json()
    return json.stored === true
  } catch {
    return false
  }
}

// ─── Agent Trigger / Status ────────────────────────────────────

/** Manually trigger an agent run */
export async function triggerAgent(agentType: string, userId: string): Promise<{ runId: string; status: string }> {
  const res = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentType, userId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Agent trigger failed (${res.status})`)
  }
  return res.json()
}

/** Get the latest agent run status for a user */
export async function getAgentStatus(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(10)

  if (error) throw error
  return data || []
}

// ─── Outreach Step Actions ─────────────────────────────────────

/** Approve a pending outreach step (mark it ready to send) */
export async function approveStep(stepId: string): Promise<void> {
  const { error } = await supabase
    .from('outreach_steps')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', stepId)

  if (error) throw error
}

/** Reject / skip a pending outreach step */
export async function rejectStep(stepId: string): Promise<void> {
  const { error } = await supabase
    .from('outreach_steps')
    .update({ status: 'rejected', rejected_at: new Date().toISOString() })
    .eq('id', stepId)

  if (error) throw error
}

/** Edit and optionally approve an outreach step */
export async function editStep(stepId: string, subject: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('outreach_steps')
    .update({
      subject,
      body,
      status: 'edited',
      edited_at: new Date().toISOString(),
    })
    .eq('id', stepId)

  if (error) throw error
}
