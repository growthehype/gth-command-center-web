import { useState, useEffect, useCallback } from 'react'
import {
  Bot, Zap, Search, Mail, MessageSquare, Clock, Play, ChevronDown, ChevronRight,
  Save, BarChart3, Send, CalendarCheck, Users, AlertCircle, Check, X, Edit3,
  Activity, Power,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'
import EmptyState from '@/components/ui/EmptyState'

// ---- Types ----

type AgentStatus = 'running' | 'idle' | 'error' | 'disabled'

interface AgentConfig {
  id?: string
  agent_key: string
  enabled: boolean
  last_run_at: string | null
  status: AgentStatus
  config: Record<string, any>
  stats_summary: string | null
}

interface OutreachQueueItem {
  id: string
  lead_name: string
  industry: string
  email_subject: string
  score: number
  status: 'pending' | 'approved' | 'skipped'
}

interface ActivityEntry {
  id: string
  timestamp: string
  icon: string
  description: string
  status: 'success' | 'info' | 'warning' | 'error'
}

// ---- Defaults ----

const DEFAULT_LEAD_GEN_CONFIG: Record<string, any> = {
  target_industries: 'daycares, property management, dental clinics',
  target_location: 'Edmonton, AB',
  daily_lead_quota: 25,
  daily_email_limit: 15,
  working_hours_start: '09:00',
  working_hours_end: '18:00',
  outreach_tone: 'Professional',
  auto_send: false,
}

const DEFAULT_SALES_CONFIG: Record<string, any> = {
  target_audience: 'agencies, freelancers, startups',
  product_focus: 'CRM Product',
  daily_email_limit: 15,
  working_hours_start: '09:00',
  working_hours_end: '18:00',
  outreach_tone: 'Professional',
  auto_send: false,
}

// ---- Helpers ----

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function statusBadge(status: AgentStatus) {
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-green-400 bg-green-500/10 border border-green-500/20" style={{ fontSize: '11px', fontWeight: 600 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Running
        </span>
      )
    case 'idle':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-dim bg-surface-2 border border-border" style={{ fontSize: '11px', fontWeight: 600 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Idle
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-red-400 bg-red-500/10 border border-red-500/20" style={{ fontSize: '11px', fontWeight: 600 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Error
        </span>
      )
    case 'disabled':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-dim/50 bg-surface border border-border/50" style={{ fontSize: '11px', fontWeight: 600 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
          Disabled
        </span>
      )
  }
}

// ---- Toggle Switch Component ----

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
        checked ? 'bg-green-500' : 'bg-gray-600'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

// ---- Slider Component ----

function Slider({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="label">{label}</p>
        <span className="mono text-polar" style={{ fontSize: '13px', fontWeight: 700 }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-surface-2 rounded-full appearance-none cursor-pointer accent-polar"
        style={{ accentColor: 'var(--color-polar, #D8DEE9)' }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-dim" style={{ fontSize: '10px' }}>{min}</span>
        <span className="text-dim" style={{ fontSize: '10px' }}>{max}</span>
      </div>
    </div>
  )
}

// ============================================
// AGENTS PAGE
// ============================================

export default function Agents() {
  // Agent configs state
  const [leadGenConfig, setLeadGenConfig] = useState<AgentConfig>({
    agent_key: 'lead_generator',
    enabled: false,
    last_run_at: null,
    status: 'disabled',
    config: { ...DEFAULT_LEAD_GEN_CONFIG },
    stats_summary: null,
  })

  const [salesConfig, setSalesConfig] = useState<AgentConfig>({
    agent_key: 'sales_agent',
    enabled: false,
    last_run_at: null,
    status: 'disabled',
    config: { ...DEFAULT_SALES_CONFIG },
    stats_summary: null,
  })

  // UI state
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [runningAgent, setRunningAgent] = useState<string | null>(null)

  // Activity feed & outreach queue (Phase 1 placeholders)
  const [activityFeed] = useState<ActivityEntry[]>([])
  const [outreachQueue] = useState<OutreachQueueItem[]>([])

  // ---- Load configs from Supabase ----
  const loadConfigs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('agent_configs')
        .select('*')

      if (error) {
        // Table might not exist yet in Phase 1 - silently use defaults
        console.warn('agent_configs not available:', error.message)
        return
      }

      if (data) {
        const leadGen = data.find((d: any) => d.agent_key === 'lead_generator')
        if (leadGen) {
          setLeadGenConfig({
            id: leadGen.id,
            agent_key: 'lead_generator',
            enabled: leadGen.enabled ?? false,
            last_run_at: leadGen.last_run_at,
            status: leadGen.enabled ? (leadGen.status || 'idle') : 'disabled',
            config: { ...DEFAULT_LEAD_GEN_CONFIG, ...(leadGen.config || {}) },
            stats_summary: leadGen.stats_summary,
          })
        }

        const sales = data.find((d: any) => d.agent_key === 'sales_agent')
        if (sales) {
          setSalesConfig({
            id: sales.id,
            agent_key: 'sales_agent',
            enabled: sales.enabled ?? false,
            last_run_at: sales.last_run_at,
            status: sales.enabled ? (sales.status || 'idle') : 'disabled',
            config: { ...DEFAULT_SALES_CONFIG, ...(sales.config || {}) },
            stats_summary: sales.stats_summary,
          })
        }
      }
    } catch (err) {
      console.warn('Failed to load agent configs:', err)
    }
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  // ---- Toggle Agent ----
  const toggleAgent = async (agentKey: string, enabled: boolean) => {
    const setter = agentKey === 'lead_generator' ? setLeadGenConfig : setSalesConfig
    const current = agentKey === 'lead_generator' ? leadGenConfig : salesConfig

    setter(prev => ({
      ...prev,
      enabled,
      status: enabled ? 'idle' : 'disabled',
    }))

    try {
      if (current.id) {
        await supabase
          .from('agent_configs')
          .update({ enabled, status: enabled ? 'idle' : 'disabled', updated_at: new Date().toISOString() })
          .eq('id', current.id)
      } else {
        const { data } = await supabase
          .from('agent_configs')
          .insert({
            agent_key: agentKey,
            enabled,
            status: enabled ? 'idle' : 'disabled',
            config: current.config,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single()
        if (data) setter(prev => ({ ...prev, id: data.id }))
      }
      showToast(`${agentKey === 'lead_generator' ? 'Lead Generator' : 'Sales Agent'} ${enabled ? 'enabled' : 'disabled'}`, 'success')
    } catch (err: any) {
      console.error('Failed to toggle agent:', err)
      showToast(err?.message || 'Failed to update agent', 'error')
      // Revert
      setter(prev => ({ ...prev, enabled: !enabled, status: !enabled ? 'idle' : 'disabled' }))
    }
  }

  // ---- Save Config ----
  const saveConfig = async (agentKey: string) => {
    setSaving(agentKey)
    const current = agentKey === 'lead_generator' ? leadGenConfig : salesConfig

    try {
      if (current.id) {
        await supabase
          .from('agent_configs')
          .update({ config: current.config, updated_at: new Date().toISOString() })
          .eq('id', current.id)
      } else {
        const { data } = await supabase
          .from('agent_configs')
          .insert({
            agent_key: agentKey,
            enabled: current.enabled,
            status: current.status,
            config: current.config,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single()
        const setter = agentKey === 'lead_generator' ? setLeadGenConfig : setSalesConfig
        if (data) setter(prev => ({ ...prev, id: data.id }))
      }
      showToast('Configuration saved', 'success')
    } catch (err: any) {
      console.error('Failed to save config:', err)
      showToast(err?.message || 'Failed to save configuration', 'error')
    } finally {
      setSaving(null)
    }
  }

  // ---- Run Now ----
  const runAgent = async (agentKey: string) => {
    setRunningAgent(agentKey)
    const setter = agentKey === 'lead_generator' ? setLeadGenConfig : setSalesConfig

    setter(prev => ({ ...prev, status: 'running' as AgentStatus }))

    try {
      // In Phase 2, this will call the actual agent endpoint
      // For now, simulate a brief run
      await new Promise(resolve => setTimeout(resolve, 1500))

      setter(prev => ({
        ...prev,
        status: 'idle' as AgentStatus,
        last_run_at: new Date().toISOString(),
      }))

      showToast(`${agentKey === 'lead_generator' ? 'Lead Generator' : 'Sales Agent'} run complete`, 'success')
    } catch (err: any) {
      setter(prev => ({ ...prev, status: 'error' as AgentStatus }))
      showToast(err?.message || 'Agent run failed', 'error')
    } finally {
      setRunningAgent(null)
    }
  }

  // ---- Config updaters ----
  const updateLeadGenField = (key: string, value: any) => {
    setLeadGenConfig(prev => ({ ...prev, config: { ...prev.config, [key]: value } }))
  }
  const updateSalesField = (key: string, value: any) => {
    setSalesConfig(prev => ({ ...prev, config: { ...prev.config, [key]: value } }))
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1>AI Agents</h1>
            <Bot size={14} className="text-dim" />
          </div>
          <p className="text-dim mt-1" style={{ fontSize: '13px' }}>Automated lead generation and outreach</p>
        </div>
      </div>

      {/* ============================================ */}
      {/* A. AGENT STATUS CARDS */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* Lead Generator Card */}
        <div className="card p-5" style={{ opacity: leadGenConfig.enabled ? 1 : 0.7 }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Search size={16} className="text-blue-400" />
              </div>
              <div>
                <p className="text-polar font-semibold" style={{ fontSize: '14px' }}>Lead Generator</p>
                <p className="text-dim" style={{ fontSize: '11px' }}>Finds and qualifies new business leads</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {statusBadge(leadGenConfig.status)}
              <Toggle
                checked={leadGenConfig.enabled}
                onChange={(v) => toggleAgent('lead_generator', v)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Clock size={11} className="text-dim" />
            <span className="text-dim mono" style={{ fontSize: '11px' }}>
              Last run: {relativeTime(leadGenConfig.last_run_at)}
            </span>
          </div>

          <div className="flex items-center gap-3 px-3 py-2 bg-surface border border-border mb-4" style={{ fontSize: '12px' }}>
            <span className="text-steel">{leadGenConfig.stats_summary || '0 leads scraped \u00B7 0 emails sent \u00B7 0 replies'}</span>
          </div>

          <button
            onClick={() => runAgent('lead_generator')}
            disabled={!leadGenConfig.enabled || runningAgent === 'lead_generator'}
            className="btn-primary flex items-center gap-2"
            style={{
              opacity: (!leadGenConfig.enabled || runningAgent === 'lead_generator') ? 0.4 : 1,
              fontSize: '12px',
            }}
          >
            <Play size={12} />
            {runningAgent === 'lead_generator' ? 'Running...' : 'Run Now'}
          </button>
        </div>

        {/* Sales Agent Card */}
        <div className="card p-5" style={{ opacity: salesConfig.enabled ? 1 : 0.7 }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Send size={16} className="text-purple-400" />
              </div>
              <div>
                <p className="text-polar font-semibold" style={{ fontSize: '14px' }}>Sales Agent</p>
                <p className="text-dim" style={{ fontSize: '11px' }}>Manages outreach sequences and follow-ups</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {statusBadge(salesConfig.status)}
              <Toggle
                checked={salesConfig.enabled}
                onChange={(v) => toggleAgent('sales_agent', v)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Clock size={11} className="text-dim" />
            <span className="text-dim mono" style={{ fontSize: '11px' }}>
              Last run: {relativeTime(salesConfig.last_run_at)}
            </span>
          </div>

          <div className="flex items-center gap-3 px-3 py-2 bg-surface border border-border mb-4" style={{ fontSize: '12px' }}>
            <span className="text-steel">{salesConfig.stats_summary || '0 emails sent \u00B7 0 follow-ups \u00B7 0 replies'}</span>
          </div>

          <button
            onClick={() => runAgent('sales_agent')}
            disabled={!salesConfig.enabled || runningAgent === 'sales_agent'}
            className="btn-primary flex items-center gap-2"
            style={{
              opacity: (!salesConfig.enabled || runningAgent === 'sales_agent') ? 0.4 : 1,
              fontSize: '12px',
            }}
          >
            <Play size={12} />
            {runningAgent === 'sales_agent' ? 'Running...' : 'Run Now'}
          </button>
        </div>
      </div>

      {/* ============================================ */}
      {/* B. CONFIGURATION PANELS */}
      {/* ============================================ */}
      <div className="mb-6">
        {/* Lead Generator Config */}
        <div className="card mb-3 overflow-hidden">
          <button
            onClick={() => setExpandedAgent(expandedAgent === 'lead_generator' ? null : 'lead_generator')}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedAgent === 'lead_generator' ? <ChevronDown size={14} className="text-dim" /> : <ChevronRight size={14} className="text-dim" />}
              <Search size={13} className="text-blue-400" />
              <span className="text-polar font-semibold" style={{ fontSize: '13px' }}>Lead Generator Configuration</span>
            </div>
            <span className="text-dim" style={{ fontSize: '11px' }}>
              {leadGenConfig.config.target_location} &middot; {leadGenConfig.config.daily_lead_quota} leads/day
            </span>
          </button>

          {expandedAgent === 'lead_generator' && (
            <div className="border-t border-border px-5 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Target Industries */}
                <div>
                  <p className="label mb-1.5">Target Industries</p>
                  <input
                    className="input w-full"
                    value={leadGenConfig.config.target_industries}
                    onChange={e => updateLeadGenField('target_industries', e.target.value)}
                    placeholder="daycares, property management, dental clinics"
                  />
                  <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Comma-separated list</p>
                </div>

                {/* Target Location */}
                <div>
                  <p className="label mb-1.5">Target Location</p>
                  <input
                    className="input w-full"
                    value={leadGenConfig.config.target_location}
                    onChange={e => updateLeadGenField('target_location', e.target.value)}
                    placeholder="Edmonton, AB"
                  />
                </div>

                {/* Daily Lead Quota */}
                <div>
                  <Slider
                    label="Daily Lead Quota"
                    value={leadGenConfig.config.daily_lead_quota}
                    min={5}
                    max={100}
                    onChange={v => updateLeadGenField('daily_lead_quota', v)}
                  />
                </div>

                {/* Daily Email Limit */}
                <div>
                  <Slider
                    label="Daily Email Limit"
                    value={leadGenConfig.config.daily_email_limit}
                    min={5}
                    max={50}
                    onChange={v => updateLeadGenField('daily_email_limit', v)}
                  />
                </div>

                {/* Working Hours */}
                <div>
                  <p className="label mb-1.5">Working Hours</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      className="input flex-1"
                      value={leadGenConfig.config.working_hours_start}
                      onChange={e => updateLeadGenField('working_hours_start', e.target.value)}
                    />
                    <span className="text-dim" style={{ fontSize: '12px' }}>to</span>
                    <input
                      type="time"
                      className="input flex-1"
                      value={leadGenConfig.config.working_hours_end}
                      onChange={e => updateLeadGenField('working_hours_end', e.target.value)}
                    />
                  </div>
                </div>

                {/* Outreach Tone */}
                <div>
                  <p className="label mb-1.5">Outreach Tone</p>
                  <select
                    className="input w-full"
                    value={leadGenConfig.config.outreach_tone}
                    onChange={e => updateLeadGenField('outreach_tone', e.target.value)}
                  >
                    <option value="Professional">Professional</option>
                    <option value="Casual">Casual</option>
                    <option value="Direct">Direct</option>
                  </select>
                </div>

                {/* Auto-Send Toggle */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between px-3 py-3 bg-surface border border-border">
                    <div>
                      <p className="text-polar font-semibold" style={{ fontSize: '13px' }}>Auto-Send Emails</p>
                      <p className="text-dim" style={{ fontSize: '11px' }}>
                        {leadGenConfig.config.auto_send
                          ? 'Emails are sent automatically without review'
                          : 'Emails are queued for your review before sending'}
                      </p>
                    </div>
                    <Toggle
                      checked={leadGenConfig.config.auto_send}
                      onChange={v => updateLeadGenField('auto_send', v)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-5">
                <button
                  onClick={() => saveConfig('lead_generator')}
                  disabled={saving === 'lead_generator'}
                  className="btn-primary flex items-center gap-2"
                  style={{ fontSize: '12px', opacity: saving === 'lead_generator' ? 0.5 : 1 }}
                >
                  <Save size={12} />
                  {saving === 'lead_generator' ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sales Agent Config */}
        <div className="card overflow-hidden">
          <button
            onClick={() => setExpandedAgent(expandedAgent === 'sales_agent' ? null : 'sales_agent')}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedAgent === 'sales_agent' ? <ChevronDown size={14} className="text-dim" /> : <ChevronRight size={14} className="text-dim" />}
              <Send size={13} className="text-purple-400" />
              <span className="text-polar font-semibold" style={{ fontSize: '13px' }}>Sales Agent Configuration</span>
            </div>
            <span className="text-dim" style={{ fontSize: '11px' }}>
              {salesConfig.config.product_focus} &middot; {salesConfig.config.daily_email_limit} emails/day
            </span>
          </button>

          {expandedAgent === 'sales_agent' && (
            <div className="border-t border-border px-5 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Target Audience */}
                <div>
                  <p className="label mb-1.5">Target Audience</p>
                  <input
                    className="input w-full"
                    value={salesConfig.config.target_audience}
                    onChange={e => updateSalesField('target_audience', e.target.value)}
                    placeholder="agencies, freelancers, startups"
                  />
                  <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Comma-separated list</p>
                </div>

                {/* Product Focus */}
                <div>
                  <p className="label mb-1.5">Product Focus</p>
                  <select
                    className="input w-full"
                    value={salesConfig.config.product_focus}
                    onChange={e => updateSalesField('product_focus', e.target.value)}
                  >
                    <option value="CRM Product">CRM Product</option>
                    <option value="Digital Services">Digital Services</option>
                    <option value="Both">Both</option>
                  </select>
                </div>

                {/* Daily Email Limit */}
                <div>
                  <Slider
                    label="Daily Email Limit"
                    value={salesConfig.config.daily_email_limit}
                    min={5}
                    max={50}
                    onChange={v => updateSalesField('daily_email_limit', v)}
                  />
                </div>

                {/* Working Hours */}
                <div>
                  <p className="label mb-1.5">Working Hours</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      className="input flex-1"
                      value={salesConfig.config.working_hours_start}
                      onChange={e => updateSalesField('working_hours_start', e.target.value)}
                    />
                    <span className="text-dim" style={{ fontSize: '12px' }}>to</span>
                    <input
                      type="time"
                      className="input flex-1"
                      value={salesConfig.config.working_hours_end}
                      onChange={e => updateSalesField('working_hours_end', e.target.value)}
                    />
                  </div>
                </div>

                {/* Outreach Tone */}
                <div>
                  <p className="label mb-1.5">Outreach Tone</p>
                  <select
                    className="input w-full"
                    value={salesConfig.config.outreach_tone}
                    onChange={e => updateSalesField('outreach_tone', e.target.value)}
                  >
                    <option value="Professional">Professional</option>
                    <option value="Casual">Casual</option>
                    <option value="Direct">Direct</option>
                  </select>
                </div>

                {/* Auto-Send Toggle */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between px-3 py-3 bg-surface border border-border">
                    <div>
                      <p className="text-polar font-semibold" style={{ fontSize: '13px' }}>Auto-Send Emails</p>
                      <p className="text-dim" style={{ fontSize: '11px' }}>
                        {salesConfig.config.auto_send
                          ? 'Emails are sent automatically without review'
                          : 'Emails are queued for your review before sending'}
                      </p>
                    </div>
                    <Toggle
                      checked={salesConfig.config.auto_send}
                      onChange={v => updateSalesField('auto_send', v)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-5">
                <button
                  onClick={() => saveConfig('sales_agent')}
                  disabled={saving === 'sales_agent'}
                  className="btn-primary flex items-center gap-2"
                  style={{ fontSize: '12px', opacity: saving === 'sales_agent' ? 0.5 : 1 }}
                >
                  <Save size={12} />
                  {saving === 'sales_agent' ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* E. PERFORMANCE METRICS */}
      {/* ============================================ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Users size={13} className="text-blue-400" />
            <p className="label">Leads This Week</p>
          </div>
          <p className="text-polar font-[800]" style={{ fontSize: '24px' }}>&mdash;</p>
          <p className="text-dim mono" style={{ fontSize: '11px', marginTop: 4 }}>Awaiting first run</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Mail size={13} className="text-green-400" />
            <p className="label">Emails Sent</p>
          </div>
          <p className="text-polar font-[800]" style={{ fontSize: '24px' }}>&mdash;</p>
          <p className="text-dim mono" style={{ fontSize: '11px', marginTop: 4 }}>Awaiting first run</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={13} className="text-purple-400" />
            <p className="label">Reply Rate</p>
          </div>
          <p className="text-polar font-[800]" style={{ fontSize: '24px' }}>&mdash;</p>
          <p className="text-dim mono" style={{ fontSize: '11px', marginTop: 4 }}>No data yet</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <CalendarCheck size={13} className="text-amber-400" />
            <p className="label">Meetings Booked</p>
          </div>
          <p className="text-polar font-[800]" style={{ fontSize: '24px' }}>&mdash;</p>
          <p className="text-dim mono" style={{ fontSize: '11px', marginTop: 4 }}>No data yet</p>
        </div>
      </div>

      {/* ============================================ */}
      {/* C. ACTIVITY FEED */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Activity size={13} className="text-dim" />
            <p className="text-polar font-semibold" style={{ fontSize: '13px' }}>Activity Feed</p>
          </div>

          {activityFeed.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Bot size={32} className="text-dim mx-auto mb-3" style={{ opacity: 0.25 }} />
              <p className="text-steel font-semibold" style={{ fontSize: '13px' }}>No activity yet</p>
              <p className="text-dim mt-1" style={{ fontSize: '12px' }}>
                Enable an agent to get started
              </p>
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              {activityFeed.map(entry => (
                <div key={entry.id} className="px-5 py-2.5 border-b border-border/50 flex items-start gap-3 hover:bg-surface transition-colors">
                  <span className="text-dim mono flex-shrink-0" style={{ fontSize: '10px', marginTop: 2 }}>
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-steel" style={{ fontSize: '12px' }}>{entry.description}</span>
                  <span className={`ml-auto flex-shrink-0 px-1.5 py-0.5 border ${
                    entry.status === 'success' ? 'text-green-400 bg-green-500/10 border-green-500/20' :
                    entry.status === 'error' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                    entry.status === 'warning' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                    'text-dim bg-surface-2 border-border'
                  }`} style={{ fontSize: '10px', fontWeight: 600 }}>
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ============================================ */}
        {/* D. OUTREACH QUEUE */}
        {/* ============================================ */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Mail size={13} className="text-dim" />
            <p className="text-polar font-semibold" style={{ fontSize: '13px' }}>Outreach Queue</p>
            {outreachQueue.length > 0 && (
              <span className="ml-auto text-dim mono px-1.5 py-0.5 bg-surface-2 border border-border" style={{ fontSize: '10px', fontWeight: 700 }}>
                {outreachQueue.length} pending
              </span>
            )}
          </div>

          {outreachQueue.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Mail size={32} className="text-dim mx-auto mb-3" style={{ opacity: 0.25 }} />
              <p className="text-steel font-semibold" style={{ fontSize: '13px' }}>No pending emails</p>
              <p className="text-dim mt-1 max-w-xs mx-auto" style={{ fontSize: '12px' }}>
                When auto-send is off, outreach emails will appear here for your review before sending.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: '12px' }}>
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="label px-4 py-2.5">Lead</th>
                    <th className="label px-4 py-2.5">Industry</th>
                    <th className="label px-4 py-2.5">Subject</th>
                    <th className="label px-4 py-2.5 text-center">Score</th>
                    <th className="label px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {outreachQueue.map(item => (
                    <tr key={item.id} className="table-row">
                      <td className="px-4 py-2.5 text-polar font-semibold">{item.lead_name}</td>
                      <td className="px-4 py-2.5 text-steel">{item.industry}</td>
                      <td className="px-4 py-2.5 text-steel" style={{ maxWidth: 180 }}>
                        <span className="truncate block">{item.email_subject}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`mono font-bold ${
                          item.score >= 80 ? 'text-green-400' : item.score >= 50 ? 'text-amber-400' : 'text-dim'
                        }`}>
                          {item.score}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button className="p-1 text-green-400 hover:bg-green-500/10 transition-colors" title="Approve">
                            <Check size={13} />
                          </button>
                          <button className="p-1 text-dim hover:bg-surface-2 transition-colors" title="Edit">
                            <Edit3 size={13} />
                          </button>
                          <button className="p-1 text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Skip">
                            <X size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
