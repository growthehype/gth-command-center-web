import { useState, useMemo } from 'react'
import { Target, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { useAppStore, OutreachLead } from '@/lib/store'
import { outreach } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import VoiceTextarea from '@/components/ui/VoiceTextarea'
import { formatCurrency, relativeDate, friendlyDate } from '@/lib/utils'

const STAGES = ['New Lead', 'Contacted', 'Responded', 'Meeting Set', 'Closed Won'] as const
type Stage = (typeof STAGES)[number]

const STAGE_BADGE: Record<string, string> = {
  'New Lead': 'badge badge-neutral',
  'Contacted': 'badge badge-warn',
  'Responded': 'badge badge-polar',
  'Meeting Set': 'badge badge-ok',
  'Closed Won': 'badge badge-ok',
}

const INDUSTRIES = [
  'Automotive', 'Healthcare', 'Real Estate', 'Restaurant', 'Retail',
  'Legal', 'Finance', 'Construction', 'Technology', 'Other',
]

const EMPTY_FORM = {
  name: '', industry: '', stage: 'New Lead' as string, deal_value: 0,
  notes: '', next_follow_up: '',
}

export default function Outreach() {
  const { leads, refreshLeads } = useAppStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'name' | 'deal_value' | 'stage'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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

  // Sort
  const sorted = useMemo(() => {
    const list = [...leads]
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortKey === 'deal_value') cmp = (a.deal_value || 0) - (b.deal_value || 0)
      else if (sortKey === 'stage') cmp = STAGES.indexOf(a.stage as Stage) - STAGES.indexOf(b.stage as Stage)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [leads, sortKey, sortDir])

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
    } catch { showToast('Failed to update stage', 'error') }
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
    } catch { showToast('Failed to save lead', 'error') }
  }

  const handleDelete = async (lead: OutreachLead, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await outreach.delete(lead.id)
      await refreshLeads()
      showToast(`Deleted ${lead.name}`, 'success')
    } catch { showToast('Failed to delete', 'error') }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Outreach Pipeline</h1>
          <p className="text-dim mt-1" style={{ fontSize: '13px' }}>{leads.length} leads in pipeline</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={14} /> Add Lead
        </button>
      </div>

      {/* Pipeline Stage Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {STAGES.map(stage => (
          <div key={stage} className="stat-card">
            <p className="label">{stage}</p>
            <p className="text-polar font-[800]" style={{ fontSize: '20px' }}>{pipeline[stage].count}</p>
            <p className="mono text-dim" style={{ fontSize: '12px' }}>{formatCurrency(pipeline[stage].value)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
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
                  <td className="px-4 py-3 text-dim">{friendlyDate(lead.next_follow_up)}</td>
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
            <button onClick={handleSave} className="btn-primary">
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
