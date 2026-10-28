import { useState } from 'react'
import { Loader2, Plus, ChevronDown } from 'lucide-react'
import { useAgentDashboard } from '@/hooks/useAgentDashboard'
import AgentCard from '@/components/agents/AgentCard'
import ClientAgentCard from '@/components/agents/ClientAgentCard'
import CreateClientAgentModal from '@/components/agents/CreateClientAgentModal'
import ActivityFeed from '@/components/agents/ActivityFeed'
import ProspectorPanel from '@/components/agents/ProspectorPanel'
import ApprovalQueue from '@/components/agents/ApprovalQueue'

export default function Agents() {
  const {
    configs,
    runs,
    queue,
    today,
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

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showOthers, setShowOthers] = useState(false)
  const [showLog, setShowLog] = useState(false)

  // The GTH prospector is the lead_gen agent carrying the 'gth' profile
  const prospector = configs.find((c) => c.config?.profile === 'gth') || getConfig('lead_generator')
  const prospectorKey = prospector.agent_key || 'lead_generator'
  const salesConfig = getConfig('sales_agent')
  const prospectorRunning = runningAgents.has(prospectorKey)
  const lastProspectorRun = runs.find((r) => r.agent_key === 'lead_generator')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={22} className="animate-spin text-dim" />
      </div>
    )
  }

  return (
    <div className="max-w-[1180px] mx-auto pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1>AI Agents</h1>
          <p className="text-dim mt-1.5" style={{ fontSize: 13 }}>
            Your prospector hunts and writes. You approve. Replies stop the sequence automatically.
          </p>
        </div>
      </header>

      <ProspectorPanel
        config={prospector}
        today={today}
        lastSummary={lastProspectorRun?.result_summary || null}
        isRunning={prospectorRunning}
        onRun={() => runAgent(prospectorKey)}
        onToggle={(enabled) => toggleAgent(prospectorKey, enabled)}
        onSave={(cfg) => saveConfig(prospectorKey, cfg)}
      />

      <section className="mt-10" aria-labelledby="queue-title">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h3 id="queue-title" className="section-header" style={{ marginBottom: 0 }}>Waiting for your approval</h3>
            {queue.length > 0 && <span className="badge badge-warn tabular-nums">{queue.length}</span>}
          </div>
          <span className="text-dim hidden md:inline" style={{ fontSize: 12 }}>
            Approve sends it from your Gmail right away
          </span>
        </div>
        <ApprovalQueue
          queue={queue}
          loading={loading}
          isRunning={prospectorRunning}
          onApprove={approveStep}
          onSkip={skipStep}
          onSave={updateStepContent}
          onRun={() => runAgent(prospectorKey)}
        />
      </section>

      <section className="mt-10">
        <button
          className="flex items-center gap-2 text-steel hover:text-polar"
          onClick={() => setShowLog((v) => !v)}
          aria-expanded={showLog}
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          <ChevronDown size={14} style={{ transform: showLog ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
          Run log
          <span className="text-dim" style={{ fontWeight: 400 }}>· last {Math.min(runs.length, 20)} runs</span>
        </button>
        {showLog && (
          <div className="card mt-3" style={{ padding: 0, borderRadius: 14 }}>
            <ActivityFeed activity={activity} loading={loading} />
          </div>
        )}
      </section>

      <section className="mt-6">
        <button
          className="flex items-center gap-2 text-steel hover:text-polar"
          onClick={() => setShowOthers((v) => !v)}
          aria-expanded={showOthers}
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          <ChevronDown size={14} style={{ transform: showOthers ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
          Other agents
          <span className="text-dim" style={{ fontWeight: 400 }}>· sales agent and client agents ({clientAgents.length})</span>
        </button>

        {showOthers && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AgentCard
                config={salesConfig}
                runs={runs}
                isRunning={runningAgents.has('sales_agent')}
                onToggle={(enabled) => toggleAgent('sales_agent', enabled)}
                onRun={() => runAgent('sales_agent')}
              />
              {clientAgents.map((agent) => (
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
            <button onClick={() => setShowCreateModal(true)} className="btn-ghost">
              <Plus size={12} />
              New client agent
            </button>
          </div>
        )}
      </section>

      {showCreateModal && (
        <CreateClientAgentModal onClose={() => setShowCreateModal(false)} onCreate={createClientAgent} />
      )}
    </div>
  )
}
