// Frontend API wrapper for AI agent system
import { supabase } from './supabase'

// ─── Agent Trigger / Status ────────────────────────────────────

/** Manually trigger an agent run */
export async function triggerAgent(agentType: string, userId: string): Promise<{ runId: string; status: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated — please sign in again')
  }
  const res = await fetch('/api/agent/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ agentType }),
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
