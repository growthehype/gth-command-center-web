import { useEffect, useState } from 'react'
import { Link2, Check, Send, ExternalLink, Calendar, Mail, MessageSquare, MessageCircle, Zap, FileText, CreditCard, Globe, BarChart3, Clock, BookOpen, Webhook } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { integrations } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'

// ── Types ──

interface IntegrationConfig {
  enabled?: boolean
  webhookUrl?: string
  apiKey?: string
  events?: Record<string, boolean>
}

type IntStatus = 'connected' | 'not_connected' | 'coming_soon'

interface IntegrationDef {
  provider: string
  name: string
  description: string
  icon: React.ComponentType<any>
  iconColor: string
  bgColor: string
  category: 'built-in' | 'webhooks' | 'api' | 'planned'
  type: 'built-in' | 'webhook' | 'api-key' | 'oauth'
  helpUrl?: string
  helpText?: string
  placeholderUrl?: string
}

// ── Webhook events ──

const SUPPORTED_EVENTS = [
  { key: 'client.created', label: 'New client created' },
  { key: 'invoice.paid', label: 'Invoice paid' },
  { key: 'invoice.sent', label: 'Invoice sent' },
  { key: 'task.completed', label: 'Task completed' },
  { key: 'project.completed', label: 'Project completed' },
  { key: 'lead.converted', label: 'Lead converted' },
  { key: 'meeting.created', label: 'Meeting created' },
]

// ── Integration definitions ──

const INTEGRATIONS: IntegrationDef[] = [
  // Built-in (already in the app)
  {
    provider: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sync events between your CRM calendar and Google Calendar. Already built into the Calendar page.',
    icon: Calendar,
    iconColor: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    category: 'built-in',
    type: 'built-in',
  },
  {
    provider: 'gmail',
    name: 'Gmail',
    description: 'Send emails directly from the CRM using your Gmail account. Connected via the Settings page.',
    icon: Mail,
    iconColor: 'text-red-400',
    bgColor: 'bg-red-500/10',
    category: 'built-in',
    type: 'built-in',
  },
  // Webhook-based (functional now)
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Send CRM notifications to any Slack channel via incoming webhooks.',
    icon: MessageSquare,
    iconColor: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    category: 'webhooks',
    type: 'webhook',
    helpUrl: 'https://api.slack.com/messaging/webhooks',
    helpText: 'Create an Incoming Webhook in your Slack workspace settings, then paste the URL here.',
    placeholderUrl: 'https://hooks.slack.com/services/T.../B.../...',
  },
  {
    provider: 'discord',
    name: 'Discord',
    description: 'Send CRM notifications to any Discord channel via webhooks.',
    icon: MessageCircle,
    iconColor: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    category: 'webhooks',
    type: 'webhook',
    helpUrl: 'https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks',
    helpText: 'In Discord, go to Channel Settings → Integrations → Webhooks → New Webhook, then copy the URL.',
    placeholderUrl: 'https://discord.com/api/webhooks/...',
  },
  {
    provider: 'zapier',
    name: 'Zapier',
    description: 'Connect to 6,000+ apps. Use webhooks to trigger Zaps from CRM events.',
    icon: Zap,
    iconColor: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    category: 'webhooks',
    type: 'webhook',
    helpUrl: 'https://zapier.com/apps/webhook/integrations',
    helpText: 'Create a Zap with "Webhooks by Zapier" as the trigger (Catch Hook), then paste the webhook URL here.',
    placeholderUrl: 'https://hooks.zapier.com/hooks/catch/...',
  },
  {
    provider: 'custom-webhook',
    name: 'Custom Webhook',
    description: 'Send CRM events to any URL. Works with Make, n8n, Pipedream, or your own API.',
    icon: Webhook,
    iconColor: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    category: 'webhooks',
    type: 'webhook',
    helpText: 'Enter any URL that accepts POST requests with JSON payloads.',
    placeholderUrl: 'https://your-endpoint.com/webhook',
  },
  // Planned (coming soon — need OAuth or deeper integration)
  {
    provider: 'notion',
    name: 'Notion',
    description: 'Sync projects and tasks to Notion databases.',
    icon: BookOpen,
    iconColor: 'text-stone-300',
    bgColor: 'bg-stone-500/10',
    category: 'planned',
    type: 'oauth',
  },
  {
    provider: 'stripe',
    name: 'Stripe',
    description: 'Accept payments on invoices and auto-update payment status.',
    icon: CreditCard,
    iconColor: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    category: 'planned',
    type: 'oauth',
  },
  {
    provider: 'wave',
    name: 'Wave',
    description: 'Sync invoices and expenses with Wave accounting.',
    icon: BarChart3,
    iconColor: 'text-blue-300',
    bgColor: 'bg-blue-500/10',
    category: 'planned',
    type: 'oauth',
  },
  {
    provider: 'quickbooks',
    name: 'QuickBooks',
    description: 'Sync invoices and financial data with QuickBooks Online.',
    icon: FileText,
    iconColor: 'text-green-400',
    bgColor: 'bg-green-500/10',
    category: 'planned',
    type: 'oauth',
  },
  {
    provider: 'calendly',
    name: 'Calendly',
    description: 'Auto-create meetings and contacts when Calendly bookings come in.',
    icon: Clock,
    iconColor: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    category: 'planned',
    type: 'oauth',
  },
  {
    provider: 'google-sheets',
    name: 'Google Sheets',
    description: 'Export client, invoice, and project data to Google Sheets.',
    icon: Globe,
    iconColor: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    category: 'planned',
    type: 'oauth',
  },
]

// ── Built-in integration card ──

function BuiltInCard({ def }: { def: IntegrationDef }) {
  const setCurrentPage = useAppStore(s => s.setCurrentPage)
  const tokenKey = def.provider === 'google-calendar' ? 'gth_google_token' : 'gth_gmail_token'
  const hasToken = !!localStorage.getItem(tokenKey)
  const navPage = def.provider === 'google-calendar' ? 'calendar' : 'settings'
  const Icon = def.icon

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${def.bgColor} flex items-center justify-center ${def.iconColor}`}>
            <Icon size={20} />
          </div>
          <div>
            <h3 className="text-polar font-[700]" style={{ fontSize: '13.5px' }}>{def.name}</h3>
            <p className="text-dim" style={{ fontSize: '11px', maxWidth: 220 }}>{def.description}</p>
          </div>
        </div>
      </div>
      <div className="mt-auto pt-3 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 ${hasToken ? 'text-ok' : 'text-dim'}`} style={{ fontSize: '11px', fontWeight: 600 }}>
          <span className={`w-1.5 h-1.5 rounded-full ${hasToken ? 'bg-ok' : 'bg-dim/50'}`} />
          {hasToken ? 'Connected' : 'Not connected'}
        </span>
        <button
          onClick={() => setCurrentPage(navPage)}
          className="btn-ghost flex items-center gap-1"
          style={{ fontSize: '11px', padding: '6px 12px' }}
        >
          Go to {navPage === 'calendar' ? 'Calendar' : 'Settings'} <ExternalLink size={11} />
        </button>
      </div>
    </div>
  )
}

// ── Webhook integration card ──

function WebhookCard({ def, config, onSave }: {
  def: IntegrationDef
  config: IntegrationConfig
  onSave: (provider: string, config: IntegrationConfig) => Promise<void>
}) {
  const [localConfig, setLocalConfig] = useState<IntegrationConfig>(config)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => { setLocalConfig(config) }, [config])

  const isConnected = localConfig.enabled && !!localConfig.webhookUrl?.trim()
  const Icon = def.icon

  const handleTest = async () => {
    const url = localConfig.webhookUrl?.trim()
    if (!url) { showToast('Enter a webhook URL first', 'warn'); return }
    setTesting(true)
    try {
      const isSlack = url.includes('hooks.slack.com')
      const isDiscord = url.includes('discord.com')
      const payload = isSlack
        ? { text: '✅ Connected to Command Center CRM!' }
        : isDiscord
        ? { content: '✅ Connected to Command Center CRM!' }
        : { event: 'test', message: 'Connected to Command Center CRM!', timestamp: new Date().toISOString() }

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'no-cors',
      })
      showToast('Test message sent! Check your channel.', 'success')
    } catch (err: any) {
      showToast(err.message || 'Test failed — check the URL', 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!localConfig.webhookUrl?.trim()) {
      showToast('Please enter a webhook URL', 'warn')
      return
    }
    setSaving(true)
    try {
      const saveConfig = { ...localConfig, enabled: true }
      await onSave(def.provider, saveConfig)
      setLocalConfig(saveConfig)
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    setSaving(true)
    try {
      const saveConfig = { enabled: false, webhookUrl: '', events: {} }
      await onSave(def.provider, saveConfig)
      setLocalConfig(saveConfig)
      setExpanded(false)
    } finally {
      setSaving(false)
    }
  }

  const handleEventToggle = (key: string) => {
    setLocalConfig(prev => ({
      ...prev,
      events: { ...prev.events, [key]: !prev.events?.[key] },
    }))
  }

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${def.bgColor} flex items-center justify-center ${def.iconColor}`}>
            <Icon size={20} />
          </div>
          <div>
            <h3 className="text-polar font-[700]" style={{ fontSize: '13.5px' }}>{def.name}</h3>
            <p className="text-dim" style={{ fontSize: '11px', maxWidth: 220 }}>{def.description}</p>
          </div>
        </div>
      </div>

      {/* Status + actions */}
      <div className="mt-auto pt-3 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 ${isConnected ? 'text-ok' : 'text-dim'}`} style={{ fontSize: '11px', fontWeight: 600 }}>
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-ok' : 'bg-dim/50'}`} />
          {isConnected ? 'Connected' : 'Not connected'}
        </span>
        <div className="flex gap-2">
          {isConnected && (
            <button onClick={handleDisconnect} disabled={saving} className="btn-ghost text-err" style={{ fontSize: '11px', padding: '6px 12px' }}>
              Disconnect
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className={expanded ? 'btn-ghost' : 'btn-primary'}
            style={{ fontSize: '11px', padding: '6px 14px' }}
          >
            {expanded ? 'Close' : isConnected ? 'Settings' : 'Set Up'}
          </button>
        </div>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          {def.helpText && (
            <p className="text-dim" style={{ fontSize: '11px', lineHeight: '1.5' }}>
              {def.helpText}
              {def.helpUrl && (
                <> <a href={def.helpUrl} target="_blank" rel="noopener" className="text-accent hover:underline inline-flex items-center gap-0.5">
                  Setup guide <ExternalLink size={10} />
                </a></>
              )}
            </p>
          )}

          <div>
            <label className="label text-dim block mb-1.5" style={{ fontSize: '11px' }}>Webhook URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={localConfig.webhookUrl || ''}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                placeholder={def.placeholderUrl || 'https://...'}
                className="bg-cell border border-border px-3 py-2 text-polar rounded flex-1"
                style={{ fontSize: '11.5px' }}
              />
              <button
                onClick={handleTest}
                disabled={testing || !localConfig.webhookUrl?.trim()}
                className="btn-ghost flex items-center gap-1"
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                <Send size={12} /> {testing ? 'Sending...' : 'Test'}
              </button>
            </div>
          </div>

          {/* Event toggles */}
          <div>
            <label className="label text-dim block mb-2" style={{ fontSize: '11px' }}>Notify on these events:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
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
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-1.5"
              style={{ fontSize: '11px', padding: '7px 16px' }}
            >
              <Check size={13} /> {saving ? 'Saving...' : 'Save & Connect'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Coming soon card ──

function PlannedCard({ def }: { def: IntegrationDef }) {
  const Icon = def.icon
  return (
    <div className="card p-5 flex flex-col opacity-60">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${def.bgColor} flex items-center justify-center ${def.iconColor}`}>
            <Icon size={20} />
          </div>
          <div>
            <h3 className="text-polar font-[700]" style={{ fontSize: '13.5px' }}>{def.name}</h3>
            <p className="text-dim" style={{ fontSize: '11px', maxWidth: 220 }}>{def.description}</p>
          </div>
        </div>
      </div>
      <div className="mt-auto pt-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-dim" style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em' }}>
          COMING SOON
        </span>
      </div>
    </div>
  )
}

// ── Main page ──

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
    } catch {
      // integrations table may not exist pre-migration — that's fine
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (provider: string, config: IntegrationConfig) => {
    try {
      await integrations.upsert(provider, config)
      setConfigs(prev => ({ ...prev, [provider]: config }))
      showToast(`${provider} integration saved`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to save — run the migration first', 'error')
    }
  }

  const builtIn = INTEGRATIONS.filter(d => d.category === 'built-in')
  const webhooks = INTEGRATIONS.filter(d => d.category === 'webhooks')
  const planned = INTEGRATIONS.filter(d => d.category === 'planned')

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-polar font-[800] flex items-center gap-2" style={{ fontSize: '22px', letterSpacing: '-0.02em' }}>
          <Link2 size={22} /> Integrations
        </h1>
        <p className="text-dim mt-1" style={{ fontSize: '12.5px' }}>
          Connect your CRM to the tools you already use.
        </p>
      </div>

      {/* Built-in */}
      <section>
        <h2 className="text-steel font-[700] mb-3 flex items-center gap-2" style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-ok" /> Built-in
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {builtIn.map(def => <BuiltInCard key={def.provider} def={def} />)}
        </div>
      </section>

      {/* Webhooks */}
      <section>
        <h2 className="text-steel font-[700] mb-3 flex items-center gap-2" style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent" /> Webhooks &amp; Notifications
        </h2>
        <p className="text-dim mb-4" style={{ fontSize: '11.5px' }}>
          Paste a webhook URL and select which events trigger notifications. Works immediately — no OAuth required.
        </p>
        {loading ? (
          <div className="text-dim text-center py-12" style={{ fontSize: '12.5px' }}>Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {webhooks.map(def => (
              <WebhookCard key={def.provider} def={def} config={configs[def.provider] || {}} onSave={handleSave} />
            ))}
          </div>
        )}
      </section>

      {/* Planned */}
      <section>
        <h2 className="text-steel font-[700] mb-3 flex items-center gap-2" style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-dim/50" /> Coming Soon
        </h2>
        <p className="text-dim mb-4" style={{ fontSize: '11.5px' }}>
          These integrations require OAuth or deeper API work. They're on the roadmap.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {planned.map(def => <PlannedCard key={def.provider} def={def} />)}
        </div>
      </section>
    </div>
  )
}
