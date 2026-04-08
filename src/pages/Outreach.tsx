import { useState, useMemo, useCallback, DragEvent } from 'react'
import { Target, Plus, Trash2, ChevronUp, ChevronDown, Search, AlertTriangle, Clock, List, Columns3 } from 'lucide-react'
import { useAppStore, OutreachLead } from '@/lib/store'
import { outreach } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import VoiceTextarea from '@/components/ui/VoiceTextarea'
import { formatCurrency, relativeDate, friendlyDate, isOverdue } from '@/lib/utils'
import { isToday, parseISO, differenceInCalendarDays } from 'date-fns'

const STAGES = ['New Lead', 'Contacted', 'Responded', 'Meeting Set', 'Closed Won', 'Closed Lost'] as const
type Stage = (typeof STAGES)[number]

const STAGE_BADGE: Record<string, string> = {
  'New Lead': 'badge badge-neutral',
  'Contacted': 'badge badge-warn',
  'Responded': 'badge badge-polar',
  'Meeting Set': 'badge badge-ok',
  'Closed Won': 'badge badge-ok',
  'Closed Lost': 'badge badge-err',
}

const STAGE_COLORS: Record<string, string> = {
  'New Lead': '#5E81AC',
  'Contacted': '#EBCB8B',
  'Responded': '#B48EAD',
  'Meeting Set': '#A3BE8C',
  'Closed Won': '#8FBC5E',
  'Closed Lost': '#BF616A',
}

const INDUSTRIES = [
  'Automotive', 'Healthcare', 'Real Estate', 'Restaurant', 'Retail',
  'Legal', 'Finance', 'Construction', 'Technology', 'Other',
]

const EMPTY_FORM = {
  name: '', industry: '', stage: 'New Lead' as string, deal_value: 0,
  notes: '', next_follow_up: '',
}

type ViewMode = 'table' | 'pipeline'

export default function Outreach() {
  const { leads, refreshLeads } = useAppStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'deal_value' | 'stage'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  // Pipeline counts
  const pipeline = useMemo(() => {
    const result: Record<string, { count: number; value: number }> = {}
    STAGES.forEach(s => { result[s] = { count: 0, value: 0 } })
    leads.forEach(l => {
      const s = l.stage || 'New Lead'
      if (result[s]) {
        result[s].count++
        result[s].value += l.deal_value || 0
      }
    })
    return result
  }, [leads])

  // Total pipeline value for the summary bar
  const totalPipelineValue = useMemo(() => {
    return STAGES.reduce((sum, s) => sum + pipeline[s].value, 0)
  }, [pipeline])

  // Leads grouped by stage for kanban
  const leadsByStage = useMemo(() => {
    const result: Record<string, OutreachLead[]> = {}
    STAGES.forEach(s => { result[s] = [] })
    const q = search.trim().toLowerCase()
    leads.forEach(l => {
      const s = (l.stage || 'New Lead') as string
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
  }, [leads, search])

  // Filter + Sort
  const sorted = useMemo(() => {
    let list = [...leads]
    if (search.trim()) {
      const q = search.toLowerCase()
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
      else if (sortKey === 'stage') cmp = STAGES.indexOf(a.stage as Stage) - STAGES.indexOf(b.stage as Stage)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [leads, search, sortKey, sortDir])

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

  const cycleStage = async (lead: OutreachLead, e: React.MouseEvent) => {
    e.stopPropagation()
    const idx = STAGES.indexOf(lead.stage as Stage)
    const next = STAGES[(idx + 1) % STAGES.length]
    try {
      await outreach.update(lead.id, { stage: next })
      await refreshLeads()
      showToast(`${lead.name} -> ${next}`, 'success')
    } catch (err: any) { console.error('Outreach stage update failed:', err); showToast(err?.message || 'Failed to update stage', 'error') }
  }

  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (lead: OutreachLead) => {
    setForm({
      name: lead.name || '',
      industry: lead.industry || '',
      stage: lead.stage || 'New Lead',
      deal_value: lead.deal_value || 0,
      notes: lead.notes || '',
      next_follow_up: lead.next_follow_up || '',
    })
    setEditingId(lead.id)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Name is required', 'warn'); return }
    if (saving) return
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        industry: form.industry || null,
        stage: form.stage,
        deal_value: Number(form.deal_value) || 0,
        notes: form.notes || null,
        next_follow_up: form.next_follow_up || null,
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
      console.error('Outreach save failed:', err)
      showToast(err?.message || 'Failed to save lead', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (lead: OutreachLead, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${lead.name}"? This cannot be undone.`)) return
    try {
      await outreach.delete(lead.id)
      await refreshLeads()
      showToast(`Deleted ${lead.name}`, 'success')
    } catch (err: any) { console.error('Outreach delete failed:', err); showToast(err?.message || 'Failed to delete', 'error') }
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
      console.error('Outreach stage update failed:', err)
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1>Outreach Pipeline</h1>
            <Target size={14} className="text-dim" />
          </div>
          <p className="text-dim mt-1" style={{ fontSize: '13px' }}>{leads.length} leads in pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                viewMode === 'table'
                  ? 'bg-polar text-obsidian'
                  : 'bg-transparent text-dim hover:text-polar'
              }`}
              style={{ fontSize: '12px' }}
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
              style={{ fontSize: '12px' }}
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
              className="bg-cell border border-border text-polar pl-8 pr-3 py-1.5 font-sans outline-none focus:border-dim transition-colors w-full md:w-[200px]"
              style={{ fontSize: '12px' }}
            />
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Add Lead
          </button>
        </div>
      </div>

      {/* Pipeline Summary Bar */}
      {totalPipelineValue > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <p className="label">Pipeline Value Distribution</p>
            <p className="mono text-dim" style={{ fontSize: '12px' }}>{formatCurrency(totalPipelineValue)}</p>
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
                <div key={stage} className="flex items-center gap-1.5" style={{ fontSize: '11px' }}>
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
              style={{ borderLeft: `4px solid ${STAGE_COLORS[stage]}` }}
            >
              <p className="label">{stage}</p>
              <p className="text-polar font-[800]" style={{ fontSize: '20px' }}>{pipeline[stage].count}</p>
              <p className="mono text-dim" style={{ fontSize: '12px' }}>{formatCurrency(pipeline[stage].value)}</p>
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
              <table className="w-full min-w-[700px]" style={{ fontSize: '13px' }}>
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="label px-4 py-3 cursor-pointer" onClick={() => handleSort('name')}>
                      Business <SortIcon col="name" />
                    </th>
                    <th className="label px-4 py-3">Industry</th>
                    <th className="label px-4 py-3 cursor-pointer" onClick={() => handleSort('stage')}>
                      Stage <SortIcon col="stage" />
                    </th>
                    <th className="label px-4 py-3 cursor-pointer text-right" onClick={() => handleSort('deal_value')}>
                      Deal Value <SortIcon col="deal_value" />
                    </th>
                    <th className="label px-4 py-3">Last Contact</th>
                    <th className="label px-4 py-3">Next Follow-Up</th>
                    <th className="label px-4 py-3">Notes</th>
                    <th className="label px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(lead => (
                    <tr
                      key={lead.id}
                      className="table-row cursor-pointer"
                      onClick={() => openEdit(lead)}
                    >
                      <td className="px-4 py-3 text-polar font-semibold">{lead.name}</td>
                      <td className="px-4 py-3 text-steel">{lead.industry || '-'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => cycleStage(lead, e)}
                          className={STAGE_BADGE[lead.stage] || 'badge badge-neutral'}
                        >
                          {lead.stage}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right mono text-steel">{formatCurrency(lead.deal_value)}</td>
                      <td className="px-4 py-3 text-dim">{relativeDate(lead.last_contact)}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          if (!lead.next_follow_up) return <span className="text-dim">-</span>
                          const overdue = isOverdue(lead.next_follow_up)
                          let today = false
                          let dueSoon = false
                          try {
                            today = isToday(parseISO(lead.next_follow_up))
                            if (!overdue && !today) {
                              const diff = differenceInCalendarDays(parseISO(lead.next_follow_up), new Date())
                              dueSoon = diff >= 0 && diff <= 2
                            }
                          } catch { /* skip */ }
                          return (
                            <span className={`mono flex items-center gap-1.5 ${overdue ? 'text-err' : (today || dueSoon) ? 'text-warn' : 'text-dim'}`}>
                              {friendlyDate(lead.next_follow_up)}
                              {overdue && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-err/15 text-err px-1.5 py-0.5" style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1 }}>
                                  <AlertTriangle size={8} />
                                  OVERDUE
                                </span>
                              )}
                              {today && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-warn/15 text-warn px-1.5 py-0.5" style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1 }}>
                                  <Clock size={8} />
                                  TODAY
                                </span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-dim" style={{ maxWidth: '160px' }}>
                        <span className="truncate block">{lead.notes || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => handleDelete(lead, e)}
                          className="text-dim hover:text-err transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
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
                    <span className="text-polar font-semibold" style={{ fontSize: '12px' }}>{stage}</span>
                    <span
                      className="mono text-dim"
                      style={{
                        fontSize: '11px',
                        backgroundColor: `${color}25`,
                        color: color,
                        padding: '1px 6px',
                        fontWeight: 700,
                      }}
                    >
                      {stageLeads.length}
                    </span>
                  </div>
                  <p className="mono text-dim mt-0.5" style={{ fontSize: '11px' }}>{formatCurrency(stageValue)}</p>
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
                          <p className="text-polar font-semibold truncate" style={{ fontSize: '13px' }}>
                            {lead.name}
                          </p>
                          <p className="mono text-steel flex-shrink-0" style={{ fontSize: '12px' }}>
                            {formatCurrency(lead.deal_value)}
                          </p>
                        </div>

                        {/* Industry badge */}
                        {lead.industry && (
                          <span
                            className="inline-block mt-1.5 text-dim border border-border px-1.5 py-0.5"
                            style={{ fontSize: '10px' }}
                          >
                            {lead.industry}
                          </span>
                        )}

                        {/* Meta row */}
                        <div className="flex items-center justify-between mt-2 gap-2">
                          {/* Days since last contact */}
                          {days !== null && (
                            <span className="text-dim" style={{ fontSize: '10px' }}>
                              {days === 0 ? 'Today' : `${days}d ago`}
                            </span>
                          )}

                          {/* Next follow-up */}
                          {lead.next_follow_up && (
                            <span
                              className={`mono flex items-center gap-0.5 ${followUpOverdue ? 'text-warn' : 'text-dim'}`}
                              style={{ fontSize: '10px' }}
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
                      style={{ fontSize: '11px', minHeight: '60px' }}
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
          <div>
            <p className="label mb-1">Industry</p>
            <select
              className="input w-full"
              value={form.industry}
              onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
            >
              <option value="">Select industry</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
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
    </div>
  )
}
