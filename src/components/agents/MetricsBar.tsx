import { Users, Mail, MessageSquare, CalendarCheck, TrendingUp } from 'lucide-react'
import type { AgentMetrics } from '@/hooks/useAgentDashboard'

interface MetricsBarProps {
  metrics: AgentMetrics
  loading?: boolean
}

const cards = [
  {
    key: 'leads',
    label: 'Leads Found',
    field: 'leadsThisWeek' as const,
    icon: Users,
    accent: 'blue',
    iconColor: 'text-blue-400',
    accentClass: 'stat-card-accent--blue',
  },
  {
    key: 'emails',
    label: 'Emails Sent',
    field: 'emailsSentThisWeek' as const,
    icon: Mail,
    accent: 'green',
    iconColor: 'text-green-400',
    accentClass: 'stat-card-accent--green',
  },
  {
    key: 'replies',
    label: 'Reply Rate',
    field: 'replyRate' as const,
    icon: MessageSquare,
    accent: 'purple',
    iconColor: 'text-purple-400',
    accentClass: 'stat-card-accent--purple',
    suffix: '%',
  },
  {
    key: 'meetings',
    label: 'Meetings Booked',
    field: 'meetingsBooked' as const,
    icon: CalendarCheck,
    accent: 'amber',
    iconColor: 'text-amber-400',
    accentClass: 'stat-card-accent--amber',
  },
]

export default function MetricsBar({ metrics, loading }: MetricsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(card => {
        const Icon = card.icon
        const value = metrics[card.field]
        const hasData = value > 0

        return (
          <div key={card.key} className="stat-card stat-card--has-accent group">
            <div className={card.accentClass + ' stat-card-accent'} />

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
                  card.accent === 'blue' ? 'bg-blue-500/10' :
                  card.accent === 'green' ? 'bg-green-500/10' :
                  card.accent === 'purple' ? 'bg-purple-500/10' :
                  'bg-amber-500/10'
                }`}>
                  <Icon size={14} className={card.iconColor} />
                </div>
                <p className="label">{card.label}</p>
              </div>
              {hasData && (
                <TrendingUp size={12} className="text-green-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>

            {loading ? (
              <div className="h-8 w-16 skeleton-shimmer rounded" />
            ) : (
              <p className="stat-value text-polar">
                {hasData ? value : '\u2014'}
                {hasData && card.suffix && (
                  <span className="text-dim" style={{ fontSize: '16px', fontWeight: 600 }}>{card.suffix}</span>
                )}
              </p>
            )}

            <p className="text-dim mono" style={{ fontSize: '10px', marginTop: 6 }}>
              {hasData ? 'This week' : 'Awaiting data'}
            </p>
          </div>
        )
      })}
    </div>
  )
}
