import { useEffect, useState } from 'react'
import { Zap, MessageSquare, FileText, MessageCircle, Link2, Check, X, Send } from 'lucide-react'
import { useTenant } from '@/hooks/useTenant'
import { integrations } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'

interface IntegrationConfig {
  enabled?: boolean
  webhookUrl?: string
  events?: Record<string, boolean>
}

interface IntegrationDef {
  provider: string
  name: string
  description: string
  icon: React.ComponentType<any>
  iconColor: string
  hasWebhook: boolean
  hasEvents: boolean
  comingSoon?: boolean
}

const SUPPORTED_EVENTS = [
  { key: 'client.created', label: 'New client created' },
  { key: 'invoice.paid', label: 'Invoice paid' },
  { key: 'task.completed', label: 'Task completed' },
  { key: 'project.completed', label: 'Project completed' },
  { key: 'lead.converted', label: 'Lead converted' },
]

const INTEGRATION_DEFS: IntegrationDef[] = [
  {
    provider: 'zapier',
    name: 'Zapier',
    description: 'Connect to 5,000+ apps via Zapier',
    icon: Zap,
    iconColor: 'text-orange-400',
    hasWebhook: false,
    hasEvents: true,
  },
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Get CRM notifications in Slack',
    icon: MessageSquare,
    iconColor: 'text-purple-400',
    hasWebhook: true,
    hasEvents: true,
  },
  {
    provider: 'quickbooks',
    name: 'QuickBooks',
    description: 'Sync invoices to QuickBooks',
    icon: FileText,
    iconColor: 'text-green-400',
    hasWebhook: false,
    hasEvents: false,
    comingSoon: true,
  },
  {
    provider: 'discord',
    name: 'Discord',
    description: 'Get CRM notifications in Discord',
    icon: MessageCircle,
    iconColor: 'text-indigo-400',
    hasWebhook: true,
    hasEvents: true,
  },
]

function IntegrationCard({ def, config, onSave }: {
  def: IntegrationDef
  config: IntegrationConfig
  onSave: (provider: string, config: IntegrationConfig) => Promise<void>
}) {
  const { canManageIntegrations } = useTenant()
  const [localConfig, setLocalConfig] = useState<IntegrationConfig>(config)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setLocalConfig(config)
  }, [config])

  const isConnected = localConfig.enabled === true

  const handleToggle = async () => {
    const updated = { ...localConfig, enabled: !localConfig.enabled }
    setLocalConfig(updated)
    setSaving(true)
    try {
      await onSave(def.provider, updated)
    } finally {
      setSaving(false)
    }
  }

  const handleWebhookChange = (url: string) => {
    setLocalConfig(prev => ({ ...prev, webhookUrl: url }))
  }

  const handleEventToggle = (eventKey: string) => {
    setLocalConfig(prev => ({
      ...prev,
      events: { ...prev.events, [eventKey]: !prev.events?.[eventKey] },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(def.provider, localConfig)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!localConfig.webhookUrl?.trim()) {
      showToast('Enter a webhook URL first', 'warn')
      return
    }
    setTesting(true)
    try {
      const payload = def.provider === 'slack'
        ? { text: 'Connected to Command Center CRM!' }
        : { content: 'Connected to Command Center CRM!' }

      await fetch(localConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      showToast('Test message sent!', 'success')
    } catch (err: any) {
      showToast(err.message || 'Test failed', 'error')
    } finally {
      setTesting(false)
    }
  }

  const Icon = def.icon
  const tenantId = useTenant().tenantId

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center ${def.iconColor}`}>
            <Icon size={20} />
          </div>
          <div>
            <h3 className="text-polar font-[700]" style={{ fontSize: '13.5px' }}>{def.name}</h3>
            <p className="text-dim" style={{ fontSize: '11px' }}>{def.description}</p>
          </div>
        </div>
        <span
          className={`badge ${isConnected ? 'badge-ok' : 'badge-neutral'}`}
          style={{ fontSize: '10px' }}
        >
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {def.comingSoon ? (
        <div className="flex-1 flex items-center justify-center py-6">
          <span className="text-dim font-[600]" style={{ fontSize: '12px' }}>Coming soon — OAuth required</span>
        </div>
      ) : (
        <>
          {/* Toggle / expand */}
          <div className="flex items-center gap-2 mt-auto pt-3">
            {canManageIntegrations && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="btn-ghost flex-1 text-left"
                style={{ fontSize: '11px', padding: '6px 10px' }}
              >
                {expanded ? 'Hide settings' : 'Configure'}
              </button>
            )}
            {canManageIntegrations && (
              <button
                onClick={handleToggle}
                disabled={saving}
                className={isConnected ? 'btn-ghost text-err' : 'btn-primary'}
                style={{ fontSize: '11px', padding: '6px 14px' }}
              >
                {isConnected ? 'Disconnect' : 'Connect'}
              </button>
            )}
          </div>

          {/* Expanded settings */}
          {expanded && canManageIntegrations && (
            <div className="mt-4 pt-4 border-t border-border space-y-4">
              {/* Zapier webhook URL display */}
              {def.provider === 'zapier' && tenantId && (
                <div>
                  <label className="label text-dim block mb-1.5" style={{ fontSize: '11px' }}>Webhook URL (for Zapier triggers)</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={`${window.location.origin}/api/webhooks/zapier/${tenantId}`}
                      className="bg-cell border border-border px-3 py-2 text-steel rounded flex-1 font-mono"
                      style={{ fontSize: '11px' }}
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/zapier/${tenantId}`)
                        showToast('Webhook URL copied', 'info')
                      }}
                      className="btn-ghost"
                      style={{ padding: '6px 10px' }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {/* Webhook URL input for Slack/Discord */}
              {def.hasWebhook && (
                <div>
                  <label className="label text-dim block mb-1.5" style={{ fontSize: '11px' }}>
                    {def.name} Webhook URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={localConfig.webhookUrl || ''}
                      onChange={(e) => handleWebhookChange(e.target.value)}
                      placeholder={`https://hooks.${def.provider}.com/...`}
                      className="bg-cell border border-border px-3 py-2 text-polar rounded flex-1"
                      style={{ fontSize: '11.5px' }}
                    />
                    <button
                      onClick={handleTest}
                      disabled={testing}
                      className="btn-ghost flex items-center gap-1"
                      style={{ fontSize: '11px', padding: '6px 12px' }}
                    >
                      <Send size={12} /> {testing ? 'Sending...' : 'Test'}
                    </button>
                  </div>
                </div>
              )}

              {/* Event toggles */}
              {def.hasEvents && (
                <div>
                  <label className="label text-dim block mb-2" style={{ fontSize: '11px' }}>Events</label>
                  <div className="space-y-1.5">
                    {SUPPORTED_EVENTS.map(evt => (
                      <label key={evt.key} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={localConfig.events?.[evt.key] ?? false}
                          onChange={() => handleEventToggle(evt.key)}
                          className="accent-accent"
                        />
                        <span className="text-steel group-hover:text-polar transition-colors" style={{ fontSize: '11.5px' }}>
                          {evt.label}
                        </span>
                        <span className="text-dim font-mono" style={{ fontSize: '9.5px' }}>{evt.key}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex items-center gap-1.5"
                  style={{ fontSize: '11px', padding: '7px 16px' }}
                >
                  <Check size={13} /> {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Integrations() {
  const [configs, setConfigs] = useState<Record<string, IntegrationConfig>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = async () => {
    setLoading(true)
    try {
      const all = await integrations.getAll()
      const map: Record<string, IntegrationConfig> = {}
      for (const row of all) {
        map[row.provider] = row.config || {}
      }
      setConfigs(map)
    } catch (err) {
      console.error('Failed to load integrations:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (provider: string, config: IntegrationConfig) => {
    try {
      await integrations.upsert(provider, config)
      setConfigs(prev => ({ ...prev, [provider]: config }))
      showToast('Integration settings saved', 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to save', 'error')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-polar font-[800] flex items-center gap-2" style={{ fontSize: '22px', letterSpacing: '-0.02em' }}>
          <Link2 size={22} /> Integrations
        </h1>
        <p className="text-dim mt-1" style={{ fontSize: '12.5px' }}>
          Connect your CRM to external tools and services.
        </p>
      </div>

      {/* Integration cards grid */}
      {loading ? (
        <div className="text-dim text-center py-16" style={{ fontSize: '12.5px' }}>Loading integrations...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {INTEGRATION_DEFS.map(def => (
            <IntegrationCard
              key={def.provider}
              def={def}
              config={configs[def.provider] || {}}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}
