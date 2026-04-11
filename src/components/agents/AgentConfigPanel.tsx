import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Search, Send, Save, Loader2, Building2,
} from 'lucide-react'
import type { AgentConfig } from '@/hooks/useAgentDashboard'

interface AgentConfigPanelProps {
  configs: AgentConfig[]
  onSave: (agentKey: string, config: Record<string, any>) => Promise<void>
}

// ---- Toggle ----
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 cursor-pointer ${
        checked ? 'bg-green-500' : 'bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

// ---- Slider ----
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
        className="w-full h-1.5 bg-surface-2 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: 'var(--color-info, #2563EB)' }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-dim" style={{ fontSize: '10px' }}>{min}</span>
        <span className="text-dim" style={{ fontSize: '10px' }}>{max}</span>
      </div>
    </div>
  )
}

// ---- Single Agent Config ----
function AgentConfigSection({
  config,
  onSave,
}: {
  config: AgentConfig
  onSave: (agentKey: string, cfg: Record<string, any>) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [localConfig, setLocalConfig] = useState<Record<string, any>>({ ...config.config })

  const isLeadGen = config.agent_key === 'lead_generator'
  const Icon = isLeadGen ? Search : Send
  const iconColor = isLeadGen ? 'text-blue-400' : 'text-purple-400'

  const updateField = (key: string, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(config.agent_key, localConfig)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card overflow-hidden" style={{ padding: 0 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {expanded ? (
            <ChevronDown size={14} className="text-dim" />
          ) : (
            <ChevronRight size={14} className="text-dim" />
          )}
          <Icon size={14} className={iconColor} />
          <span className="text-polar font-semibold" style={{ fontSize: '13px' }}>
            {isLeadGen ? 'Sarah' : 'Selina'} — Configuration
          </span>
        </div>
        <span className="text-dim hidden sm:block" style={{ fontSize: '11px' }}>
          {isLeadGen
            ? `${localConfig.target_location} \u00B7 ${localConfig.daily_lead_quota} leads/day`
            : `${localConfig.product_focus} \u00B7 ${localConfig.daily_email_limit} emails/day`}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-5" style={{ animation: 'fadeIn 0.15s ease-out' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Row 1 */}
            {isLeadGen ? (
              <>
                <div>
                  <p className="label mb-1.5">Target Industries</p>
                  <input
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                    style={{ fontSize: '13px' }}
                    value={localConfig.target_industries || ''}
                    onChange={e => updateField('target_industries', e.target.value)}
                    placeholder="daycares, property management, dental clinics"
                  />
                  <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Comma-separated list</p>
                </div>
                <div>
                  <p className="label mb-1.5">Target Location</p>
                  <input
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                    style={{ fontSize: '13px' }}
                    value={localConfig.target_location || ''}
                    onChange={e => updateField('target_location', e.target.value)}
                    placeholder="Edmonton, AB"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="label mb-1.5">Target Audience</p>
                  <input
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                    style={{ fontSize: '13px' }}
                    value={localConfig.target_audience || ''}
                    onChange={e => updateField('target_audience', e.target.value)}
                    placeholder="agencies, freelancers, startups"
                  />
                  <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Comma-separated list</p>
                </div>
                <div>
                  <p className="label mb-1.5">Product Focus</p>
                  <select
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                    style={{ fontSize: '13px' }}
                    value={localConfig.product_focus || 'CRM Product'}
                    onChange={e => updateField('product_focus', e.target.value)}
                  >
                    <option value="CRM Product">CRM Product</option>
                    <option value="Digital Services">Digital Services</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
              </>
            )}

            {/* Quotas */}
            {isLeadGen && (
              <div>
                <Slider
                  label="Daily Lead Quota"
                  value={localConfig.daily_lead_quota || 25}
                  min={5}
                  max={100}
                  onChange={v => updateField('daily_lead_quota', v)}
                />
              </div>
            )}

            <div>
              <Slider
                label="Daily Email Limit"
                value={localConfig.daily_email_limit || 15}
                min={5}
                max={50}
                onChange={v => updateField('daily_email_limit', v)}
              />
            </div>

            {/* Working Hours */}
            <div>
              <p className="label mb-1.5">Working Hours</p>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-polar"
                  style={{ fontSize: '13px' }}
                  value={localConfig.working_hours_start || '09:00'}
                  onChange={e => updateField('working_hours_start', e.target.value)}
                />
                <span className="text-dim" style={{ fontSize: '12px' }}>to</span>
                <input
                  type="time"
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-polar"
                  style={{ fontSize: '13px' }}
                  value={localConfig.working_hours_end || '18:00'}
                  onChange={e => updateField('working_hours_end', e.target.value)}
                />
              </div>
            </div>

            {/* Outreach Tone */}
            <div>
              <p className="label mb-1.5">Outreach Tone</p>
              <select
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                style={{ fontSize: '13px' }}
                value={localConfig.outreach_tone || 'Professional'}
                onChange={e => updateField('outreach_tone', e.target.value)}
              >
                <option value="Professional">Professional</option>
                <option value="Friendly">Friendly</option>
                <option value="Casual">Casual</option>
              </select>
            </div>

            {/* Auto-Send Toggle */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between px-4 py-3 bg-surface border border-border rounded-lg">
                <div>
                  <p className="text-polar font-semibold" style={{ fontSize: '13px' }}>Auto-Send Emails</p>
                  <p className="text-dim" style={{ fontSize: '11px' }}>
                    {localConfig.auto_send
                      ? 'Emails are sent automatically without review'
                      : 'Emails are queued for your review before sending'}
                  </p>
                </div>
                <Toggle
                  checked={localConfig.auto_send || false}
                  onChange={v => updateField('auto_send', v)}
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end mt-5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2 rounded-lg"
              style={{ fontSize: '11px', padding: '6px 14px', opacity: saving ? 0.5 : 1 }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Client Agent Config Section ----
function ClientAgentConfigSection({
  config,
  onSave,
}: {
  config: AgentConfig
  onSave: (agentKey: string, cfg: Record<string, any>) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [localConfig, setLocalConfig] = useState<Record<string, any>>({ ...config.config })

  const updateField = (key: string, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(config.agent_key, localConfig)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card overflow-hidden" style={{ padding: 0 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {expanded ? (
            <ChevronDown size={14} className="text-dim" />
          ) : (
            <ChevronRight size={14} className="text-dim" />
          )}
          <Building2 size={14} className="text-amber-400" />
          <span className="text-polar font-semibold" style={{ fontSize: '13px' }}>
            {config.agent_name || config.agent_key} — Configuration
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
            style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            Client
          </span>
        </div>
        <span className="text-dim hidden sm:block" style={{ fontSize: '11px' }}>
          {localConfig.target_location ? `${localConfig.target_location} \u00B7 ` : ''}{localConfig.daily_lead_quota || 15} leads/day
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-5" style={{ animation: 'fadeIn 0.15s ease-out' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* ── SECTION: Client Business ── */}
            <div className="md:col-span-2">
              <p className="label mb-1.5">Client Business Description</p>
              <textarea
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar resize-none"
                style={{ fontSize: '13px', minHeight: '60px' }}
                rows={2}
                value={localConfig.client_business || ''}
                onChange={e => updateField('client_business', e.target.value)}
                placeholder="Premium smart home automation, Control4 & Lutron integration, commercial AV, security systems - Edmonton, AB"
              />
              <p className="text-dim mt-1" style={{ fontSize: '10px' }}>What does your client sell? This context is fed to the AI for scoring and emails.</p>
            </div>

            <div>
              <p className="label mb-1.5">Target Location</p>
              <input
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                style={{ fontSize: '13px' }}
                value={localConfig.target_location || ''}
                onChange={e => updateField('target_location', e.target.value)}
                placeholder="Edmonton, AB"
              />
            </div>

            <div>
              <p className="label mb-1.5">Target Industries</p>
              <input
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                style={{ fontSize: '13px' }}
                value={localConfig.target_industries || ''}
                onChange={e => updateField('target_industries', e.target.value)}
                placeholder="home builders, property managers, real estate developers"
              />
              <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Comma-separated — used as Google Places search queries</p>
            </div>

            {/* ── SECTION: AI Training ── */}
            <div className="md:col-span-2 pt-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-blue-500 rounded-full" />
                <span className="text-polar font-semibold" style={{ fontSize: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>AI Training Rules</span>
              </div>
            </div>

            <div className="md:col-span-2">
              <p className="label mb-1.5">Ideal Customer Profile</p>
              <textarea
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar resize-none"
                style={{ fontSize: '13px', minHeight: '80px' }}
                rows={3}
                value={localConfig.ideal_customer_profile || ''}
                onChange={e => updateField('ideal_customer_profile', e.target.value)}
                placeholder="New home builders building $500K+ homes, luxury property managers, commercial office developers, businesses renovating or building new spaces that would benefit from smart home / AV integration"
              />
              <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Describe the perfect lead. The AI uses this to score leads higher or lower.</p>
            </div>

            <div className="md:col-span-2">
              <p className="label mb-1.5">Qualifying Signals (What makes a HOT lead)</p>
              <textarea
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar resize-none"
                style={{ fontSize: '13px', minHeight: '60px' }}
                rows={2}
                value={localConfig.qualifying_signals || ''}
                onChange={e => updateField('qualifying_signals', e.target.value)}
                placeholder="Builds luxury/custom homes, mentions smart home on website, has a showroom, works with high-end clients, new construction projects"
              />
              <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Comma-separated signals that mean a lead is a great fit</p>
            </div>

            <div className="md:col-span-2">
              <p className="label mb-1.5">Disqualifying Signals (Auto-skip these)</p>
              <textarea
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar resize-none"
                style={{ fontSize: '13px', minHeight: '60px' }}
                rows={2}
                value={localConfig.disqualifying_signals || ''}
                onChange={e => updateField('disqualifying_signals', e.target.value)}
                placeholder="National chain, franchise location, already has smart home partner, only does small repairs, no website"
              />
              <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Comma-separated — leads matching these get scored low or skipped entirely</p>
            </div>

            <div>
              <p className="label mb-1.5">Excluded Businesses</p>
              <textarea
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar resize-none"
                style={{ fontSize: '13px', minHeight: '60px' }}
                rows={2}
                value={localConfig.excluded_businesses || ''}
                onChange={e => updateField('excluded_businesses', e.target.value)}
                placeholder="Home Depot, Lowes, Best Buy"
              />
              <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Specific business names to never pull</p>
            </div>

            <div>
              <p className="label mb-1.5">Minimum Google Rating</p>
              <div className="flex items-center gap-3">
                <select
                  className="px-3 py-2 bg-surface border border-border rounded-md text-polar"
                  style={{ fontSize: '13px', width: '100px' }}
                  value={localConfig.min_rating || '0'}
                  onChange={e => updateField('min_rating', Number(e.target.value))}
                >
                  <option value="0">Any</option>
                  <option value="3">3.0+</option>
                  <option value="3.5">3.5+</option>
                  <option value="4">4.0+</option>
                  <option value="4.5">4.5+</option>
                </select>
                <p className="text-dim" style={{ fontSize: '11px' }}>Skip low-rated businesses</p>
              </div>
            </div>

            {/* ── SECTION: Quotas & Schedule ── */}
            <div className="md:col-span-2 pt-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-green-500 rounded-full" />
                <span className="text-polar font-semibold" style={{ fontSize: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Quotas & Schedule</span>
              </div>
            </div>

            <div>
              <Slider
                label="Daily Lead Quota"
                value={localConfig.daily_lead_quota || 15}
                min={5}
                max={50}
                onChange={v => updateField('daily_lead_quota', v)}
              />
            </div>

            <div>
              <Slider
                label="Daily Email Limit"
                value={localConfig.daily_email_limit || 10}
                min={5}
                max={30}
                onChange={v => updateField('daily_email_limit', v)}
              />
            </div>

            <div>
              <p className="label mb-1.5">Working Hours</p>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-polar"
                  style={{ fontSize: '13px' }}
                  value={localConfig.working_hours_start || '09:00'}
                  onChange={e => updateField('working_hours_start', e.target.value)}
                />
                <span className="text-dim" style={{ fontSize: '12px' }}>to</span>
                <input
                  type="time"
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-polar"
                  style={{ fontSize: '13px' }}
                  value={localConfig.working_hours_end || '18:00'}
                  onChange={e => updateField('working_hours_end', e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="label mb-1.5">Outreach Tone</p>
              <select
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                style={{ fontSize: '13px' }}
                value={localConfig.outreach_tone || 'Professional'}
                onChange={e => updateField('outreach_tone', e.target.value)}
              >
                <option value="Professional">Professional</option>
                <option value="Friendly">Friendly</option>
                <option value="Casual">Casual</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between px-4 py-3 bg-surface border border-border rounded-lg">
                <div>
                  <p className="text-polar font-semibold" style={{ fontSize: '13px' }}>Auto-Send Emails</p>
                  <p className="text-dim" style={{ fontSize: '11px' }}>
                    {localConfig.auto_send
                      ? 'Emails are sent automatically without review'
                      : 'Emails are queued for your review before sending'}
                  </p>
                </div>
                <Toggle
                  checked={localConfig.auto_send || false}
                  onChange={v => updateField('auto_send', v)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2 rounded-lg"
              style={{ fontSize: '11px', padding: '6px 14px', opacity: saving ? 0.5 : 1 }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AgentConfigPanel({ configs, onSave }: AgentConfigPanelProps) {
  const leadGen = configs.find(c => c.agent_key === 'lead_generator')
  const sales = configs.find(c => c.agent_key === 'sales_agent')
  const clientConfigs = configs.filter(c => c.agent_type === 'client')

  return (
    <div className="space-y-3">
      {leadGen && <AgentConfigSection config={leadGen} onSave={onSave} />}
      {sales && <AgentConfigSection config={sales} onSave={onSave} />}

      {clientConfigs.length > 0 && (
        <>
          <div className="flex items-center gap-2.5 pt-3 pb-1">
            <Building2 size={13} className="text-amber-400" />
            <span className="text-dim" style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Client Agents
            </span>
          </div>
          {clientConfigs.map(c => (
            <ClientAgentConfigSection key={c.agent_key} config={c} onSave={onSave} />
          ))}
        </>
      )}
    </div>
  )
}
