import { useState, useMemo } from 'react'
import { Target, Plus } from 'lucide-react'
import { useAppStore, Goal } from '@/lib/store'
import { goals as goalsApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/utils'
import { differenceInDays, parseISO } from 'date-fns'

const METRIC_TYPES = ['mrr', 'clients', 'revenue', 'tasks', 'custom'] as const

const STATUS_BADGE: Record<string, string> = {
  active: 'badge badge-ok',
  achieved: 'badge badge-warn',
  archived: 'badge badge-neutral',
  missed: 'badge badge-err',
}

const EMPTY_FORM = {
  title: '',
  description: '',
  metric_type: 'mrr' as string,
  target_value: 0,
  current_value: 0,
  target_date: '',
  status: 'active' as string,
}

function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null
  try {
    const diff = differenceInDays(parseISO(dateStr), new Date())
    return diff
  } catch {
    return null
  }
}

function progressPct(current: number | null, target: number | null): number {
  if (!target || target === 0) return 0
  return Math.min(Math.round(((current || 0) / target) * 100), 100)
}

export default function Goals() {
  const { goals, refreshGoals, refreshActivity } = useAppStore()
  const [showArchived, setShowArchived] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  const activeGoals = useMemo(() => goals.filter(g => g.status === 'active'), [goals])
  const achievedGoals = useMemo(() => goals.filter(g => g.status === 'achieved'), [goals])
  const archivedGoals = useMemo(() => goals.filter(g => g.status === 'archived' || g.status === 'missed'), [goals])

  const set = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }))

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }

  const openEdit = (g: Goal) => {
    setEditingId(g.id)
    setForm({
      title: g.title,
      description: g.description || '',
      metric_type: g.metric_type,
      target_value: g.target_value || 0,
      current_value: g.current_value || 0,
      target_date: g.target_date || '',
      status: g.status,
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) { showToast('Title is required', 'warn'); return }
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        metric_type: form.metric_type,
        target_value: Number(form.target_value) || null,
        current_value: Number(form.current_value) || null,
        target_date: form.target_date || null,
        status: form.status,
      }
      if (editingId) {
        await goalsApi.update(editingId, payload)
        showToast('Goal updated', 'success')
      } else {
        await goalsApi.create(payload)
        showToast('Goal created', 'success')
      }
      await Promise.all([refreshGoals(), refreshActivity()])
      setModalOpen(false)
    } catch { showToast('Save failed', 'error') }
  }

  const deleteGoal = async (id: string) => {
    try {
      await goalsApi.delete(id)
      await Promise.all([refreshGoals(), refreshActivity()])
      showToast('Goal deleted', 'info')
    } catch { showToast('Delete failed', 'error') }
  }

  const GoalCard = ({ g }: { g: Goal }) => {
    const pct = progressPct(g.current_value, g.target_value)
    const days = daysRemaining(g.target_date)

    return (
      <div onClick={() => openEdit(g)} className="card cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-polar font-[700]" style={{ fontSize: '14px' }}>{g.title}</h3>
          <span className={STATUS_BADGE[g.status] || 'badge badge-neutral'}>{g.status}</span>
        </div>

        {g.description && (
          <p className="text-steel mb-3" style={{ fontSize: '12px' }}>{g.description}</p>
        )}

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <span className="label text-dim">METRIC</span>
            <p className="mono text-steel mt-0.5">{g.metric_type}</p>
          </div>
          <div>
            <span className="label text-dim">CURRENT</span>
            <p className="mono text-polar mt-0.5">{g.current_value ?? 0}</p>
          </div>
          <div>
            <span className="label text-dim">TARGET</span>
            <p className="mono text-polar mt-0.5">{g.target_value ?? 0}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="mono text-dim">{pct}%</span>
            {days !== null && (
              <span className={`mono ${days <= 0 ? 'text-err' : days <= 7 ? 'text-warn' : 'text-dim'}`}>
                {days <= 0 ? 'Overdue' : `${days}d left`}
              </span>
            )}
          </div>
          <div className="w-full h-1.5 bg-border">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: pct >= 100 ? '#22C55E' : pct >= 60 ? '#00C2FF' : '#F59E0B',
              }}
            />
          </div>
        </div>

        {g.target_date && (
          <span className="mono text-dim">Target: {formatDate(g.target_date, 'MMM d, yyyy')}</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Goals</h1>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {activeGoals.length} active &middot; {achievedGoals.length} achieved
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={12} /> New Goal
        </button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals set"
          description="Define measurable goals to track your agency growth."
          actionLabel="New Goal"
          onAction={openCreate}
        />
      ) : (
        <>
          {/* Active goals */}
          {activeGoals.length > 0 && (
            <div>
              <h2 className="label-md text-steel mb-3">ACTIVE GOALS</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeGoals.map(g => <GoalCard key={g.id} g={g} />)}
              </div>
            </div>
          )}

          {/* Achieved goals */}
          {achievedGoals.length > 0 && (
            <div>
              <h2 className="label-md text-steel mb-3">ACHIEVED</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {achievedGoals.map(g => <GoalCard key={g.id} g={g} />)}
              </div>
            </div>
          )}

          {/* Archived toggle */}
          {archivedGoals.length > 0 && (
            <div>
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="label-md text-dim hover:text-steel transition-colors cursor-pointer mb-3"
              >
                {showArchived ? 'HIDE' : 'SHOW'} ARCHIVED ({archivedGoals.length})
              </button>
              {showArchived && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {archivedGoals.map(g => (
                    <div key={g.id} className="opacity-50">
                      <GoalCard g={g} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Goal' : 'New Goal'}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="label text-dim">TITLE</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Hit $25K MRR"
              className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '12px' }}
            />
          </div>

          <div className="space-y-1">
            <label className="label text-dim">DESCRIPTION</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim resize-none transition-colors"
              style={{ fontSize: '12px' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="label text-dim">METRIC TYPE</label>
              <select
                value={form.metric_type}
                onChange={e => set('metric_type', e.target.value)}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim"
                style={{ fontSize: '12px' }}
              >
                {METRIC_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="label text-dim">STATUS</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim"
                style={{ fontSize: '12px' }}
              >
                <option value="active">Active</option>
                <option value="achieved">Achieved</option>
                <option value="missed">Missed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="label text-dim">CURRENT VALUE</label>
              <input
                type="number"
                value={form.current_value}
                onChange={e => set('current_value', Number(e.target.value))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
            <div className="space-y-1">
              <label className="label text-dim">TARGET VALUE</label>
              <input
                type="number"
                value={form.target_value}
                onChange={e => set('target_value', Number(e.target.value))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
            <div className="space-y-1">
              <label className="label text-dim">TARGET DATE</label>
              <input
                type="date"
                value={form.target_date}
                onChange={e => set('target_date', e.target.value)}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              <button onClick={save} className="btn-primary">
                {editingId ? 'Update' : 'Create'}
              </button>
              <button onClick={() => setModalOpen(false)} className="btn-ghost">Cancel</button>
            </div>
            {editingId && (
              <button
                onClick={async () => { await deleteGoal(editingId); setModalOpen(false) }}
                className="text-err font-sans cursor-pointer hover:underline"
                style={{ fontSize: '11px' }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
