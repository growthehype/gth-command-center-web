import { useState, useMemo, useCallback, useEffect, DragEvent } from 'react'
import StatusMenu, { type StatusOption } from '@/components/ui/StatusMenu'
import { Target, Plus, Trash2, ChevronUp, ChevronDown, Search, AlertTriangle, Clock, List, Columns3, Download, Bot, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useAppStore, OutreachLead } from '@/lib/store'
import { outreach } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import VoiceTextarea from '@/components/ui/VoiceTextarea'
import { formatCurrency, relativeDate, friendlyDate, isOverdue } from '@/lib/utils'
import { isToday, parseISO, differenceInCalendarDays } from 'date-fns'
import { downloadLeadsCsv } from '@/lib/lead-export'
import { useLeadAgents, AgentDeck, AgentSettingsModal, leadBelongsTo, isExportAgent, agentFor, type LeadAgent } from '@/components/outreach/LeadAgents'
import { useAgentDashboard } from '@/hooks/useAgentDashboard'
import ApprovalQueue from '@/components/agents/ApprovalQueue'
import { useConfirm } from '@/hooks/useConfirm'
import { useDebounce } from '@/hooks/useDebounce'

const STAGES = ['New Lead', 'Contacted', 'Responded', 'Meeting Set', 'Closed Won', 'Closed Lost'] as const
type Stage = (typeof STAGES)[number]

const STAGE_OPTIONS: StatusOption[] = [
  { value: 'New Lead', label: 'New lead', tone: 'neutral' },
  { value: 'Contacted', label: 'Contacted', tone: 'warn' },
  { value: 'Responded', label: 'Responded', tone: 'info' },
  { value: 'Meeting Set', label: 'Meeting set', tone: 'info' },
  { value: 'Closed Won', label: 'Won', tone: 'ok' },
  { value: 'Closed Lost', label: 'Lost', tone: 'err' },
]

/** Agent-created leads use slug stages (e.g. "new-lead"); show them on the same scale. */
function normalizeStage(stage: string | null | undefined): string {
  if (!stage) return 'New Lead'
  const hit = STAGES.find(s => s.toLowerCase().replace(/\s+/g, '-') === stage.toLowerCase())
  return hit || stage
}

const STAGE_BADGE: Record<string, string> = {
  'New Lead': 'badge badge-neutral',
  'Contacted': 'badge badge-warn',
  'Responded': 'badge badge-polar',
  'Meeting Set': 'badge badge-ok',
  'Closed Won': 'badge badge-ok',
  'Closed Lost': 'badge badge-err',
}

const STAGE_COLORS: Record<string, string> = {
  // Stages brighten as a lead moves forward; outcomes carry status colour
  'New Lead': '#4D5560',
  'Contacted': '#7D8794',
  'Responded': '#A3ADB9',
  'Meeting Set': '#D9DEE4',
  'Closed Won': '#4CC38A',
  'Closed Lost': '#F0575C',
}

// Expanded industry list — matches the categories the agent scraper writes
// so the Edit modal's industry field can actually pre-select scraped values.
// Also used as <datalist> suggestions so the user can still type free text.
const INDUSTRIES = [
  'Dental', 'Medical', 'Veterinary', 'Pharmacy',
  'Contractor', 'Real Estate', 'Construction',
  'Auto Dealer', 'Auto Repair', 'Auto Service', 'Auto Parts',
  'Restaurant', 'Cafe', 'Bakery', 'Bar',
  'Salon', 'Spa', 'Fitness',
  'Legal', 'Accounting', 'Insurance', 'Bank',
  'Retail', 'Florist', 'Pet', 'Travel', 'Service',
  'Technology', 'Other',
]

// Google Places returns junk place types like:
//   "general_contractor, service, point_of_interest, establishment"
// These map raw primary types to friendly *category* labels (so dentist,
// dental_clinic, orthodontist all show as the SAME "Dental" — no more
// duplicate categories for the same kind of business).
const GOOGLE_TYPE_NOISE = new Set([
  'establishment', 'point_of_interest', 'service', 'store',
  'premise', 'subpremise', 'food', 'finance', 'health',
])
const GOOGLE_TYPE_LABELS: Record<string, string> = {
  // Dental — all collapse to a single category
  dentist: 'Dental', dental_clinic: 'Dental', orthodontist: 'Dental',
  endodontist: 'Dental', periodontist: 'Dental', oral_surgeon: 'Dental',

  // Contractors — collapsed
  general_contractor: 'Contractor', contractor: 'Contractor',
  roofing_contractor: 'Contractor', plumber: 'Contractor', electrician: 'Contractor',
  painter: 'Contractor', carpenter: 'Contractor', locksmith: 'Contractor',
  flooring_contractor: 'Contractor', hvac_contractor: 'Contractor',
  landscaper: 'Contractor', landscaping: 'Contractor',
  home_builder: 'Contractor', construction_company: 'Contractor',
  moving_company: 'Contractor',

  // Auto
  car_dealer: 'Auto Dealer', car_repair: 'Auto Repair',
  car_wash: 'Auto Service', auto_parts_store: 'Auto Parts',

  // Food
  restaurant: 'Restaurant', cafe: 'Cafe', bakery: 'Bakery', bar: 'Bar',
  meal_takeaway: 'Restaurant', meal_delivery: 'Restaurant',
  fast_food_restaurant: 'Restaurant', coffee_shop: 'Cafe',

  // Medical / health
  doctor: 'Medical', hospital: 'Medical', physiotherapist: 'Medical',
  chiropractor: 'Medical', optometrist: 'Medical', pharmacy: 'Pharmacy',
  veterinary_care: 'Veterinary',

  // Beauty
  hair_care: 'Salon', beauty_salon: 'Salon', barber_shop: 'Salon',
  nail_salon: 'Salon', spa: 'Spa', gym: 'Fitness',

  // Professional services
  real_estate_agency: 'Real Estate', insurance_agency: 'Insurance',
  lawyer: 'Legal', accounting: 'Accounting', bank: 'Bank',

  // Retail
  clothing_store: 'Retail', furniture_store: 'Retail',
  hardware_store: 'Retail', jewelry_store: 'Retail',
  shoe_store: 'Retail', book_store: 'Retail',
  electronics_store: 'Retail', home_goods_store: 'Retail',

  pet_store: 'Pet', florist: 'Florist', travel_agency: 'Travel',
}

function cleanIndustry(raw: string | null | undefined): string {
  if (!raw) return '—'
  // If it already matches a curated label exactly, trust it (covers
  // values written by the new scraper like "Dental", "Contractor")
  if (Object.values(GOOGLE_TYPE_LABELS).includes(raw)) return raw
  // Single clean word with no comma/underscore — also trust
  if (!raw.includes(',') && !raw.includes('_')) return raw
  // Split a comma list and pick the first meaningful one
  const types = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  for (const t of types) {
    if (GOOGLE_TYPE_NOISE.has(t)) continue
    if (GOOGLE_TYPE_LABELS[t]) return GOOGLE_TYPE_LABELS[t]
    // Fallback: title-case the snake_case type
    return t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  return 'Other'
}

// Lead heat / temperature based on the AI qualification_score (0-100)
function scoreColor(score: number | null | undefined): { bg: string; text: string; label: string } {
  if (score == null) return { bg: 'bg-cell', text: 'text-dim', label: '—' }
  if (score >= 80) return { bg: 'bg-ok/20', text: 'text-ok', label: 'HOT' }
  if (score >= 60) return { bg: 'bg-warn/20', text: 'text-warn', label: 'WARM' }
  if (score >= 40) return { bg: 'bg-polar/15', text: 'text-polar', label: 'COOL' }
  return { bg: 'bg-cell', text: 'text-steel', label: 'COLD' }
}

const EMPTY_FORM = {
  name: '', industry: '', stage: 'New Lead' as string, deal_value: 0,
  notes: '', next_follow_up: '',
  // Contact + location
  phone: '', email: '', website: '', address: '',
  // Agent assignment
  agent_config_id: '' as string,
  // AI lead temperature
  qualification_score: null as number | null,
  qualification_reason: '' as string,
}

interface AgentConfigOption {
  id: string
  agent_name: string | null
  agent_type: string | null
}

type ViewMode = 'table' | 'pipeline'

export default function Outreach() {
  const { leads, refreshLeads } = useAppStore()
  const { confirm, ConfirmDialog } = useConfirm()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [sortKey, setSortKey] = useState<'name' | 'deal_value' | 'stage'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  // Lead agents: each one keeps its own list (GTH, Ideal Integration, ...)
  const { clients } = useAppStore()
  const leadAgents = useLeadAgents()
  const { agents } = leadAgents
  const dash = useAgentDashboard()
  const [settingsFor, setSettingsFor] = useState<LeadAgent | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workTab, setWorkTab] = useState<'leads' | 'drafts'>('leads')

  // 'manual' or an agent id; remembered between visits
  const [agentFilter, setAgentFilterState] = useState<string>(() => {
    try { return localStorage.getItem('gth_lead_agent') || '' } catch { return '' }
  })
  const setAgentFilter = (id: string) => {
    setAgentFilterState(id)
    setWorkTab('leads')
    try { localStorage.setItem('gth_lead_agent', id) } catch { /* private mode */ }
  }
  useEffect(() => {
    if (leadAgents.loading) return
    if (agentFilter === 'manual' || agents.some(a => a.id === agentFilter)) return
    setAgentFilterState(agents[0]?.id || 'manual')
  }, [agents, agentFilter, leadAgents.loading])

  const activeAgent = agents.find(a => a.id === agentFilter) || null
  const agentConfigs: AgentConfigOption[] = useMemo(
    () => agents.map(a => ({ id: a.id, agent_name: a.agent_name, agent_type: a.agent_type })),
    [agents],
  )

  const manualLeads = useMemo(
    () => leads.filter(l => !agents.some(a => leadBelongsTo(l, a))),
    [leads, agents],
  )

  const visibleLeads = useMemo(() => {
    if (agentFilter === 'manual') return manualLeads
    if (!activeAgent) return [] as OutreachLead[]
    return leads.filter(l => leadBelongsTo(l, activeAgent))
  }, [leads, agentFilter, activeAgent, manualLeads])

  // Drafts waiting, per agent
  const draftCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const q of dash.queue) {
      const lead = q.sequence?.lead
      const owner = agents.find(a => lead && (lead.agent_config_id ? lead.agent_config_id === a.id : false))
      if (owner) out[owner.id] = (out[owner.id] || 0) + 1
    }
    return out
  }, [dash.queue, agents])
  const agentQueue = useMemo(
    () => dash.queue.filter(q => activeAgent && q.sequence?.lead?.agent_config_id === activeAgent.id),
    [dash.queue, activeAgent],
  )

  // Client agents never send: copying a draft marks it handed over
  const copyDraft = useCallback(async (stepId: string) => {
    const item = dash.queue.find(q => q.id === stepId)
    if (!item) return
    const lead = item.sequence?.lead
    const text = `To: ${lead?.email || ''}\nSubject: ${item.subject || ''}\n\n${item.body || ''}`
    try { await navigator.clipboard.writeText(text) } catch { /* clipboard blocked */ }
    const { error } = await supabase.from('outreach_steps')
      .update({ status: 'approved', approval_status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', stepId)
    if (error) { showToast(error.message, 'error'); return }
    showToast(`Copied the email for ${lead?.name || 'this lead'}`, 'success')
    await dash.refresh()
  }, [dash])

  const runAgent = async (agent: LeadAgent) => {
    const ok = await leadAgents.run(agent)
    if (ok) await Promise.all([refreshLeads(), dash.refresh()])
  }

  const handleExportCsv = useCallback(() => {
    if (visibleLeads.length === 0) {
      showToast('No leads to export', 'warn')
      return
    }
    const baseName =
      agentFilter === 'manual' ? 'manual-leads'
      : `${activeAgent?.agent_name || 'agent'}-${activeAgent ? agentFor(activeAgent) : ''}`.replace(/\s+/g, '-').toLowerCase()
    const filename = downloadLeadsCsv(visibleLeads, baseName)
    showToast(`Exported ${visibleLeads.length} leads → ${filename}`, 'success')
  }, [visibleLeads, agentFilter, activeAgent])

  // Pipeline counts (filtered by agent)
  const pipeline = useMemo(() => {
    const result: Record<string, { count: number; value: number }> = {}
    STAGES.forEach(s => { result[s] = { count: 0, value: 0 } })
    visibleLeads.forEach(l => {
      const s = normalizeStage(l.stage)
      if (result[s]) {
        result[s].count++
        result[s].value += l.deal_value || 0
      }
    })
    return result
  }, [visibleLeads])

  // Total pipeline value for the summary bar
  const totalPipelineValue = useMemo(() => {
    return STAGES.reduce((sum, s) => sum + pipeline[s].value, 0)
  }, [pipeline])

  // Leads grouped by stage for kanban (filtered by agent + search)
  const leadsByStage = useMemo(() => {
    const result: Record<string, OutreachLead[]> = {}
    STAGES.forEach(s => { result[s] = [] })
    const q = debouncedSearch.trim().toLowerCase()
    visibleLeads.forEach(l => {
      const s = normalizeStage(l.stage)
      if (!result[s]) result[s] = []
      if (q) {
        const match =
          (l.name || '').toLowerCase().includes(q) ||
          (l.industry || '').toLowerCase().includes(q) ||
          (l.notes || '').toLowerCase().includes(q)
        if (!match) return
      }
      result[s].push(l)
    })
    return result
  }, [visibleLeads, debouncedSearch])

  // Filter + Sort (filtered by agent + search)
  const sorted = useMemo(() => {
    let list = [...visibleLeads]
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.industry || '').toLowerCase().includes(q) ||
        (l.notes || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortKey === 'deal_value') cmp = (a.deal_value || 0) - (b.deal_value || 0)
      else if (sortKey === 'stage') cmp = STAGES.indexOf(normalizeStage(a.stage) as Stage) - STAGES.indexOf(normalizeStage(b.stage) as Stage)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [visibleLeads, debouncedSearch, sortKey, sortDir])

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ChevronUp size={10} className="text-dim ml-1 inline" />
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-polar ml-1 inline" />
      : <ChevronDown size={10} className="text-polar ml-1 inline" />
  }

  const setLeadStage = async (lead: OutreachLead, next: string) => {
    if (next === lead.stage) return
    try {
      await outreach.update(lead.id, { stage: next })
      await refreshLeads()
      showToast(`${lead.name} moved to ${next}`, 'success')
    } catch (err: any) { showToast(err?.message || 'Failed to update stage', 'error') }
  }

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, agent_config_id: activeAgent?.id || '' })
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (lead: OutreachLead) => {
    setForm({
      name: lead.name || '',
      industry: cleanIndustry(lead.industry) === '—' ? '' : cleanIndustry(lead.industry),
      stage: lead.stage || 'New Lead',
      deal_value: lead.deal_value || 0,
      notes: lead.notes || '',
      next_follow_up: lead.next_follow_up || '',
      phone: (lead as any).phone || '',
      email: (lead as any).email || '',
      website: (lead as any).website || '',
      address: (lead as any).address || '',
      agent_config_id: (lead as any).agent_config_id || '',
      qualification_score: (lead as any).qualification_score ?? null,
      qualification_reason: (lead as any).qualification_reason || '',
    })
    setEditingId(lead.id)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Name is required', 'warn'); return }
    if (saving) return
    setSaving(true)
    try {
      // Resolve the selected agent (if any) so we can stamp agent_name + agent_type
      const selectedAgent = form.agent_config_id
        ? agentConfigs.find(a => a.id === form.agent_config_id)
        : null

      const data: Record<string, any> = {
        name: form.name.trim(),
        industry: form.industry || null,
        stage: form.stage,
        deal_value: Number(form.deal_value) || 0,
        notes: form.notes || null,
        next_follow_up: form.next_follow_up || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        agent_config_id: selectedAgent?.id || null,
        agent_name: selectedAgent?.agent_name || null,
        agent_type: selectedAgent?.agent_type || null,
        source: selectedAgent ? 'manual_assigned' : 'manual',
        qualification_score:
          form.qualification_score === null || form.qualification_score === undefined || (form.qualification_score as any) === ''
            ? null
            : Math.max(0, Math.min(100, Number(form.qualification_score))),
      }
      if (editingId) {
        await outreach.update(editingId, data)
        showToast('Lead updated', 'success')
      } else {
        await outreach.create(data)
        showToast('Lead created', 'success')
      }
      await refreshLeads()
      setModalOpen(false)
    } catch (err: any) {
      showToast(err?.message || 'Failed to save lead', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleFeedback = async (lead: OutreachLead, feedback: 'good' | 'bad', e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const existing = lead.enrichment_data || {}
      await supabase.from('outreach_leads').update({
        enrichment_data: { ...existing, user_feedback: feedback, feedback_at: new Date().toISOString() },
      }).eq('id', lead.id)
      await refreshLeads()
      showToast(feedback === 'good' ? 'Marked as good lead' : 'Marked as bad lead', 'success')
    } catch { showToast('Failed to save feedback', 'error') }
  }

  const handleDelete = async (lead: OutreachLead, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!await confirm('Delete Lead', `Delete "${lead.name}"? This cannot be undone.`)) return
    try {
      await outreach.delete(lead.id)
      await refreshLeads()
      showToast(`Deleted ${lead.name}`, 'success')
    } catch (err: any) { showToast(err?.message || 'Failed to delete', 'error') }
  }

  // Drag and drop handlers
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, leadId: string) => {
    setDraggedLeadId(leadId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', leadId)
    // Delay setting opacity so the drag image captures the card first
    requestAnimationFrame(() => {
      const el = document.getElementById(`lead-card-${leadId}`)
      if (el) el.style.opacity = '0.4'
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    if (draggedLeadId) {
      const el = document.getElementById(`lead-card-${draggedLeadId}`)
      if (el) el.style.opacity = '1'
    }
    setDraggedLeadId(null)
    setDragOverStage(null)
  }, [draggedLeadId])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, stage: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Only clear if leaving the column itself, not a child
    const related = e.relatedTarget as HTMLElement | null
    if (!related || !e.currentTarget.contains(related)) {
      setDragOverStage(null)
    }
  }, [])

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>, newStage: string) => {
    e.preventDefault()
    const leadId = e.dataTransfer.getData('text/plain')
    setDragOverStage(null)
    setDraggedLeadId(null)

    if (!leadId) return

    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.stage === newStage) return

    try {
      await outreach.update(leadId, { stage: newStage })
      await refreshLeads()
      showToast(`${lead.name} moved to ${newStage}`, 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to move lead', 'error')
    }
  }, [leads, refreshLeads])

  // Compute days since last contact
  const daysSinceContact = (lastContact: string | null | undefined): number | null => {
    if (!lastContact) return null
    try {
      return differenceInCalendarDays(new Date(), parseISO(lastContact))
    } catch {
      return null
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1>Leads &amp; Outreach</h1>
          <p className="text-dim mt-1" style={{ fontSize: '14px' }}>
            Each agent hunts for one business and keeps its own list.
          </p>
        </div>
      </div>

      <AgentDeck
        agents={agents}
        leads={leads}
        drafts={draftCounts}
        selected={agentFilter}
        onSelect={setAgentFilter}
        running={leadAgents.running}
        onRun={runAgent}
        onSettings={(a) => { setSettingsFor(a); setSettingsOpen(true) }}
        onNew={() => { setSettingsFor(null); setSettingsOpen(true) }}
        manualCount={manualLeads.length}
      />

      {/* Workspace for the selected agent */}
      <div className="la-workbar">
        <div className="min-w-0">
          <p className="la-work-title">
            {agentFilter === 'manual' ? 'Added by hand' : activeAgent ? `${activeAgent.agent_name} · ${agentFor(activeAgent)}` : 'Leads'}
          </p>
          <p className="text-dim" style={{ fontSize: '12.5px' }}>
            {visibleLeads.length} lead{visibleLeads.length === 1 ? '' : 's'}
            {activeAgent?.last_run_summary ? ` · Last run: ${activeAgent.last_run_summary}` : ''}
          </p>
        </div>
        {activeAgent && (
          <div className="tabbar la-tabs" role="tablist" style={{ marginBottom: 0 }}>
            <button role="tab" aria-selected={workTab === 'leads'} className={`tabbar-tab ${workTab === 'leads' ? 'la-tab--on' : ''}`} onClick={() => setWorkTab('leads')}>Leads</button>
            <button role="tab" aria-selected={workTab === 'drafts'} className={`tabbar-tab ${workTab === 'drafts' ? 'la-tab--on' : ''}`} onClick={() => useAppStore.getState().setCurrentPage('agents')} title="Read and send this agent's emails in AI Agents">
              Emails to send{agentQueue.length ? ` (${agentQueue.length})` : ''} ↗
            </button>
          </div>
        )}
      </div>

      {workTab === 'leads' && (
        <div className="flex items-center gap-3 flex-wrap mb-6">
          {/* View Toggle */}
          <div className="flex border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                viewMode === 'table'
                  ? 'bg-polar text-obsidian'
                  : 'bg-transparent text-dim hover:text-polar'
              }`}
              style={{ fontSize: '13px' }}
            >
              <List size={13} />
              Table
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-border ${
                viewMode === 'pipeline'
                  ? 'bg-polar text-obsidian'
                  : 'bg-transparent text-dim hover:text-polar'
              }`}
              style={{ fontSize: '13px' }}
            >
              <Columns3 size={13} />
              Pipeline
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search leads..."
              aria-label="Search leads"
              className="bg-cell border border-border text-polar pl-8 pr-3 py-1.5 font-sans outline-none focus:border-dim transition-colors w-full md:w-[200px]"
              style={{ fontSize: '13px' }}
            />
          </div>
          <button
            onClick={handleExportCsv}
            disabled={visibleLeads.length === 0}
            className="btn-ghost flex items-center gap-2"
            title={agentFilter === 'all' ? 'Export all leads to CSV' : `Export ${agentFilter} leads to CSV`}
            style={{ opacity: visibleLeads.length === 0 ? 0.4 : 1 }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Add Lead
          </button>
        </div>
      )}

      {workTab === 'drafts' && activeAgent && (
        <section className="mb-10" aria-label="Drafts waiting">
          <p className="text-dim mb-4" style={{ fontSize: '13px' }}>
            {isExportAgent(activeAgent)
              ? `Drafts for ${agentFor(activeAgent)}. Copy hands the email over; nothing is sent from your Gmail.`
              : 'Approve sends it from your Gmail right away. Skip drops the lead from the sequence.'}
          </p>
          <div>
            <ApprovalQueue
              queue={agentQueue}
              loading={dash.loading}
              isRunning={leadAgents.running.has(activeAgent.id)}
              onApprove={isExportAgent(activeAgent) ? copyDraft : dash.approveStep}
              onSkip={dash.skipStep}
              onSave={dash.updateStepContent}
              onRun={() => runAgent(activeAgent)}
              approveLabel={isExportAgent(activeAgent) ? 'Copy email' : undefined}
            />
          </div>
        </section>
      )}

      {workTab === 'leads' && (<>
      {/* Pipeline Summary Bar */}
      {totalPipelineValue > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <p className="label">Pipeline Value Distribution</p>
            <p className="mono text-dim" style={{ fontSize: '13px' }}>{formatCurrency(totalPipelineValue)}</p>
          </div>
          <div className="flex w-full h-3 overflow-hidden border border-border">
            {STAGES.map(stage => {
              const pct = totalPipelineValue > 0 ? (pipeline[stage].value / totalPipelineValue) * 100 : 0
              if (pct === 0) return null
              return (
                <div
                  key={stage}
                  title={`${stage}: ${formatCurrency(pipeline[stage].value)} (${pct.toFixed(1)}%)`}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: STAGE_COLORS[stage],
                    minWidth: pct > 0 ? '2px' : 0,
                    transition: 'width 0.3s ease',
                  }}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {STAGES.map(stage => {
              if (pipeline[stage].value === 0) return null
              return (
                <div key={stage} className="flex items-center gap-1.5" style={{ fontSize: '11.5px' }}>
                  <div style={{ width: 8, height: 8, backgroundColor: STAGE_COLORS[stage] }} />
                  <span className="text-dim">{stage}</span>
                  <span className="mono text-steel">{formatCurrency(pipeline[stage].value)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pipeline Stage Summary Cards (only in table view) */}
      {viewMode === 'table' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {STAGES.map(stage => (
            <div
              key={stage}
              className="stat-card hover:translate-y-[-1px] transition-all duration-200"
              style={{ boxShadow: `inset 0 2px 0 ${STAGE_COLORS[stage]}, inset 0 1px 0 var(--edge-hi), var(--shadow-plate)` }}
            >
              <p className="label">{stage}</p>
              <p className="text-polar font-[800]" style={{ fontSize: '21.5px' }}>{pipeline[stage].count}</p>
              <p className="mono text-dim" style={{ fontSize: '13px' }}>{formatCurrency(pipeline[stage].value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <>
          {sorted.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No leads yet"
              description="Add your first outreach lead to start building your pipeline."
              actionLabel="+ Add Lead"
              onAction={openCreate}
            />
          ) : (
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[1200px]" style={{ fontSize: '14px' }}>
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="label px-4 py-3 cursor-pointer" onClick={() => handleSort('name')}>
                      Business <SortIcon col="name" />
                    </th>
                    <th className="label px-4 py-3">Agent</th>
                    <th className="label px-4 py-3" title="AI lead temperature score (0-100)">Score</th>
                    <th className="label px-4 py-3">Industry</th>
                    <th className="label px-4 py-3">Phone</th>
                    <th className="label px-4 py-3">Email</th>
                    <th className="label px-4 py-3">Website</th>
                    <th className="label px-4 py-3 cursor-pointer" onClick={() => handleSort('stage')}>
                      Stage <SortIcon col="stage" />
                    </th>
                    <th className="label px-4 py-3 cursor-pointer text-right" onClick={() => handleSort('deal_value')}>
                      Deal Value <SortIcon col="deal_value" />
                    </th>
                    <th className="label px-4 py-3 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(lead => (
                    <tr
                      key={lead.id}
                      className="table-row cursor-pointer"
                      onClick={() => openEdit(lead)}
                    >
                      <td className="px-4 py-3 text-polar font-semibold">
                        <div className="flex flex-col">
                          <span>{lead.name}</span>
                          {lead.contact_name && (
                            <span className="text-blue-400 font-normal" style={{ fontSize: '11.5px' }}>
                              {lead.contact_name}{lead.enrichment_data?.decision_makers?.[0]?.title ? ` — ${lead.enrichment_data.decision_makers[0].title}` : ''}
                            </span>
                          )}
                          {lead.address && (
                            <span className="text-dim font-normal" style={{ fontSize: '11.5px' }}>
                              {lead.address}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.agent_name ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-polar/10 text-polar" style={{ fontSize: '11.5px' }}>
                            <Bot size={10} />
                            {lead.agent_name}
                          </span>
                        ) : (
                          <span className="text-dim" style={{ fontSize: '11.5px' }}>Manual</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const c = scoreColor(lead.qualification_score)
                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${c.bg} ${c.text}`}
                              style={{ fontSize: '11.5px', fontWeight: 700, lineHeight: 1.4 }}
                              title={lead.qualification_score != null ? `AI score: ${lead.qualification_score}/100` : 'Not yet scored — run agent to qualify'}
                            >
                              {lead.qualification_score != null ? (
                                <>
                                  <span className="mono">{lead.qualification_score}</span>
                                  <span style={{ fontSize: '9.5px' }}>{c.label}</span>
                                </>
                              ) : (
                                <span className="text-dim">—</span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-steel">{cleanIndustry(lead.industry)}</td>
                      <td className="px-4 py-3 mono text-steel" onClick={(e) => e.stopPropagation()}>
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="hover:text-polar transition-colors">
                            {lead.phone}
                          </a>
                        ) : (
                          <span className="text-dim">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-steel" onClick={(e) => e.stopPropagation()}>
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} className="hover:text-polar transition-colors truncate block" style={{ maxWidth: '180px' }}>
                            {lead.email}
                          </a>
                        ) : (
                          <span className="text-dim" style={{ fontSize: '11.5px' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-steel" onClick={(e) => e.stopPropagation()}>
                        {lead.website ? (
                          <a
                            href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-polar transition-colors truncate block"
                            style={{ maxWidth: '180px' }}
                          >
                            {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        ) : (
                          <span className="text-dim">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusMenu
                          label={`${lead.name} stage`}
                          value={normalizeStage(lead.stage)}
                          options={STAGE_OPTIONS}
                          onChange={(v) => setLeadStage(lead, v)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right mono text-steel">{formatCurrency(lead.deal_value)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleFeedback(lead, 'good', e)}
                            className={`p-1 rounded transition-colors cursor-pointer ${
                              lead.enrichment_data?.user_feedback === 'good'
                                ? 'text-green-400 bg-green-500/20'
                                : 'text-dim hover:text-green-400'
                            }`}
                            title="Good lead"
                          >
                            <ThumbsUp size={12} />
                          </button>
                          <button
                            onClick={(e) => handleFeedback(lead, 'bad', e)}
                            className={`p-1 rounded transition-colors cursor-pointer ${
                              lead.enrichment_data?.user_feedback === 'bad'
                                ? 'text-red-400 bg-red-500/20'
                                : 'text-dim hover:text-red-400'
                            }`}
                            title="Bad lead"
                          >
                            <ThumbsDown size={12} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(lead, e)}
                            className="p-1 text-dim hover:text-err transition-colors cursor-pointer"
                            aria-label="Delete lead"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* PIPELINE / KANBAN VIEW */}
      {viewMode === 'pipeline' && (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
          {STAGES.map(stage => {
            const stageLeads = leadsByStage[stage] || []
            const stageValue = stageLeads.reduce((sum, l) => sum + (l.deal_value || 0), 0)
            const isClosedLost = stage === 'Closed Lost'
            const isDropTarget = dragOverStage === stage
            const color = STAGE_COLORS[stage]

            return (
              <div
                key={stage}
                className={`flex flex-col flex-shrink-0 transition-all duration-200 ${
                  isClosedLost && stageLeads.length === 0 ? 'w-[140px]' : 'w-[260px]'
                }`}
                style={{
                  opacity: isClosedLost ? 0.7 : 1,
                }}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
              >
                {/* Column Header */}
                <div
                  className="px-3 py-2.5 mb-2 border border-border"
                  style={{
                    borderTop: `3px solid ${color}`,
                    backgroundColor: isDropTarget ? `${color}15` : 'transparent',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-polar font-semibold" style={{ fontSize: '13px' }}>{stage}</span>
                    <span
                      className="mono text-dim"
                      style={{
                        fontSize: '11.5px',
                        backgroundColor: `${color}25`,
                        color: color,
                        padding: '1px 6px',
                        fontWeight: 700,
                      }}
                    >
                      {stageLeads.length}
                    </span>
                  </div>
                  <p className="mono text-dim mt-0.5" style={{ fontSize: '11.5px' }}>{formatCurrency(stageValue)}</p>
                </div>

                {/* Drop Zone / Cards Area */}
                <div
                  className="flex-1 flex flex-col gap-2 p-1 border border-transparent transition-colors duration-150 overflow-y-auto"
                  style={{
                    borderColor: isDropTarget ? color : 'transparent',
                    backgroundColor: isDropTarget ? `${color}08` : 'transparent',
                    maxHeight: 'calc(60vh - 60px)',
                  }}
                >
                  {stageLeads.map(lead => {
                    const days = daysSinceContact(lead.last_contact)
                    const followUpOverdue = lead.next_follow_up ? isOverdue(lead.next_follow_up) : false

                    return (
                      <div
                        key={lead.id}
                        id={`lead-card-${lead.id}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => openEdit(lead)}
                        className="border border-border p-3 cursor-grab active:cursor-grabbing hover:border-steel transition-all duration-150"
                        style={{
                          backgroundColor: draggedLeadId === lead.id ? 'transparent' : 'var(--color-cell, #111)',
                        }}
                      >
                        {/* Card: Name + Deal Value row */}
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-polar font-semibold truncate" style={{ fontSize: '14px' }}>
                            {lead.name}
                          </p>
                          <p className="mono text-steel flex-shrink-0" style={{ fontSize: '13px' }}>
                            {formatCurrency(lead.deal_value)}
                          </p>
                        </div>

                        {/* Industry + Agent badges */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {lead.industry && (
                            <span
                              className="inline-block text-dim border border-border px-1.5 py-0.5"
                              style={{ fontSize: '10.5px' }}
                            >
                              {cleanIndustry(lead.industry)}
                            </span>
                          )}
                          {lead.agent_name && (
                            <span
                              className="inline-flex items-center gap-1 text-polar bg-polar/10 px-1.5 py-0.5 rounded"
                              style={{ fontSize: '10.5px' }}
                            >
                              <Bot size={9} />
                              {lead.agent_name}
                            </span>
                          )}
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center justify-between mt-2 gap-2">
                          {/* Days since last contact */}
                          {days !== null && (
                            <span className="text-dim" style={{ fontSize: '10.5px' }}>
                              {days === 0 ? 'Today' : `${days}d ago`}
                            </span>
                          )}

                          {/* Next follow-up */}
                          {lead.next_follow_up && (
                            <span
                              className={`mono flex items-center gap-0.5 ${followUpOverdue ? 'text-warn' : 'text-dim'}`}
                              style={{ fontSize: '10.5px' }}
                            >
                              {followUpOverdue && <AlertTriangle size={8} />}
                              {friendlyDate(lead.next_follow_up)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {stageLeads.length === 0 && (
                    <div
                      className="flex items-center justify-center text-dim border border-dashed border-border p-4"
                      style={{ fontSize: '11.5px', minHeight: '60px' }}
                    >
                      {isDropTarget ? 'Drop here' : 'No leads'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      </>)}

      <AgentSettingsModal
        open={settingsOpen}
        agent={settingsFor}
        clients={clients}
        leadCount={settingsFor ? leads.filter(l => leadBelongsTo(l, settingsFor)).length : 0}
        onClose={() => setSettingsOpen(false)}
        onSave={leadAgents.save}
        onDelete={leadAgents.remove}
        onPauseToggle={leadAgents.setEnabled}
      />

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Lead' : 'Add Lead'}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="label mb-1">Business Name *</p>
            <input
              className="input w-full"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Business name"
            />
          </div>

          {/* Agent assignment — needed so the lead shows up under that agent's CSV export */}
          <div>
            <p className="label mb-1">Assign to Agent</p>
            <select
              className="input w-full"
              value={form.agent_config_id}
              onChange={e => setForm(f => ({ ...f, agent_config_id: e.target.value }))}
            >
              <option value="">— None (manual lead) —</option>
              {agentConfigs.map(a => (
                <option key={a.id} value={a.id}>
                  {a.agent_name || `(unnamed ${a.agent_type || 'agent'})`}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label mb-1">Phone</p>
              <input
                className="input w-full"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="780-555-0101"
              />
            </div>
            <div>
              <p className="label mb-1">Email</p>
              <input
                className="input w-full"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="contact@example.com"
              />
            </div>
          </div>

          <div>
            <p className="label mb-1">Website</p>
            <input
              className="input w-full"
              value={form.website}
              onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <p className="label mb-1">Address</p>
            <input
              className="input w-full"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="123 Main St, Edmonton, AB"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label mb-1">Industry</p>
              <input
                className="input w-full"
                list="industry-suggestions"
                value={form.industry}
                onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                placeholder="Dental, Contractor, Cafe..."
              />
              <datalist id="industry-suggestions">
                {INDUSTRIES.map(i => <option key={i} value={i} />)}
              </datalist>
            </div>
            <div>
              <p className="label mb-1">Stage</p>
              <select
                className="input w-full"
                value={form.stage}
                onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
              >
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* AI Lead Temperature — read-only badge with manual override */}
          <div>
            <p className="label mb-1">AI Lead Score</p>
            <div className="flex items-center gap-3">
              {(() => {
                const c = scoreColor(form.qualification_score)
                return (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded ${c.bg} ${c.text}`}>
                    {form.qualification_score != null ? (
                      <>
                        <span className="mono font-semibold">{form.qualification_score}</span>
                        <span style={{ fontSize: '10.5px' }}>{c.label}</span>
                      </>
                    ) : (
                      <span className="text-dim">Not yet scored</span>
                    )}
                  </span>
                )
              })()}
              <input
                type="number"
                min={0}
                max={100}
                className="input"
                style={{ width: '90px' }}
                value={form.qualification_score ?? ''}
                onChange={e => {
                  const v = e.target.value
                  setForm(f => ({ ...f, qualification_score: v === '' ? null : Number(v) }))
                }}
                placeholder="0-100"
              />
              <span className="text-dim text-xs">override</span>
            </div>
            {form.qualification_reason && (
              <p className="text-dim text-xs mt-1.5 italic">{form.qualification_reason}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label mb-1">Deal Value ($)</p>
              <input
                type="number"
                className="input w-full"
                value={form.deal_value}
                onChange={e => setForm(f => ({ ...f, deal_value: Number(e.target.value) }))}
              />
            </div>
            <div>
              <p className="label mb-1">Next Follow-Up</p>
              <input
                type="date"
                className="input w-full"
                value={form.next_follow_up}
                onChange={e => setForm(f => ({ ...f, next_follow_up: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <p className="label mb-1">Notes</p>
            <VoiceTextarea
              className="input w-full"
              rows={3}
              value={form.notes}
              onChange={(val) => setForm(f => ({ ...f, notes: val }))}
              placeholder="Notes about this lead..."
            />
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <button onClick={() => setModalOpen(false)} className="btn-ghost">Cancel</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving || !form.name.trim()} style={{ opacity: (saving || !form.name.trim()) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
      {ConfirmDialog}
    </div>
  )
}
