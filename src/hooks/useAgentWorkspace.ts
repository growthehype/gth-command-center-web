import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'
import { useAppStore } from '@/lib/store'
import type { LeadAgent } from '@/components/outreach/LeadAgents'

/** One email in a sequence, with its lead attached */
export interface WorkStep {
  id: string
  sequence_id: string
  step_number: number
  status: string
  subject: string | null
  body: string | null
  scheduled_at: string | null
  executed_at: string | null
  metadata: Record<string, any> | null
  sequence: { id: string; status: string; agent_config_id: string | null; lead: any }
}

export interface AgentRunRow {
  id: string
  started_at: string
  completed_at: string | null
  status: string
  triggered_by: string | null
  summary: any
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }
}

export async function callAgent(body: Record<string, any>) {
  const res = await fetch('/api/agent/run', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) })
  const raw = await res.text()
  let data: any = {}
  try { data = JSON.parse(raw) } catch { /* not JSON */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

/**
 * Everything the agent workspace needs for one agent: emails waiting for
 * Omar, emails already sent, and recent runs.
 */
export function useAgentWorkspace(agent: LeadAgent | null) {
  const [ready, setReady] = useState<WorkStep[]>([])
  const [scheduled, setScheduled] = useState<WorkStep[]>([])
  const [inGmail, setInGmail] = useState<WorkStep[]>([])
  const [sent, setSent] = useState<WorkStep[]>([])
  const [runs, setRuns] = useState<AgentRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const demo = useAppStore(s => s.demoMode)

  const load = useCallback(async () => {
    if (!agent || demo) {
      // Demo: show the sample drafts so the page can be explored
      const leads = demo ? useAppStore.getState().leads.filter(l => l.agent_config_id === agent?.id && l.enrichment_data?.demo_draft) : []
      setReady(leads.map(l => ({
        id: `demo-step-${l.id}`, sequence_id: `demo-seq-${l.id}`, step_number: 1, status: 'pending',
        subject: l.enrichment_data!.demo_draft.subject, body: l.enrichment_data!.demo_draft.body,
        scheduled_at: new Date().toISOString(), executed_at: null, metadata: {},
        sequence: { id: `demo-seq-${l.id}`, status: 'draft', agent_config_id: agent?.id || null, lead: l },
      })))
      setScheduled([]); setInGmail([]); setSent([]); setRuns([]); setLoading(false); return
    }
    // Pick up anything Omar sent from his Gmail Drafts since last look
    if (agent.config?.delivery !== 'export') {
      try { await callAgent({ mode: 'sync_drafts', agentType: agent.agent_type, configId: agent.id }) } catch { /* offline is fine */ }
    }
    const select = '*, sequence:outreach_sequences!inner(id, status, agent_config_id, lead:outreach_leads(*))'
    const nowIso = new Date().toISOString()
    const [pending, sched, done, runRows, drafted] = await Promise.all([
      supabase.from('outreach_steps').select(select)
        .eq('sequence.agent_config_id', agent.id)
        .eq('status', 'pending').not('scheduled_at', 'is', null).lte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true }).limit(200),
      supabase.from('outreach_steps').select(select)
        .eq('sequence.agent_config_id', agent.id)
        .eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true }).limit(200),
      supabase.from('outreach_steps').select(select)
        .eq('sequence.agent_config_id', agent.id)
        .in('status', ['sent', 'replied', 'bounced', 'failed'])
        .order('executed_at', { ascending: false }).limit(200),
      supabase.from('agent_runs').select('id, started_at, completed_at, status, triggered_by, summary')
        .eq('agent_config_id', agent.id)
        .order('started_at', { ascending: false }).limit(15),
      supabase.from('outreach_steps').select(select)
        .eq('sequence.agent_config_id', agent.id)
        .eq('status', 'approved').not('gmail_thread_id', 'is', null)
        .order('updated_at', { ascending: false }).limit(100),
    ])
    const live = (rows: any[] | null) => (rows || []).filter(r => r.sequence && !['replied', 'stopped', 'unsubscribed', 'completed', 'bounced'].includes(r.sequence.status))
    setReady(live(pending.data) as WorkStep[])
    setScheduled(live(sched.data) as WorkStep[])
    setInGmail(((drafted.data || []) as WorkStep[]).filter(s => s.metadata?.via === 'gmail_draft'))
    setSent((done.data || []) as WorkStep[])
    // Older runs may not carry agent_config_id; fall back to the agent type
    if (runRows.data && runRows.data.length) setRuns(runRows.data as AgentRunRow[])
    else {
      const { data } = await supabase.from('agent_runs').select('id, started_at, completed_at, status, triggered_by, summary')
        .eq('agent_type', agent.agent_type).order('started_at', { ascending: false }).limit(15)
      setRuns((data || []) as AgentRunRow[])
    }
    setLoading(false)
  }, [agent, demo])

  useEffect(() => { setLoading(true); load() }, [load])

  /** Approve one email and send it from Gmail now */
  const send = useCallback(async (step: WorkStep) => {
    const now = new Date().toISOString()
    const edited = !!step.metadata?.edited
    const { error } = await supabase.from('outreach_steps')
      .update({ status: 'scheduled', approval_status: edited ? 'edited' : 'approved', scheduled_at: now, updated_at: now })
      .eq('id', step.id)
    if (error) { showToast(error.message, 'error'); return false }
    await supabase.from('outreach_sequences').update({ status: 'active', updated_at: now }).eq('id', step.sequence_id).eq('status', 'draft')
    setReady(prev => prev.filter(s => s.id !== step.id))
    try {
      const r = await callAgent({ mode: 'send_approved', agentType: agent?.agent_type, configId: agent?.id })
      const res = r?.results?.send_emails || {}
      if (res.sent) showToast(`Sent to ${step.sequence?.lead?.name || 'the lead'}`, 'success')
      else if (res.firstError) showToast(`Approved, but Gmail said: ${res.firstError}`, 'error')
      else showToast('Approved. It goes out with the next send (daily limit or Gmail check).', 'info')
    } catch (err: any) {
      showToast(`Approved, but not sent yet: ${err?.message || 'send failed'}`, 'error')
    }
    await load()
    return true
  }, [agent, load])

  const save = useCallback(async (step: WorkStep, subject: string, body: string) => {
    const metadata = { ...(step.metadata || {}), edited: true }
    const { error } = await supabase.from('outreach_steps')
      .update({ subject, body, approval_status: 'edited', metadata, updated_at: new Date().toISOString() })
      .eq('id', step.id)
    if (error) { showToast(error.message, 'error'); return false }
    const patch = (list: WorkStep[]) => list.map(s => s.id === step.id ? { ...s, subject, body, metadata } : s)
    setReady(patch); setScheduled(patch)
    showToast('Saved', 'success')
    return true
  }, [])

  /** Skip: drop the lead from this sequence */
  const skip = useCallback(async (step: WorkStep) => {
    const now = new Date().toISOString()
    await supabase.from('outreach_steps').update({ status: 'skipped', approval_status: 'rejected', updated_at: now }).eq('id', step.id)
    if (step.step_number === 1) {
      await supabase.from('outreach_sequences').update({ status: 'stopped', updated_at: now }).eq('id', step.sequence_id)
      await supabase.from('outreach_steps').update({ status: 'skipped', updated_at: now }).eq('sequence_id', step.sequence_id).in('status', ['pending', 'scheduled'])
    }
    setReady(prev => prev.filter(s => s.id !== step.id))
    showToast('Skipped', 'info')
  }, [])

  /** Put the email in Omar's Gmail Drafts to send from Gmail */
  const toGmail = useCallback(async (step: WorkStep) => {
    try {
      await callAgent({ mode: 'gmail_draft', agentType: agent?.agent_type, configId: agent?.id, stepId: step.id })
      setReady(prev => prev.filter(s => s.id !== step.id))
      showToast(`In your Gmail Drafts. Send it from Gmail and it shows as sent here.`, 'success')
      await load()
      return true
    } catch (err: any) {
      showToast(err?.message || 'Could not create the Gmail draft', 'error')
      return false
    }
  }, [agent, load])

  /** Client agents: copy the email and mark it handed over */
  const copy = useCallback(async (step: WorkStep) => {
    const lead = step.sequence?.lead
    try { await navigator.clipboard.writeText(`To: ${lead?.email || ''}\nSubject: ${step.subject || ''}\n\n${step.body || ''}`) } catch { /* blocked */ }
    await supabase.from('outreach_steps').update({ status: 'approved', approval_status: 'approved', updated_at: new Date().toISOString() }).eq('id', step.id)
    setReady(prev => prev.filter(s => s.id !== step.id))
    showToast(`Copied the email for ${lead?.name || 'this lead'}`, 'success')
  }, [])

  return { ready, scheduled, inGmail, sent, runs, loading, reload: load, send, save, skip, copy, toGmail }
}

/** All steps of one lead's sequence (for the lead file) */
export async function loadLeadSequence(leadId: string): Promise<WorkStep[]> {
  const { data } = await supabase.from('outreach_steps')
    .select('*, sequence:outreach_sequences!inner(id, status, agent_config_id, lead:outreach_leads(*))')
    .eq('lead_id', leadId)
    .order('step_number', { ascending: true })
  return (data || []) as WorkStep[]
}
