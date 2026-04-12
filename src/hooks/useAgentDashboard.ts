import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'

// ---- Types ----

export type AgentStatus = 'running' | 'idle' | 'error' | 'disabled'

export interface AgentConfig {
  id?: string
  user_id?: string
  agent_key: string
  agent_type?: 'core' | 'client'
  agent_name?: string
  enabled: boolean
  last_run_at: string | null
  last_run_duration_ms?: number | null
  status: AgentStatus
  config: Record<string, any>
  stats_summary: string | null
}

export interface AgentRun {
  id: string
  agent_key: string
  status: string
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  result_summary: string | null
  error_message: string | null
  leads_found: number
  emails_sent: number
  replies_received: number
}

export interface OutreachQueueItem {
  id: string
  step_type: string
  status: string
  subject: string | null
  body: string | null
  created_at: string
  sequence: {
    id: string
    lead: {
      id: string
      name: string
      company: string | null
      industry: string | null
      email: string | null
      website: string | null
      location: string | null
      score: number | null
      source: string | null
    }
  } | null
}

export interface AgentMetrics {
  leadsThisWeek: number
  emailsSentThisWeek: number
  repliesThisWeek: number
  meetingsBooked: number
  replyRate: number
}

export interface ActivityItem {
  id: string
  type: 'lead_scraped' | 'email_drafted' | 'email_sent' | 'reply_received' | 'lead_qualified' | 'error' | 'agent_run' | 'info'
  description: string
  timestamp: string
  status: 'success' | 'info' | 'warning' | 'error'
  agent_key?: string
}

// ---- Defaults ----

export const DEFAULT_LEAD_GEN_CONFIG: Record<string, any> = {
  target_industries: 'daycares, property management, dental clinics',
  target_location: 'Edmonton, AB',
  daily_lead_quota: 25,
  daily_email_limit: 15,
  working_hours_start: '09:00',
  working_hours_end: '18:00',
  outreach_tone: 'Professional',
  auto_send: false,
}

export const DEFAULT_SALES_CONFIG: Record<string, any> = {
  target_audience: 'agencies, freelancers, startups',
  product_focus: 'CRM Product',
  daily_email_limit: 15,
  working_hours_start: '09:00',
  working_hours_end: '18:00',
  outreach_tone: 'Professional',
  auto_send: false,
}

// ---- Hook ----

export function useAgentDashboard() {
  const [configs, setConfigs] = useState<AgentConfig[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [queue, setQueue] = useState<OutreachQueueItem[]>([])
  const [metrics, setMetrics] = useState<AgentMetrics>({
    leadsThisWeek: 0,
    emailsSentThisWeek: 0,
    repliesThisWeek: 0,
    meetingsBooked: 0,
    replyRate: 0,
  })
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const getUserId = useCallback(async (): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id ?? null
    } catch {
      return null
    }
  }, [])

  // ---- Fetch all data ----
  const fetchAll = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    const userId = await getUserId()
    if (!userId) {
      setLoading(false)
      return
    }

    try {
      // Fetch configs
      const { data: configData } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('user_id', userId)

      if (configData && configData.length > 0) {
        const mapped: AgentConfig[] = configData.map((d: any) => {
          const isClient = d.agent_type === 'client'
          // Derive agent_key from DB fields (agent_key column doesn't exist in DB)
          const agentKey = isClient
            ? (d.agent_name || 'client').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_')
            : d.agent_type === 'lead_gen' ? 'lead_generator' : 'sales_agent'
          const isLeadGen = agentKey === 'lead_generator'
          return {
            id: d.id,
            user_id: d.user_id,
            agent_key: agentKey,
            agent_type: isClient ? 'client' : 'core',
            agent_name: d.agent_name || undefined,
            enabled: d.enabled ?? false,
            last_run_at: d.last_run_at,
            last_run_duration_ms: d.last_run_duration_ms,
            status: d.enabled ? ('idle' as AgentStatus) : ('disabled' as AgentStatus),
            config: {
              ...(!isClient ? (isLeadGen ? DEFAULT_LEAD_GEN_CONFIG : DEFAULT_SALES_CONFIG) : {}),
              ...(d.config || {}),
            },
            stats_summary: d.stats_summary,
          }
        })
        // Ensure core agents always exist in local state
        const hasLeadGen = mapped.some(c => c.agent_key === 'lead_generator')
        const hasSales = mapped.some(c => c.agent_key === 'sales_agent')
        if (!hasLeadGen) {
          mapped.unshift({
            agent_key: 'lead_generator',
            agent_type: 'core',
            enabled: false,
            last_run_at: null,
            status: 'disabled',
            config: { ...DEFAULT_LEAD_GEN_CONFIG },
            stats_summary: null,
          })
        }
        if (!hasSales) {
          mapped.splice(hasLeadGen ? 1 : 0, 0, {
            agent_key: 'sales_agent',
            agent_type: 'core',
            enabled: false,
            last_run_at: null,
            status: 'disabled',
            config: { ...DEFAULT_SALES_CONFIG },
            stats_summary: null,
          })
        }
        setConfigs(mapped)
      } else {
        // Set defaults if no configs exist
        setConfigs([
          {
            agent_key: 'lead_generator',
            agent_type: 'core',
            enabled: false,
            last_run_at: null,
            status: 'disabled',
            config: { ...DEFAULT_LEAD_GEN_CONFIG },
            stats_summary: null,
          },
          {
            agent_key: 'sales_agent',
            agent_type: 'core',
            enabled: false,
            last_run_at: null,
            status: 'disabled',
            config: { ...DEFAULT_SALES_CONFIG },
            stats_summary: null,
          },
        ])
      }

      // Fetch recent runs
      const { data: runsData } = await supabase
        .from('agent_runs')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(20)

      if (runsData) setRuns(runsData as AgentRun[])

      // Fetch outreach queue
      const { data: queueData } = await supabase
        .from('outreach_steps')
        .select('*, sequence:outreach_sequences(*, lead:outreach_leads(*))')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (queueData) setQueue(queueData as OutreachQueueItem[])

      // Fetch metrics
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [leadsRes, emailsRes, repliesRes, meetingsRes] = await Promise.all([
        supabase.from('outreach_leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekAgo),
        supabase.from('outreach_steps').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('step_type', 'email').eq('status', 'sent').gte('created_at', weekAgo),
        supabase.from('outreach_steps').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'replied').gte('created_at', weekAgo),
        supabase.from('outreach_steps').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('step_type', 'meeting').eq('status', 'booked').gte('created_at', weekAgo),
      ])

      const leads = leadsRes.count ?? 0
      const emails = emailsRes.count ?? 0
      const replies = repliesRes.count ?? 0
      const meetings = meetingsRes.count ?? 0

      setMetrics({
        leadsThisWeek: leads,
        emailsSentThisWeek: emails,
        repliesThisWeek: replies,
        meetingsBooked: meetings,
        replyRate: emails > 0 ? Math.round((replies / emails) * 100) : 0,
      })

      // Build activity feed from runs + queue actions
      const activityItems: ActivityItem[] = []

      if (runsData) {
        for (const run of runsData) {
          activityItems.push({
            id: `run-${run.id}`,
            type: run.status === 'error' ? 'error' : 'agent_run',
            description: run.result_summary || `${run.agent_key === 'lead_generator' ? 'Sarah' : 'Selina'} run ${run.status}`,
            timestamp: run.started_at,
            status: run.status === 'error' ? 'error' : run.status === 'completed' ? 'success' : 'info',
            agent_key: run.agent_key,
          })
        }
      }

      // Sort by timestamp descending
      activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setActivity(activityItems.slice(0, 30))
    } catch (err) {
      /* silently handled */
    } finally {
      setLoading(false)
    }
  }, [getUserId])

  // ---- Initial load + auto-refresh ----
  useEffect(() => {
    fetchAll(true)

    intervalRef.current = setInterval(() => {
      fetchAll(false)
    }, 30000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchAll])

  // ---- Toggle Agent ----
  const toggleAgent = useCallback(async (agentKey: string, enabled: boolean) => {
    const userId = await getUserId()
    if (!userId) return

    // Optimistic update
    setConfigs(prev =>
      prev.map(c =>
        c.agent_key === agentKey
          ? { ...c, enabled, status: enabled ? ('idle' as AgentStatus) : ('disabled' as AgentStatus) }
          : c
      )
    )

    try {
      const existing = configs.find(c => c.agent_key === agentKey)
      if (existing?.id) {
        await supabase
          .from('agent_configs')
          .update({ enabled, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        const isClient = existing?.agent_type === 'client'
        const defaults = isClient ? {} : (agentKey === 'lead_generator' ? DEFAULT_LEAD_GEN_CONFIG : DEFAULT_SALES_CONFIG)
        const agentType = isClient ? 'client' : (agentKey === 'lead_generator' ? 'lead_gen' : 'sales')
        const { data } = await supabase
          .from('agent_configs')
          .insert({
            user_id: userId,
            agent_type: agentType,
            agent_name: existing?.agent_name || undefined,
            enabled,
            config: defaults,
          })
          .select()
          .single()

        if (data) {
          setConfigs(prev =>
            prev.map(c => (c.agent_key === agentKey ? { ...c, id: data.id, user_id: data.user_id } : c))
          )
        }
      }

      const label = existing?.agent_name || (agentKey === 'lead_generator' ? 'Sarah' : 'Selina')
      showToast(`${label} ${enabled ? 'enabled' : 'disabled'}`, 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to update agent', 'error')
      // Revert
      setConfigs(prev =>
        prev.map(c =>
          c.agent_key === agentKey
            ? { ...c, enabled: !enabled, status: !enabled ? ('idle' as AgentStatus) : ('disabled' as AgentStatus) }
            : c
        )
      )
    }
  }, [configs, getUserId])

  // ---- Run Agent ----
  const runAgent = useCallback(async (agentKey: string) => {
    const userId = await getUserId()
    if (!userId) {
      showToast('Not signed in', 'error')
      return
    }

    const agentCfg = configs.find(c => c.agent_key === agentKey)
    if (!agentCfg) {
      showToast('Agent not found', 'error')
      return
    }

    // Map UI agent_key → DB agent_type
    const dbAgentType = agentCfg.agent_type === 'client'
      ? 'client'
      : agentKey === 'lead_generator' ? 'lead_gen' : 'sales'

    setRunningAgents(prev => new Set(prev).add(agentKey))
    setConfigs(prev =>
      prev.map(c => (c.agent_key === agentKey ? { ...c, status: 'running' as AgentStatus } : c))
    )

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType: dbAgentType,
          userId,
          configId: agentCfg.id || null,
        }),
      })

      if (!res.ok) {
        // Read the raw body so we surface the REAL error, no matter what
        // shape it comes back in.
        const raw = await res.text()
        let msg = `Run failed (${res.status})`
        try {
          const parsed = JSON.parse(raw)
          msg = parsed.error || parsed.message || parsed.details || raw || msg
        } catch {
          if (raw) msg = `${msg}: ${raw.slice(0, 400)}`
        }
        throw new Error(msg)
      }

      const result = await res.json()
      setConfigs(prev =>
        prev.map(c =>
          c.agent_key === agentKey
            ? { ...c, status: 'idle' as AgentStatus, last_run_at: new Date().toISOString() }
            : c
        )
      )

      const label = agentCfg.agent_name || (agentKey === 'lead_generator' ? 'Sarah' : 'Selina')
      if (result.status === 'skipped') {
        showToast(`${label}: ${result.reason || 'skipped'}`, 'info')
      } else {
        // Inspect per-action results — many failures get swallowed by the
        // server-side try/catch and stuffed into results[action] = { error }.
        const results = result.results || {}
        const actionErrors: string[] = []
        const actionSummary: string[] = []

        for (const [action, payload] of Object.entries<any>(results)) {
          if (payload && typeof payload === 'object') {
            if (payload.error) {
              actionErrors.push(`${action}: ${payload.error}`)
            } else if (action === 'scrape_leads') {
              const found = payload.leadsFound ?? 0
              const fresh = payload.leadsNew ?? 0
              actionSummary.push(`scraped ${found} (${fresh} new)`)
            } else if (action === 'qualify_leads') {
              const n = payload.qualified ?? payload.scored ?? payload.processed ?? 0
              const attempted = payload.attempted ?? 0
              actionSummary.push(`qualified ${n}/${attempted}`)
              // Surface the first per-lead error so silent failures aren't silent
              if (payload.firstError && n === 0 && attempted > 0) {
                actionErrors.push(`qualify_leads silent fail: ${payload.firstError}`)
              }
            } else if (action === 'generate_emails') {
              const n = payload.generated ?? payload.drafts ?? payload.processed ?? 0
              actionSummary.push(`drafted ${n}`)
            } else if (action === 'send_emails') {
              const n = payload.sent ?? payload.delivered ?? payload.processed ?? 0
              actionSummary.push(`sent ${n}`)
            } else if (action === 'classify_inbox') {
              const n = payload.classified ?? payload.processed ?? 0
              actionSummary.push(`inbox ${n}`)
            }
          }
        }

        if (actionErrors.length > 0) {
          // Show successes AND errors so the user sees the full picture
          const parts: string[] = []
          if (actionSummary.length > 0) parts.push(actionSummary.join(', '))
          parts.push(...actionErrors)
          showToast(`${label}: ${parts.join(' | ')}`, 'error')
        } else if (actionSummary.length > 0) {
          showToast(`${label}: ${actionSummary.join(', ')}`, 'success')
        } else {
          showToast(`${label} run complete`, 'success')
        }
      }

      // Refresh data after run
      setTimeout(() => fetchAll(false), 800)
    } catch (err: any) {
      setConfigs(prev =>
        prev.map(c => (c.agent_key === agentKey ? { ...c, status: 'error' as AgentStatus } : c))
      )
      showToast(err?.message || 'Agent run failed', 'error')
    } finally {
      setRunningAgents(prev => {
        const next = new Set(prev)
        next.delete(agentKey)
        return next
      })
    }
  }, [configs, fetchAll, getUserId])

  // ---- Save Config ----
  const saveConfig = useCallback(async (agentKey: string, config: Record<string, any>) => {
    const userId = await getUserId()
    if (!userId) return

    const existing = configs.find(c => c.agent_key === agentKey)

    try {
      if (existing?.id) {
        await supabase
          .from('agent_configs')
          .update({ config, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        const existingCfg = configs.find(c => c.agent_key === agentKey)
        const isClient = existingCfg?.agent_type === 'client'
        const agentType = isClient ? 'client' : (agentKey === 'lead_generator' ? 'lead_gen' : 'sales')
        const { data } = await supabase
          .from('agent_configs')
          .insert({
            user_id: userId,
            agent_type: agentType,
            agent_name: existingCfg?.agent_name || undefined,
            enabled: false,
            config,
          })
          .select()
          .single()

        if (data) {
          setConfigs(prev =>
            prev.map(c => (c.agent_key === agentKey ? { ...c, id: data.id, user_id: data.user_id, config } : c))
          )
        }
      }

      // Update local state
      setConfigs(prev =>
        prev.map(c => (c.agent_key === agentKey ? { ...c, config } : c))
      )

      showToast('Configuration saved', 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to save configuration', 'error')
    }
  }, [configs, getUserId])

  // ---- Queue Actions ----
  const approveStep = useCallback(async (stepId: string) => {
    try {
      await supabase
        .from('outreach_steps')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', stepId)
      setQueue(prev => prev.filter(q => q.id !== stepId))
      showToast('Email approved for sending', 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to approve', 'error')
    }
  }, [])

  const skipStep = useCallback(async (stepId: string) => {
    try {
      await supabase
        .from('outreach_steps')
        .update({ status: 'skipped', updated_at: new Date().toISOString() })
        .eq('id', stepId)
      setQueue(prev => prev.filter(q => q.id !== stepId))
      showToast('Email skipped', 'info')
    } catch (err: any) {
      showToast(err?.message || 'Failed to skip', 'error')
    }
  }, [])

  const updateStepContent = useCallback(async (stepId: string, subject: string, body: string) => {
    try {
      await supabase
        .from('outreach_steps')
        .update({ subject, body, updated_at: new Date().toISOString() })
        .eq('id', stepId)
      setQueue(prev =>
        prev.map(q => (q.id === stepId ? { ...q, subject, body } : q))
      )
      showToast('Email updated', 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to update', 'error')
    }
  }, [])

  // Helper to get a specific config
  const getConfig = useCallback(
    (agentKey: string): AgentConfig => {
      return (
        configs.find(c => c.agent_key === agentKey) ?? {
          agent_key: agentKey,
          enabled: false,
          last_run_at: null,
          status: 'disabled' as AgentStatus,
          config: agentKey === 'lead_generator' ? { ...DEFAULT_LEAD_GEN_CONFIG } : { ...DEFAULT_SALES_CONFIG },
          stats_summary: null,
        }
      )
    },
    [configs]
  )

  // ---- Client Agents ----
  const clientAgents = configs.filter(c => c.agent_type === 'client')

  const createClientAgent = useCallback(async (name: string, config: Record<string, any>) => {
    const userId = await getUserId()
    if (!userId) return

    const agentKey = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')

    try {
      const { data, error } = await supabase
        .from('agent_configs')
        .insert({
          user_id: userId,
          agent_type: 'client',
          agent_name: name,
          enabled: false,
          config,
        })
        .select()
        .single()

      if (error) throw error

      if (data) {
        const newAgent: AgentConfig = {
          id: data.id,
          user_id: data.user_id,
          agent_key: agentKey,
          agent_type: 'client',
          agent_name: data.agent_name,
          enabled: false,
          last_run_at: null,
          status: 'disabled',
          config,
          stats_summary: null,
        }
        setConfigs(prev => [...prev, newAgent])
        showToast(`${name} agent created`, 'success')
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to create agent', 'error')
    }
  }, [getUserId])

  const deleteClientAgent = useCallback(async (agentKey: string) => {
    const existing = configs.find(c => c.agent_key === agentKey && c.agent_type === 'client')
    if (!existing?.id) {
      // Remove from local state only
      setConfigs(prev => prev.filter(c => c.agent_key !== agentKey))
      return
    }

    try {
      const { error } = await supabase
        .from('agent_configs')
        .delete()
        .eq('id', existing.id)

      if (error) throw error

      setConfigs(prev => prev.filter(c => c.agent_key !== agentKey))
      showToast(`${existing.agent_name || agentKey} removed`, 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete agent', 'error')
    }
  }, [configs])

  return {
    configs,
    runs,
    queue,
    metrics,
    activity,
    loading,
    runningAgents,
    clientAgents,
    toggleAgent,
    runAgent,
    saveConfig,
    createClientAgent,
    deleteClientAgent,
    approveStep,
    skipStep,
    updateStepContent,
    getConfig,
    refresh: () => fetchAll(false),
  }
}
