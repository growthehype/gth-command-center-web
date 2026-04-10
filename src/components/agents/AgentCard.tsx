import { Search, Send, Play, Clock, Loader2, Users, Mail, MessageSquare } from 'lucide-react'
import type { AgentConfig, AgentStatus, AgentRun } from '@/hooks/useAgentDashboard'

interface AgentCardProps {
  config: AgentConfig
  runs: AgentRun[]
  isRunning: boolean
  onToggle: (enabled: boolean) => void
  onRun: () => void
}

// ---- Toggle Switch ----
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

// ---- Status Badge ----
function StatusBadge({ status }: { status: AgentStatus }) {
  const styles: Record<AgentStatus, { dot: string; text: string; bg: string; border: string; label: string; pulse?: boolean }> = {
    running: { dot: 'bg-blue-400', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Running', pulse: true },
    idle: { dot: 'bg-green-400', text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'Active' },
    error: { dot: 'bg-red-400', text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Error' },
    disabled: { dot: 'bg-gray-500', text: 'text-dim/60', bg: 'bg-surface', border: 'border-border/50', label: 'Disabled' },
  }
  const s = styles[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${s.text} ${s.bg} border ${s.border}`} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
  )
}

// ---- Helpers ----
function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '--'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  return `${mins}m ${secs % 60}s`
}

export default function AgentCard({ config, runs, isRunning, onToggle, onRun }: AgentCardProps) {
  const isLeadGen = config.agent_key === 'lead_generator'
  const Icon = isLeadGen ? Search : Send
  const iconColor = isLeadGen ? 'text-blue-400' : 'text-purple-400'
  const iconBg = isLeadGen ? 'bg-blue-500/10 border-blue-500/20' : 'bg-purple-500/10 border-purple-500/20'
  const gradientBorder = config.enabled
    ? isLeadGen
      ? 'bg-gradient-to-r from-blue-500/20 via-blue-500/5 to-transparent'
      : 'bg-gradient-to-r from-purple-500/20 via-purple-500/5 to-transparent'
    : ''

  // Compute stats from recent runs for this agent
  const agentRuns = runs.filter(r => r.agent_key === config.agent_key)
  const totalLeads = agentRuns.reduce((sum, r) => sum + (r.leads_found || 0), 0)
  const totalEmails = agentRuns.reduce((sum, r) => sum + (r.emails_sent || 0), 0)
  const totalReplies = agentRuns.reduce((sum, r) => sum + (r.replies_received || 0), 0)

  // Daily quota usage
  const dailyLimit = config.config.daily_email_limit || 15
  const todayRuns = agentRuns.filter(r => {
    const runDate = new Date(r.started_at).toDateString()
    return runDate === new Date().toDateString()
  })
  const todayEmails = todayRuns.reduce((sum, r) => sum + (r.emails_sent || 0), 0)
  const quotaPercent = Math.min((todayEmails / dailyLimit) * 100, 100)

  return (
    <div
      className={`relative card overflow-hidden transition-all duration-300 ${
        config.enabled ? 'opacity-100' : 'opacity-60'
      }`}
      style={{ padding: 0 }}
    >
      {/* Subtle gradient top border when active */}
      {config.enabled && (
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${gradientBorder}`} />
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${iconBg} border flex items-center justify-center`}>
              <Icon size={18} className={iconColor} />
            </div>
            <div>
              <p className="text-polar font-semibold" style={{ fontSize: '15px', fontWeight: 700 }}>
                {isLeadGen ? 'Sarah' : 'Selina'}
              </p>
              <p className="text-dim" style={{ fontSize: '11px' }}>
                {isLeadGen ? 'Lead Generation Agent — Finds & qualifies new business leads' : 'Sales Agent — Manages outreach sequences & closes deals'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={config.status === 'idle' && config.enabled ? 'idle' : config.status} />
            <Toggle checked={config.enabled} onChange={onToggle} />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="px-3 py-2.5 bg-surface border border-border rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Users size={10} className="text-blue-400" />
              <span className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Leads</span>
            </div>
            <p className="text-polar font-[800]" style={{ fontSize: '18px' }}>{totalLeads || '\u2014'}</p>
          </div>
          <div className="px-3 py-2.5 bg-surface border border-border rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Mail size={10} className="text-green-400" />
              <span className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Sent</span>
            </div>
            <p className="text-polar font-[800]" style={{ fontSize: '18px' }}>{totalEmails || '\u2014'}</p>
          </div>
          <div className="px-3 py-2.5 bg-surface border border-border rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <MessageSquare size={10} className="text-purple-400" />
              <span className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Replies</span>
            </div>
            <p className="text-polar font-[800]" style={{ fontSize: '18px' }}>{totalReplies || '\u2014'}</p>
          </div>
        </div>

        {/* Quota Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-dim" style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Daily Quota</span>
            <span className="mono text-steel" style={{ fontSize: '11px', fontWeight: 700 }}>
              {todayEmails}/{dailyLimit} emails
            </span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                quotaPercent >= 90 ? 'bg-amber-500' : quotaPercent >= 70 ? 'bg-blue-500' : 'bg-green-500'
              }`}
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
        </div>

        {/* Footer: Last Run + Run Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-dim" />
              <span className="text-dim mono" style={{ fontSize: '11px' }}>
                {relativeTime(config.last_run_at)}
              </span>
            </div>
            {config.last_run_duration_ms && (
              <span className="text-dim mono" style={{ fontSize: '11px' }}>
                {formatDuration(config.last_run_duration_ms)}
              </span>
            )}
          </div>

          <button
            onClick={onRun}
            disabled={!config.enabled || isRunning}
            className="btn-primary flex items-center gap-2 rounded-lg"
            style={{
              opacity: (!config.enabled || isRunning) ? 0.4 : 1,
              fontSize: '11px',
              padding: '6px 14px',
            }}
          >
            {isRunning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            {isRunning ? 'Running...' : 'Run Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
