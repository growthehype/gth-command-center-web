import { useState } from 'react'
import { Bot, Inbox, Activity, Settings2, Loader2, Plus, Building2 } from 'lucide-react'
import { useAgentDashboard } from '@/hooks/useAgentDashboard'
import MetricsBar from '@/components/agents/MetricsBar'
import AgentCard from '@/components/agents/AgentCard'
import ClientAgentCard from '@/components/agents/ClientAgentCard'
import CreateClientAgentModal from '@/components/agents/CreateClientAgentModal'
import ActivityFeed from '@/components/agents/ActivityFeed'
import OutreachQueue from '@/components/agents/OutreachQueue'
import AgentConfigPanel from '@/components/agents/AgentConfigPanel'

// ---- Tab Type ----
type TabKey = 'queue' | 'activity' | 'config'

const tabs: { key: TabKey; label: string; icon: typeof Inbox }[] = [
  { key: 'queue', label: 'Review Queue', icon: Inbox },
  { key: 'activity', label: 'Activity Feed', icon: Activity },
  { key: 'config', label: 'Configuration', icon: Settings2 },
]

export default function Agents() {
  const {
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
  } = useAgentDashboard()

  const [activeTab, setActiveTab] = useState<TabKey>('queue')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Determine system status
  const hasEnabledAgent = configs.some(c => c.enabled)
  const hasRunningAgent = configs.some(c => c.status === 'running')
  const systemStatus = hasRunningAgent ? 'running' : hasEnabledAgent ? 'active' : 'idle'

  const leadGenConfig = getConfig('lead_generator')
  const salesConfig = getConfig('sales_agent')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <Loader2 size={24} className="animate-spin text-dim mx-auto mb-3" />
          <p className="text-dim" style={{ fontSize: '12px', fontWeight: 600 }}>Loading command center...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ============================================ */}
      {/* COMMAND CENTER HEADER */}
      {/* ============================================ */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1>AI Command Center</h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-border">
              <span
                className={`w-2 h-2 rounded-full ${
                  systemStatus === 'running'
                    ? 'bg-blue-400 animate-pulse'
                    : systemStatus === 'active'
                    ? 'bg-green-400'
                    : 'bg-gray-500'
                }`}
              />
              <span
                className={`${
                  systemStatus === 'running'
                    ? 'text-blue-400'
                    : systemStatus === 'active'
                    ? 'text-green-400'
                    : 'text-dim'
                }`}
                style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                {systemStatus === 'running' ? 'Agents Running' : systemStatus === 'active' ? 'System Active' : 'System Idle'}
              </span>
            </div>
          </div>
          <p className="text-dim" style={{ fontSize: '13px' }}>
            Autonomous agents working 24/7 to grow your business
          </p>
        </div>
      </div>

      {/* ============================================ */}
      {/* METRICS BAR */}
      {/* ============================================ */}
      <div className="mb-6">
        <MetricsBar metrics={metrics} loading={loading} />
      </div>

      {/* ============================================ */}
      {/* AGENT CARDS */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <AgentCard
          config={leadGenConfig}
          runs={runs}
          isRunning={runningAgents.has('lead_generator')}
          onToggle={(enabled) => toggleAgent('lead_generator', enabled)}
          onRun={() => runAgent('lead_generator')}
        />
        <AgentCard
          config={salesConfig}
          runs={runs}
          isRunning={runningAgents.has('sales_agent')}
          onToggle={(enabled) => toggleAgent('sales_agent', enabled)}
          onRun={() => runAgent('sales_agent')}
        />
      </div>

      {/* ============================================ */}
      {/* CLIENT AGENTS SECTION */}
      {/* ============================================ */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Building2 size={15} className="text-amber-400" />
            <h3 className="text-polar" style={{ fontSize: '13px', fontWeight: 800 }}>Client Agents</h3>
            {clientAgents.length > 0 && (
              <span
                className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
                style={{ fontSize: '10px', fontWeight: 800, minWidth: 18 }}
              >
                {clientAgents.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-ghost flex items-center gap-2 rounded-lg"
            style={{ fontSize: '10px', padding: '5px 12px' }}
          >
            <Plus size={12} />
            New Agent
          </button>
        </div>

        {clientAgents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {clientAgents.map(agent => (
              <ClientAgentCard
                key={agent.agent_key}
                config={agent}
                runs={runs}
                isRunning={runningAgents.has(agent.agent_key)}
                onToggle={(enabled) => toggleAgent(agent.agent_key, enabled)}
                onRun={() => runAgent(agent.agent_key)}
                onDelete={() => deleteClientAgent(agent.agent_key)}
              />
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center justify-center py-10 text-center" style={{ borderStyle: 'dashed' }}>
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
              <Building2 size={22} className="text-amber-400/60" />
            </div>
            <p className="text-steel mb-1" style={{ fontSize: '13px', fontWeight: 600 }}>No client agents yet</p>
            <p className="text-dim mb-4" style={{ fontSize: '11px', maxWidth: 340 }}>
              Create your first client agent to start generating leads for your clients
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center gap-2 rounded-lg"
              style={{ fontSize: '11px', padding: '6px 16px' }}
            >
              <Plus size={12} />
              Create Client Agent
            </button>
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* CREATE CLIENT AGENT MODAL */}
      {/* ============================================ */}
      {showCreateModal && (
        <CreateClientAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createClientAgent}
        />
      )}

      {/* ============================================ */}
      {/* TABBED SECTION */}
      {/* ============================================ */}
      <div className="card overflow-hidden" style={{ padding: 0 }}>
        {/* Tab Bar */}
        <div className="flex items-center border-b border-border px-1">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            const queueCount = tab.key === 'queue' ? queue.length : 0

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-2 px-4 py-3 transition-colors ${
                  isActive
                    ? 'text-polar'
                    : 'text-dim hover:text-steel'
                }`}
                style={{ fontSize: '12px', fontWeight: isActive ? 700 : 600 }}
              >
                <Icon size={14} />
                {tab.label}
                {queueCount > 0 && tab.key === 'queue' && (
                  <span
                    className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
                    style={{ fontSize: '10px', fontWeight: 800, minWidth: 18 }}
                  >
                    {queueCount}
                  </span>
                )}
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-info rounded-t-full" />
                )}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div style={{ animation: 'fadeIn 0.15s ease-out' }}>
          {activeTab === 'queue' && (
            <OutreachQueue
              queue={queue}
              loading={loading}
              onApprove={approveStep}
              onSkip={skipStep}
              onUpdate={updateStepContent}
            />
          )}

          {activeTab === 'activity' && (
            <ActivityFeed activity={activity} loading={loading} />
          )}

          {activeTab === 'config' && (
            <div className="p-4">
              <AgentConfigPanel configs={configs} onSave={saveConfig} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
