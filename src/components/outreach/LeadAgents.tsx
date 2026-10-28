import { useCallback, useEffect, useMemo, useState } from 'react'
import { Play, Plus, Settings2, Loader2, Pause } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import { relativeDate } from '@/lib/utils'
import { useAppStore, type Client, type OutreachLead } from '@/lib/store'

/* ========================================
   DATA
   ======================================== */

export interface LeadAgent {
  id: string
  user_id: string
  agent_name: string | null
  agent_type: 'lead_gen' | 'client' | 'sales'
  enabled: boolean
  config: Record<string, any>
  last_run_at: string | null
  last_run_status: string | null
  last_run_summary: string | null
  created_at: string
}

export const isGthAgent = (a: LeadAgent | null | undefined) => a?.config?.profile === 'gth'
export const isExportAgent = (a: LeadAgent | null | undefined) => a?.config?.delivery === 'export'
export const agentFor = (a: LeadAgent) =>
  isGthAgent(a) ? 'Grow The Hype' : (a.config?.client_name || a.config?.client_business || 'Client')

/** Lead belongs to an agent: by id, or by name for older rows */
export function leadBelongsTo(lead: OutreachLead, agent: LeadAgent): boolean {
  if (lead.agent_config_id) return lead.agent_config_id === agent.id
  const n = (lead.agent_name || '').trim().toLowerCase()
  return !!n && !!agent.agent_name && n.startsWith(agent.agent_name.toLowerCase())
}

const DEMO_AGENTS: LeadAgent[] = [
  { id: 'demo-gth', user_id: 'demo', agent_name: 'Selina', agent_type: 'lead_gen', enabled: true,
    config: { profile: 'gth', client_name: 'Grow The Hype', search_terms: ['accounting firm', 'dental clinic'], search_areas: ['Edmonton, AB'] },
    last_run_at: new Date(Date.now() - 36e5).toISOString(), last_run_status: 'completed', last_run_summary: '25 new leads · 14 scored · 6 drafts ready', created_at: '2026-01-01' },
  { id: 'demo-client', user_id: 'demo', agent_name: 'Frank', agent_type: 'client', enabled: false,
    config: { profile: 'client', delivery: 'export', client_name: 'Sample Client', search_terms: ['general contractor'], search_areas: ['Edmonton, AB'] },
    last_run_at: null, last_run_status: null, last_run_summary: null, created_at: '2026-01-02' },
]

export function useLeadAgents() {
  const [agents, setAgents] = useState<LeadAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    if (useAppStore.getState().demoMode) {
      setAgents(DEMO_AGENTS)
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('agent_configs')
      .select('*')
      .in('agent_type', ['lead_gen', 'client'])
      .order('created_at', { ascending: true })
    if (error) showToast('Could not load your lead agents', 'error')
    // GTH first, then client agents in the order they were made
    const list = ((data || []) as LeadAgent[]).sort((a, b) => Number(isGthAgent(b)) - Number(isGthAgent(a)))
    setAgents(list)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const run = useCallback(async (agent: LeadAgent): Promise<boolean> => {
    setRunning(prev => new Set(prev).add(agent.id))
    showToast(`${agent.agent_name || 'Agent'} is searching for ${agentFor(agent)} leads…`, 'info')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ agentType: agent.agent_type, configId: agent.id }),
      })
      const raw = await res.text()
      let body: any = {}
      try { body = JSON.parse(raw) } catch { /* not JSON */ }
      if (!res.ok) throw new Error(body?.error || `Run failed (${res.status})`)
      if (body.status === 'skipped') {
        showToast(`${agent.agent_name}: ${body.reason || 'nothing to do right now'}`, 'info')
      } else {
        const errs: string[] = body?.results?.generate_emails?.errors || []
        showToast(
          `${agent.agent_name}: ${body.summary || 'done'}${errs.length ? `. ${errs.length} draft${errs.length === 1 ? '' : 's'} need another try` : ''}`,
          errs.length || body.status === 'partial' ? 'warn' : 'success',
        )
      }
      await reload()
      return true
    } catch (err: any) {
      showToast(err?.message || 'The agent could not run', 'error')
      return false
    } finally {
      setRunning(prev => { const n = new Set(prev); n.delete(agent.id); return n })
    }
  }, [reload])

  const save = useCallback(async (input: { id?: string; agent_name: string; enabled: boolean; config: Record<string, any> }) => {
    const now = new Date().toISOString()
    if (input.id) {
      const { error } = await supabase
        .from('agent_configs')
        .update({ agent_name: input.agent_name, enabled: input.enabled, config: input.config, updated_at: now })
        .eq('id', input.id)
      if (error) throw error
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('agent_configs').insert({
        user_id: user.id,
        agent_type: 'client',
        agent_name: input.agent_name,
        enabled: input.enabled,
        schedule_cron: '0 16 * * 1-5',
        config: input.config,
        created_at: now,
        updated_at: now,
      })
      if (error) throw error
    }
    await reload()
  }, [reload])

  const setEnabled = useCallback(async (agent: LeadAgent, enabled: boolean) => {
    const { error } = await supabase.from('agent_configs').update({ enabled, updated_at: new Date().toISOString() }).eq('id', agent.id)
    if (error) { showToast(error.message, 'error'); return }
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, enabled } : a))
    showToast(`${agent.agent_name} ${enabled ? 'is back on its daily run' : 'is paused'}`, 'success')
  }, [])

  const remove = useCallback(async (agent: LeadAgent) => {
    const { error } = await supabase.from('agent_configs').delete().eq('id', agent.id)
    if (error) throw error
    await reload()
  }, [reload])

  return { agents, loading, running, reload, run, save, setEnabled, remove }
}

/* ========================================
   AGENT DECK
   ======================================== */

interface DeckProps {
  agents: LeadAgent[]
  leads: OutreachLead[]
  drafts: Record<string, number>
  selected: string
  onSelect: (id: string) => void
  running: Set<string>
  onRun: (agent: LeadAgent) => void
  onSettings: (agent: LeadAgent) => void
  onNew: () => void
  manualCount: number
}

function monogram(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A'
}

export function AgentDeck({ agents, leads, drafts, selected, onSelect, running, onRun, onSettings, onNew, manualCount }: DeckProps) {
  const startOfDay = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }, [])

  return (
    <div className="la-deck" role="tablist" aria-label="Lead agents">
      {agents.map(agent => {
        const mine = leads.filter(l => leadBelongsTo(l, agent))
        const today = mine.filter(l => l.created_at && new Date(l.created_at).getTime() >= startOfDay).length
        const isOn = selected === agent.id
        const busy = running.has(agent.id)
        const waiting = drafts[agent.id] || 0
        return (
          <div
            key={agent.id}
            role="tab"
            tabIndex={0}
            aria-selected={isOn}
            className={`la-card ${isOn ? 'la-card--on' : ''} ${busy ? 'la-card--busy' : ''}`}
            onClick={() => onSelect(agent.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(agent.id) } }}
          >
            <div className="la-top">
              <span className="la-mono" aria-hidden="true">{monogram(agent.agent_name || 'Agent')}</span>
              <div className="min-w-0 flex-1">
                <p className="la-name">{agent.agent_name || 'Unnamed agent'}</p>
                <p className="la-for">Scraping for <strong>{agentFor(agent)}</strong></p>
              </div>
              <span className={`la-state ${busy ? 'la-state--busy' : agent.enabled ? 'la-state--on' : ''}`}>
                {busy ? 'Working' : agent.enabled ? 'Daily' : 'Paused'}
              </span>
            </div>

            <dl className="la-stats">
              <div><dt>Leads</dt><dd className="tabular-nums">{mine.length}</dd></div>
              <div><dt>Today</dt><dd className="tabular-nums">{today}</dd></div>
              <div><dt>Drafts</dt><dd className={`tabular-nums ${waiting ? 'la-hot' : ''}`}>{waiting}</dd></div>
            </dl>

            <div className="la-foot">
              <span className="la-last">
                {agent.last_run_at ? `Last run ${relativeDate(agent.last_run_at)}` : 'Never run'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="la-icon"
                  aria-label={`${agent.agent_name} settings`}
                  onClick={e => { e.stopPropagation(); onSettings(agent) }}
                >
                  <Settings2 size={14} />
                </button>
                <button
                  type="button"
                  className="la-run"
                  disabled={busy}
                  onClick={e => { e.stopPropagation(); onRun(agent) }}
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} />}
                  {busy ? 'Running' : 'Find leads'}
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {manualCount > 0 && (
        <button
          type="button"
          role="tab"
          aria-selected={selected === 'manual'}
          className={`la-card la-card--slim ${selected === 'manual' ? 'la-card--on' : ''}`}
          onClick={() => onSelect('manual')}
        >
          <p className="la-name">Added by hand</p>
          <p className="la-for">Leads you entered yourself</p>
          <p className="la-big tabular-nums">{manualCount}</p>
        </button>
      )}

      <button type="button" className="la-card la-card--new" onClick={onNew}>
        <span className="la-plus" aria-hidden="true"><Plus size={18} /></span>
        <p className="la-name">New lead agent</p>
        <p className="la-for">Scrape leads for a client</p>
      </button>
    </div>
  )
}

/* ========================================
   SETTINGS / CREATE
   ======================================== */

interface SettingsProps {
  open: boolean
  agent: LeadAgent | null
  clients: Client[]
  leadCount: number
  onClose: () => void
  onSave: (input: { id?: string; agent_name: string; enabled: boolean; config: Record<string, any> }) => Promise<void>
  onDelete: (agent: LeadAgent) => Promise<void>
  onPauseToggle: (agent: LeadAgent, enabled: boolean) => Promise<void>
}

const lines = (s: string) => s.split(/\n|,/).map(x => x.trim()).filter(Boolean)

export function AgentSettingsModal({ open, agent, clients, leadCount, onClose, onSave, onDelete, onPauseToggle }: SettingsProps) {
  const gth = isGthAgent(agent)
  const [f, setF] = useState({
    agent_name: '', client_id: '', client_offer: '', ideal_customer_profile: '', sender_name: '',
    terms: '', areas: '', daily_lead_quota: '25', min_score: '60', enabled: true,
    booking_link: '', proof: '', auto_followups: true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: any) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    const c = agent?.config || {}
    setF({
      agent_name: agent?.agent_name || '',
      client_id: c.client_id || '',
      client_offer: c.client_offer || '',
      ideal_customer_profile: c.ideal_customer_profile || '',
      sender_name: c.sender_name || '',
      terms: (Array.isArray(c.search_terms) ? c.search_terms : []).join('\n'),
      areas: (Array.isArray(c.search_areas) && c.search_areas.length ? c.search_areas : ['Edmonton, AB']).join('\n'),
      daily_lead_quota: String(c.daily_lead_quota ?? 25),
      min_score: String(c.min_score ?? 60),
      enabled: agent ? agent.enabled : false,
      booking_link: c.booking_link || '',
      proof: (Array.isArray(c.proof_links) ? c.proof_links : []).map((p: any) => `${p.url} | ${String(p.match || '').split('|').join(', ')}`).join('\n'),
      auto_followups: c.auto_followups !== false,
    })
  }, [open, agent])

  const client = clients.find(c => c.id === f.client_id)

  const submit = async () => {
    if (!f.agent_name.trim()) { showToast('Give the agent a name', 'warn'); return }
    if (!gth && !f.client_id) { showToast('Pick the client this agent finds leads for', 'warn'); return }
    const terms = lines(f.terms)
    if (terms.length === 0) { showToast('Add at least one type of business to search for', 'warn'); return }
    const prev = agent?.config || {}
    const config: Record<string, any> = {
      ...prev,
      search_terms: terms,
      search_areas: lines(f.areas).length ? lines(f.areas) : ['Edmonton, AB'],
      daily_lead_quota: Math.max(1, Math.min(100, Number(f.daily_lead_quota) || 25)),
      min_score: Math.max(60, Math.min(100, Number(f.min_score) || 60)),
      timezone: prev.timezone || 'America/Edmonton',
      working_hours_start: prev.working_hours_start || '08:00',
      working_hours_end: prev.working_hours_end || '18:00',
      queries_per_run: prev.queries_per_run || 3,
      drafts_per_run: prev.drafts_per_run || 8,
      rotation_index: prev.rotation_index || 0,
      auto_followups: f.auto_followups,
      booking_link: f.booking_link.trim(),
      proof_links: f.proof.split('\n').map(line => {
        const [url, kw] = line.split('|').map(x => (x || '').trim())
        if (!url || !kw) return null
        const match = kw.split(',').map(k => k.trim().replace(/[.*+?^${}()[\]\\]/g, '')).filter(Boolean).join('|')
        return match ? { url: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), match } : null
      }).filter(Boolean),
    }
    if (!gth) {
      Object.assign(config, {
        profile: 'client',
        delivery: 'export',
        client_id: f.client_id,
        client_name: client?.name || prev.client_name || '',
        client_business: prev.client_business && prev.client_id === f.client_id
          ? prev.client_business
          : `${client?.name || ''}${client?.service ? `, ${client.service}` : ''}`,
        client_offer: f.client_offer.trim(),
        ideal_customer_profile: f.ideal_customer_profile.trim(),
        sender_name: f.sender_name.trim(),
        target_industries: terms.join(', '),
      })
    }
    setSaving(true)
    try {
      await onSave({ id: agent?.id, agent_name: f.agent_name.trim(), enabled: f.enabled, config })
      showToast(agent ? 'Agent saved' : `${f.agent_name.trim()} is ready. Hit Find leads to start.`, 'success')
      onClose()
    } catch (err: any) {
      showToast(err?.message || 'Could not save the agent', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={agent ? `${agent.agent_name} settings` : 'New lead agent'} width="620px">
      <div className="la-form">
        <div className="la-row">
          <label><span>Agent name</span>
            <input className="cw-input" value={f.agent_name} onChange={e => set('agent_name', e.target.value)} placeholder="e.g. Selina" autoFocus />
          </label>
          <label><span>Finds leads for</span>
            {gth ? (
              <input className="cw-input" value="Grow The Hype" disabled />
            ) : (
              <select className="cw-input" value={f.client_id} onChange={e => set('client_id', e.target.value)}>
                <option value="">Choose a client</option>
                {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </label>
        </div>

        {!gth && (
          <>
            <label><span>What the client offers these businesses</span>
              <textarea className="cw-input la-area" rows={3} value={f.client_offer} onChange={e => set('client_offer', e.target.value)}
                placeholder="The service the emails pitch, in plain words. The agent only uses what you write here." />
            </label>
            <div className="la-row">
              <label><span>Ideal customer</span>
                <input className="cw-input" value={f.ideal_customer_profile} onChange={e => set('ideal_customer_profile', e.target.value)} placeholder="e.g. Multi-location clinics, 10+ staff" />
              </label>
              <label><span>Emails signed by</span>
                <input className="cw-input" value={f.sender_name} onChange={e => set('sender_name', e.target.value)} placeholder="Name at the client" />
              </label>
            </div>
          </>
        )}

        <div className="la-row">
          <label><span>Businesses to search for</span>
            <textarea className="cw-input la-area" rows={5} value={f.terms} onChange={e => set('terms', e.target.value)} placeholder={'dental clinic\nlaw firm\ngeneral contractor'} />
            <em>One per line</em>
          </label>
          <label><span>Areas</span>
            <textarea className="cw-input la-area" rows={5} value={f.areas} onChange={e => set('areas', e.target.value)} placeholder={'Edmonton, AB\nSherwood Park, AB'} />
            <em>One per line</em>
          </label>
        </div>

        <div className="la-row la-row--3">
          <label><span>New leads per day</span>
            <input className="cw-input" type="number" min={1} max={100} value={f.daily_lead_quota} onChange={e => set('daily_lead_quota', e.target.value)} />
          </label>
          <label><span>Min. lead score</span>
            <input className="cw-input" type="number" min={60} max={100} value={f.min_score} onChange={e => set('min_score', e.target.value)} />
          </label>
          <label className="la-toggle">
            <span>Daily run</span>
            <button type="button" role="switch" aria-checked={f.enabled} className={`la-switch ${f.enabled ? 'la-switch--on' : ''}`} onClick={() => set('enabled', !f.enabled)}>
              <i />
            </button>
            <em>{f.enabled ? 'Runs each weekday morning' : 'Only when you click Find leads'}</em>
          </label>
        </div>

        <div className="la-row">
          <label><span>Booking link (optional)</span>
            <input className="cw-input" value={f.booking_link} onChange={e => set('booking_link', e.target.value)} placeholder="Your calendar link, offered once in first emails" />
          </label>
          <label className="la-toggle">
            <span>Follow-ups</span>
            <button type="button" role="switch" aria-checked={f.auto_followups} className={`la-switch ${f.auto_followups ? 'la-switch--on' : ''}`} onClick={() => set('auto_followups', !f.auto_followups)}>
              <i />
            </button>
            <em>{f.auto_followups ? 'Send on their own after you approve the first email' : 'Each follow-up waits for your approval'}</em>
          </label>
        </div>

        <label><span>Work to show</span>
          <textarea className="cw-input la-area" rows={3} value={f.proof} onChange={e => set('proof', e.target.value)}
            placeholder={'cecg.ca | contractor, renovation, plumbing\nlpaschool.ca | daycare, montessori'} />
          <em>One per line: a live site you built | the kinds of businesses it should be shown to. Only these links are ever used.</em>
        </label>

        <p className="la-note">
          {gth
            ? 'Drafts wait in this agent’s Drafts tab. Approving one sends it from your Gmail.'
            : 'Client agents never send from your Gmail. They build the lead list and write drafts you can copy or export for the client.'}
        </p>

        <div className="la-actions">
          {agent && !gth && (
            leadCount === 0 ? (
              <button className="btn-ghost la-danger" disabled={saving} onClick={async () => {
                try { await onDelete(agent); showToast('Agent deleted', 'info'); onClose() } catch (err: any) { showToast(err?.message || 'Could not delete', 'error') }
              }}>Delete agent</button>
            ) : (
              <button className="btn-ghost" disabled={saving} onClick={async () => { await onPauseToggle(agent, !agent.enabled); onClose() }}>
                <Pause size={12} /> {agent.enabled ? 'Pause agent' : 'Resume agent'}
              </button>
            )
          )}
          <span className="flex-1" />
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : agent ? 'Save agent' : 'Create agent'}</button>
        </div>
      </div>
    </Modal>
  )
}
