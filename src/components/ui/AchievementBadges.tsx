import { useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import {
  DollarSign, TrendingUp, Zap, Crown,
  CheckSquare, Shield, Award,
  Users, Building2, Castle,
  Flame, Rocket,
  Handshake, Target,
  Package, Layers,
  Clock, Brain,
  Lock,
  type LucideIcon,
} from 'lucide-react'

interface Badge {
  id: string
  title: string
  requirement: string
  icon: LucideIcon
  category: string
  check: (data: CrmData) => boolean
}

interface CrmData {
  totalRevenue: number
  completedTasks: number
  activeClients: number
  completedProjects: number
  totalHours: number
  pipelineValue: number
  closedWonCount: number
  paidInvoiceCount: number
  timeEntryCount: number
  streak: number
}

const BADGES: Badge[] = [
  // Revenue
  { id: 'first-dollar', title: 'First Dollar', requirement: '1 paid invoice', icon: DollarSign, category: 'Revenue', check: (d) => d.paidInvoiceCount >= 1 },
  { id: 'five-figure', title: 'Five Figure Club', requirement: '$10k+ revenue', icon: TrendingUp, category: 'Revenue', check: (d) => d.totalRevenue >= 10_000 },
  { id: 'revenue-machine', title: 'Revenue Machine', requirement: '$50k+ revenue', icon: Zap, category: 'Revenue', check: (d) => d.totalRevenue >= 50_000 },
  { id: 'six-figures', title: 'Six Figures', requirement: '$100k+ revenue', icon: Crown, category: 'Revenue', check: (d) => d.totalRevenue >= 100_000 },
  // Tasks
  { id: 'task-slayer', title: 'Task Slayer', requirement: '10+ tasks done', icon: CheckSquare, category: 'Tasks', check: (d) => d.completedTasks >= 10 },
  { id: 'centurion', title: 'Centurion', requirement: '100+ tasks done', icon: Shield, category: 'Tasks', check: (d) => d.completedTasks >= 100 },
  { id: 'thousand-club', title: 'Thousand Club', requirement: '1000+ tasks done', icon: Award, category: 'Tasks', check: (d) => d.completedTasks >= 1000 },
  // Clients
  { id: 'first-client', title: 'First Client', requirement: '1 active client', icon: Users, category: 'Clients', check: (d) => d.activeClients >= 1 },
  { id: 'growing-agency', title: 'Growing Agency', requirement: '5+ active clients', icon: Building2, category: 'Clients', check: (d) => d.activeClients >= 5 },
  { id: 'empire-builder', title: 'Empire Builder', requirement: '15+ active clients', icon: Castle, category: 'Clients', check: (d) => d.activeClients >= 15 },
  // Streaks
  { id: 'on-fire', title: 'On Fire', requirement: '7-day streak', icon: Flame, category: 'Streaks', check: (d) => d.streak >= 7 },
  { id: 'unstoppable', title: 'Unstoppable', requirement: '30-day streak', icon: Rocket, category: 'Streaks', check: (d) => d.streak >= 30 },
  // Pipeline
  { id: 'deal-maker', title: 'Deal Maker', requirement: '1 closed-won deal', icon: Handshake, category: 'Pipeline', check: (d) => d.closedWonCount >= 1 },
  { id: 'pipeline-crusher', title: 'Pipeline Crusher', requirement: '$50k+ pipeline', icon: Target, category: 'Pipeline', check: (d) => d.pipelineValue >= 50_000 },
  // Projects
  { id: 'ship-it', title: 'Ship It', requirement: '1 project done', icon: Package, category: 'Projects', check: (d) => d.completedProjects >= 1 },
  { id: 'prolific', title: 'Prolific', requirement: '10+ projects done', icon: Layers, category: 'Projects', check: (d) => d.completedProjects >= 10 },
  // Time
  { id: 'time-tracker', title: 'Time Tracker', requirement: '10+ time entries', icon: Clock, category: 'Time', check: (d) => d.timeEntryCount >= 10 },
  { id: 'deep-worker', title: 'Deep Worker', requirement: '100+ hours logged', icon: Brain, category: 'Time', check: (d) => d.totalHours >= 100 },
]

const TOTAL_BADGES = BADGES.length

export default function AchievementBadges({ streak }: { streak: number }) {
  const { clients, tasks, projects, invoices, leads, timeEntries } = useAppStore()

  const crmData = useMemo<CrmData>(() => {
    const paidInvoices = invoices.filter((i) => i.status === 'paid')
    return {
      totalRevenue: paidInvoices.reduce((s, i) => s + (i.amount || 0), 0),
      paidInvoiceCount: paidInvoices.length,
      completedTasks: tasks.filter((t) => t.done).length,
      activeClients: clients.filter((c) => c.status === 'active').length,
      completedProjects: projects.filter((p) => p.status === 'done').length,
      totalHours: timeEntries.reduce((s, te) => s + (te.duration_minutes || 0), 0) / 60,
      timeEntryCount: timeEntries.length,
      pipelineValue: leads
        .filter((l) => l.stage !== 'Closed Won' && l.stage !== 'Closed Lost')
        .reduce((s, l) => s + (l.deal_value || 0), 0),
      closedWonCount: leads.filter((l) => l.stage === 'Closed Won').length,
      streak,
    }
  }, [clients, tasks, projects, invoices, leads, timeEntries, streak])

  const results = useMemo(() => {
    return BADGES.map((badge) => ({
      ...badge,
      unlocked: badge.check(crmData),
    }))
  }, [crmData])

  const unlockedCount = useMemo(() => results.filter((r) => r.unlocked).length, [results])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 className="section-header" style={{ marginBottom: 0 }}>Achievements</h3>
        <span className="mono text-dim" style={{ fontSize: 12 }}>
          {unlockedCount}/{TOTAL_BADGES} unlocked
        </span>
      </div>

      <div
        className="card"
        style={{
          padding: '16px 12px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            minWidth: 'max-content',
          }}
        >
          {results.map((badge) => {
            const Icon = badge.icon
            const unlocked = badge.unlocked

            return (
              <div
                key={badge.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 72,
                  flexShrink: 0,
                  opacity: unlocked ? 1 : 0.3,
                  transition: 'opacity 0.2s',
                }}
                title={unlocked ? badge.title : badge.requirement}
              >
                {/* Icon circle */}
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: unlocked
                      ? 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.15) 100%)'
                      : 'rgba(255,255,255,0.04)',
                    border: unlocked
                      ? '1.5px solid rgba(59,130,246,0.4)'
                      : '1.5px solid rgba(255,255,255,0.08)',
                    boxShadow: unlocked
                      ? '0 0 16px rgba(59,130,246,0.2), 0 0 4px rgba(139,92,246,0.15)'
                      : 'none',
                    position: 'relative',
                  }}
                >
                  <Icon
                    size={24}
                    strokeWidth={1.8}
                    style={{
                      color: unlocked ? '#93C5FD' : '#666',
                    }}
                  />
                  {!unlocked && (
                    <Lock
                      size={12}
                      strokeWidth={2.5}
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        color: '#666',
                        background: 'var(--color-surface, #1a1a1a)',
                        borderRadius: '50%',
                        padding: 2,
                      }}
                    />
                  )}
                </div>

                {/* Title */}
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    marginTop: 6,
                    textAlign: 'center',
                    lineHeight: 1.3,
                    color: unlocked ? 'var(--color-polar, #f0f0f0)' : 'var(--color-dim, #888)',
                    maxWidth: 72,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {unlocked ? badge.title : '???'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
