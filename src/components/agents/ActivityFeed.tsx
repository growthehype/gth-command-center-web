import {
  Bot, Search, FileEdit, Send, MessageSquare, UserCheck, AlertTriangle, Zap,
} from 'lucide-react'
import type { ActivityItem } from '@/hooks/useAgentDashboard'

interface ActivityFeedProps {
  activity: ActivityItem[]
  loading?: boolean
}

const typeConfig: Record<string, { icon: typeof Bot; color: string; bg: string }> = {
  lead_scraped: { icon: Search, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  email_drafted: { icon: FileEdit, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  email_sent: { icon: Send, color: 'text-green-400', bg: 'bg-green-500/10' },
  reply_received: { icon: MessageSquare, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  lead_qualified: { icon: UserCheck, color: 'text-teal-400', bg: 'bg-teal-500/10' },
  error: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
  agent_run: { icon: Zap, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  info: { icon: Bot, color: 'text-dim', bg: 'bg-surface-2' },
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-400',
    info: 'bg-blue-400',
    warning: 'bg-amber-400',
    error: 'bg-red-400',
  }
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[status] || 'bg-gray-500'}`} />
}

export default function ActivityFeed({ activity, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg skeleton-shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 skeleton-shimmer rounded" />
              <div className="h-2.5 w-1/3 skeleton-shimmer rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (activity.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center mx-auto mb-3">
          <Bot size={20} className="text-dim" style={{ opacity: 0.4 }} />
        </div>
        <p className="text-steel font-semibold" style={{ fontSize: '13px' }}>No activity yet</p>
        <p className="text-dim mt-1 max-w-xs mx-auto" style={{ fontSize: '12px' }}>
          Enable an agent to get started. Activity will appear here in real-time.
        </p>
      </div>
    )
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {activity.map((item, i) => {
        const cfg = typeConfig[item.type] || typeConfig.info
        const Icon = cfg.icon

        return (
          <div
            key={item.id}
            className="flex items-start gap-3 px-4 py-3 border-b border-border/40 hover:bg-surface/50 transition-colors"
            style={{ animation: `fadeIn 0.15s ease-out ${i * 0.03}s both` }}
          >
            {/* Icon */}
            <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
              <Icon size={13} className={cfg.color} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-steel leading-snug" style={{ fontSize: '12px' }}>
                {item.description}
              </p>
              <p className="text-dim mono mt-0.5" style={{ fontSize: '10px' }}>
                {relativeTime(item.timestamp)}
              </p>
            </div>

            {/* Status */}
            <StatusDot status={item.status} />
          </div>
        )
      })}
    </div>
  )
}
