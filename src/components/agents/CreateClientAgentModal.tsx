import { useState } from 'react'
import { X, Building2, Plus, Loader2 } from 'lucide-react'

interface CreateClientAgentModalProps {
  onClose: () => void
  onCreate: (name: string, config: Record<string, any>) => Promise<void>
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
        style={{ accentColor: '#f59e0b' }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-dim" style={{ fontSize: '10px' }}>{min}</span>
        <span className="text-dim" style={{ fontSize: '10px' }}>{max}</span>
      </div>
    </div>
  )
}

export default function CreateClientAgentModal({ onClose, onCreate }: CreateClientAgentModalProps) {
  const [agentName, setAgentName] = useState('')
  const [clientBusiness, setClientBusiness] = useState('')
  const [targetLeads, setTargetLeads] = useState('')
  const [targetLocation, setTargetLocation] = useState('')
  const [dailyLeadQuota, setDailyLeadQuota] = useState(15)
  const [dailyEmailLimit, setDailyEmailLimit] = useState(10)
  const [outreachTone, setOutreachTone] = useState('Professional')
  const [creating, setCreating] = useState(false)

  const canCreate = agentName.trim().length > 0

  const handleCreate = async () => {
    if (!canCreate) return
    setCreating(true)
    try {
      await onCreate(agentName.trim(), {
        client_business: clientBusiness,
        target_industries: targetLeads,
        target_location: targetLocation,
        daily_lead_quota: dailyLeadQuota,
        daily_email_limit: dailyEmailLimit,
        outreach_tone: outreachTone,
        auto_send: false,
        working_hours_start: '09:00',
        working_hours_end: '18:00',
      })
      onClose()
    } catch {
      // Error handled in hook
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="modal-container bg-cell w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Building2 size={14} className="text-amber-400" />
            </div>
            <div>
              <p className="text-polar font-semibold" style={{ fontSize: '14px' }}>Create Client Agent</p>
              <p className="text-dim" style={{ fontSize: '11px' }}>Set up a new lead generation agent for your client</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            {/* Agent Name */}
            <div>
              <p className="label mb-1.5">Agent Name <span className="text-red-400">*</span></p>
              <input
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                style={{ fontSize: '13px' }}
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                placeholder="e.g., Ideal Integration"
                autoFocus
              />
              <p className="text-dim mt-1" style={{ fontSize: '10px' }}>The name of your client or their company</p>
            </div>

            {/* Client Business */}
            <div>
              <p className="label mb-1.5">Client Business</p>
              <input
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                style={{ fontSize: '13px' }}
                value={clientBusiness}
                onChange={e => setClientBusiness(e.target.value)}
                placeholder="e.g., Home automation & smart home installation"
              />
              <p className="text-dim mt-1" style={{ fontSize: '10px' }}>What does your client do?</p>
            </div>

            {/* Target Leads */}
            <div>
              <p className="label mb-1.5">Target Leads</p>
              <input
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                style={{ fontSize: '13px' }}
                value={targetLeads}
                onChange={e => setTargetLeads(e.target.value)}
                placeholder="e.g., home builders, property managers, real estate developers"
              />
              <p className="text-dim mt-1" style={{ fontSize: '10px' }}>Comma-separated list of industries or lead types to target</p>
            </div>

            {/* Target Location */}
            <div>
              <p className="label mb-1.5">Target Location</p>
              <input
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                style={{ fontSize: '13px' }}
                value={targetLocation}
                onChange={e => setTargetLocation(e.target.value)}
                placeholder="e.g., Edmonton, AB"
              />
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Slider
                label="Daily Lead Quota"
                value={dailyLeadQuota}
                min={5}
                max={50}
                onChange={setDailyLeadQuota}
              />
              <Slider
                label="Daily Email Limit"
                value={dailyEmailLimit}
                min={5}
                max={30}
                onChange={setDailyEmailLimit}
              />
            </div>

            {/* Outreach Tone */}
            <div>
              <p className="label mb-1.5">Outreach Tone</p>
              <select
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                style={{ fontSize: '13px' }}
                value={outreachTone}
                onChange={e => setOutreachTone(e.target.value)}
              >
                <option value="Professional">Professional</option>
                <option value="Friendly">Friendly</option>
                <option value="Casual">Casual</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="btn-ghost rounded-lg" style={{ fontSize: '11px', padding: '6px 14px' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="btn-primary flex items-center gap-2 rounded-lg"
            style={{
              fontSize: '11px',
              padding: '6px 18px',
              opacity: (!canCreate || creating) ? 0.4 : 1,
            }}
          >
            {creating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            {creating ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
