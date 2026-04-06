import { useState, useMemo, useEffect } from 'react'
import { Calendar, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns'
import { useAppStore, MeetingNote } from '@/lib/store'
import { meetings as meetingsApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { formatDate, safeParseJSON } from '@/lib/utils'

const TYPES = ['discovery', 'check-in', 'strategy', 'review', 'kickoff', 'other'] as const
type MeetingType = (typeof TYPES)[number]

const TYPE_BADGE: Record<string, string> = {
  discovery: 'badge badge-polar',
  'check-in': 'badge badge-ok',
  strategy: 'badge badge-warn',
  review: 'badge badge-neutral',
  kickoff: 'badge badge-err',
  other: 'badge badge-neutral',
}

const EMPTY_FORM = {
  date: '', client_id: '', contact_id: '', title: '', type: 'check-in' as string,
  attendees: '', notes: '', action_items: [''] as string[],
}

interface WeekGroup {
  label: string
  key: string
  meetings: MeetingNote[]
}

export default function Meetings() {
  const { meetings, clients, contacts, refreshMeetings } = useAppStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filterClient, setFilterClient] = useState('')
  const [filterType, setFilterType] = useState('')
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(new Set())

  // Filter
  const filtered = useMemo(() => {
    let list = [...meetings]
    if (filterClient) list = list.filter(m => m.client_id === filterClient)
    if (filterType) list = list.filter(m => m.type === filterType)
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return list
  }, [meetings, filterClient, filterType])

  // Group by week
  const weekGroups = useMemo(() => {
    const groups: Record<string, MeetingNote[]> = {}
    const keys: string[] = []

    filtered.forEach(m => {
      if (!m.date) return
      try {
        const d = parseISO(m.date)
        const ws = startOfWeek(d, { weekStartsOn: 1 })
        const we = endOfWeek(d, { weekStartsOn: 1 })
        const key = format(ws, 'yyyy-MM-dd')
        if (!groups[key]) {
          groups[key] = []
          keys.push(key)
        }
        groups[key].push(m)
      } catch { /* skip invalid dates */ }
    })

    return keys.map(key => {
      const ws = parseISO(key)
      const we = endOfWeek(ws, { weekStartsOn: 1 })
      return {
        key,
        label: `${format(ws, 'MMM d')} - ${format(we, 'MMM d, yyyy')}`,
        meetings: groups[key],
      } as WeekGroup
    })
  }, [filtered])

  const toggleWeek = (key: string) => {
    setCollapsedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, date: format(new Date(), 'yyyy-MM-dd') })
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (meeting: MeetingNote) => {
    const actionItems = safeParseJSON<string[]>(meeting.action_items, [])
    setForm({
      date: meeting.date || '',
      client_id: meeting.client_id || '',
      contact_id: meeting.contact_id || '',
      title: meeting.title || '',
      type: meeting.type || 'check-in',
      attendees: meeting.attendees || '',
      notes: meeting.notes || '',
      action_items: actionItems.length > 0 ? actionItems : [''],
    })
    setEditingId(meeting.id)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) { showToast('Title is required', 'warn'); return }
    if (!form.date) { showToast('Date is required', 'warn'); return }
    try {
      const cleanActions = form.action_items.filter(a => a.trim())
      const data = {
        date: form.date,
        client_id: form.client_id || null,
        contact_id: form.contact_id || null,
        title: form.title.trim(),
        type: form.type,
        attendees: form.attendees || null,
        notes: form.notes || null,
        action_items: cleanActions.length > 0 ? JSON.stringify(cleanActions) : null,
      }
      if (editingId) {
        await meetingsApi.update(editingId, data)
        showToast('Meeting updated', 'success')
      } else {
        await meetingsApi.create(data)
        showToast('Meeting created', 'success')
      }
      await refreshMeetings()
      setModalOpen(false)
    } catch { showToast('Failed to save meeting', 'error') }
  }

  const handleDelete = async (meeting: MeetingNote, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await meetingsApi.delete(meeting.id)
      await refreshMeetings()
      showToast('Meeting deleted', 'success')
    } catch { showToast('Failed to delete', 'error') }
  }

  const addActionItem = () => {
    setForm(f => ({ ...f, action_items: [...f.action_items, ''] }))
  }

  const updateActionItem = (idx: number, val: string) => {
    setForm(f => {
      const items = [...f.action_items]
      items[idx] = val
      return { ...f, action_items: items }
    })
  }

  const removeActionItem = (idx: number) => {
    setForm(f => {
      const items = f.action_items.filter((_, i) => i !== idx)
      return { ...f, action_items: items.length > 0 ? items : [''] }
    })
  }

  // Contacts for selected client
  const clientContacts = useMemo(() => {
    if (!form.client_id) return contacts
    return contacts.filter(c => c.client_id === form.client_id)
  }, [contacts, form.client_id])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Meeting Notes</h1>
          <p className="text-dim mt-1" style={{ fontSize: '13px' }}>{meetings.length} meetings logged</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={14} /> New Meeting Note
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <select
          className="input"
          value={filterClient}
          onChange={e => setFilterClient(e.target.value)}
          style={{ fontSize: '13px', minWidth: '160px' }}
        >
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          className="input"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ fontSize: '13px', minWidth: '140px' }}
        >
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Timeline */}
      {weekGroups.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No meetings found"
          description="Log your first meeting note to start building your timeline."
          actionLabel="+ New Meeting Note"
          onAction={openCreate}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {weekGroups.map(group => {
            const collapsed = collapsedWeeks.has(group.key)
            return (
              <div key={group.key} className="card overflow-hidden">
                {/* Week Header */}
                <button
                  onClick={() => toggleWeek(group.key)}
                  className="w-full flex items-center gap-2 px-4 py-3 border-b border-border hover:bg-border/30 transition-colors text-left"
                >
                  {collapsed
                    ? <ChevronRight size={13} className="text-dim" />
                    : <ChevronDown size={13} className="text-dim" />
                  }
                  <span className="label">{group.label}</span>
                  <span className="text-dim ml-auto" style={{ fontSize: '12px' }}>{group.meetings.length} meeting{group.meetings.length !== 1 ? 's' : ''}</span>
                </button>

                {/* Entries */}
                {!collapsed && group.meetings.map(m => {
                  const actionItems = safeParseJSON<string[]>(m.action_items, [])
                  return (
                    <div
                      key={m.id}
                      className="flex items-start gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-border/20 transition-colors cursor-pointer"
                      onClick={() => openEdit(m)}
                    >
                      {/* Date */}
                      <div className="flex-shrink-0 w-14 text-center">
                        <p className="text-polar font-[700]" style={{ fontSize: '14px' }}>
                          {formatDate(m.date, 'MMM d')}
                        </p>
                        <p className="text-dim" style={{ fontSize: '11px' }}>
                          {formatDate(m.date, 'EEE')}
                        </p>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-polar font-semibold" style={{ fontSize: '14px' }}>{m.title}</span>
                          <span className={TYPE_BADGE[m.type] || 'badge badge-neutral'}>{m.type}</span>
                        </div>
                        {m.client_name && (
                          <p className="text-steel" style={{ fontSize: '12px' }}>{m.client_name}</p>
                        )}
                        {m.notes && (
                          <p className="text-dim mt-1 truncate" style={{ fontSize: '12px', maxWidth: '500px' }}>
                            {m.notes}
                          </p>
                        )}
                      </div>

                      {/* Action items count + delete */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {actionItems.length > 0 && (
                          <span className="text-dim" style={{ fontSize: '12px' }}>
                            {actionItems.length} action item{actionItems.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        <button
                          onClick={(e) => handleDelete(m, e)}
                          className="text-dim hover:text-err transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Meeting Note' : 'New Meeting Note'} width="560px">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="label mb-1">Date *</p>
              <input
                type="date"
                className="input w-full"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <p className="label mb-1">Type</p>
              <select
                className="input w-full"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className="label mb-1">Title *</p>
            <input
              className="input w-full"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Meeting title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="label mb-1">Client</p>
              <select
                className="input w-full"
                value={form.client_id}
                onChange={e => setForm(f => ({ ...f, client_id: e.target.value, contact_id: '' }))}
              >
                <option value="">Select client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <p className="label mb-1">Contact</p>
              <select
                className="input w-full"
                value={form.contact_id}
                onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
              >
                <option value="">Select contact</option>
                {clientContacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className="label mb-1">Attendees</p>
            <input
              className="input w-full"
              value={form.attendees}
              onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))}
              placeholder="e.g. Omar, Sarah, Mike"
            />
          </div>
          <div>
            <p className="label mb-1">Notes</p>
            <textarea
              className="input w-full"
              rows={5}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Meeting notes..."
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label">Action Items</p>
              <button onClick={addActionItem} className="text-polar hover:text-polar transition-colors" style={{ fontSize: '12px' }}>
                + Add Item
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {form.action_items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={item}
                    onChange={e => updateActionItem(idx, e.target.value)}
                    placeholder={`Action item ${idx + 1}`}
                  />
                  {form.action_items.length > 1 && (
                    <button
                      onClick={() => removeActionItem(idx)}
                      className="text-dim hover:text-err transition-colors"
                      style={{ fontSize: '12px' }}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
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
