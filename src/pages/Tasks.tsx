import { useState, useMemo, useCallback } from 'react'
import { CheckSquare, Plus, Trash2, RefreshCw, Calendar as CalIcon, Edit3, Check } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { tasks as tasksApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import VoiceTextarea from '@/components/ui/VoiceTextarea'
import ContextMenu, { ContextMenuItem } from '@/components/ui/ContextMenu'
import { formatDate, friendlyDate, isOverdue, safeParseJSON } from '@/lib/utils'
import { isToday, parseISO } from 'date-fns'

/* Priority sort weight — lower = higher priority */
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

type Filter = 'all' | 'todo' | 'today' | 'overdue' | 'done'

const EMPTY_FORM = {
  text: '',
  description: '',
  client_id: '',
  priority: 'medium',
  due_date: '',
  tags: '',
  recurring: 'none',
}

export default function Tasks() {
  const { tasks, clients, refreshTasks, refreshActivity } = useAppStore()

  const [filter, setFilter] = useState<Filter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  /* ── counts ── */
  const counts = useMemo(() => {
    let todo = 0, today = 0, overdue = 0, done = 0
    for (const t of tasks) {
      if (t.done) { done++; continue }
      todo++
      if (t.due_date && isOverdue(t.due_date)) overdue++
      if (t.due_date) {
        try { if (isToday(parseISO(t.due_date))) today++ } catch { /* skip */ }
      }
    }
    return { all: tasks.length, todo, today, overdue, done }
  }, [tasks])

  /* ── filtered + sorted list ── */
  const filteredTasks = useMemo(() => {
    let list = [...tasks]

    // apply filter
    switch (filter) {
      case 'todo':
        list = list.filter(t => !t.done)
        break
      case 'today':
        list = list.filter(t => {
          if (t.done) return false
          if (!t.due_date) return false
          try { return isToday(parseISO(t.due_date)) } catch { return false }
        })
        break
      case 'overdue':
        list = list.filter(t => !t.done && isOverdue(t.due_date))
        break
      case 'done':
        list = list.filter(t => !!t.done)
        break
      // 'all' — no filter
    }

    // sort: open first by priority then due date, done at bottom
    list.sort((a, b) => {
      // done goes to bottom
      if (a.done && !b.done) return 1
      if (!a.done && b.done) return -1
      if (a.done && b.done) return (b.completed_at || '').localeCompare(a.completed_at || '')

      // by priority
      const pa = PRIORITY_WEIGHT[a.priority] ?? 4
      const pb = PRIORITY_WEIGHT[b.priority] ?? 4
      if (pa !== pb) return pa - pb

      // by due date (nulls last)
      const da = a.due_date || '9999'
      const db = b.due_date || '9999'
      return da.localeCompare(db)
    })

    return list
  }, [tasks, filter])

  /* ── handlers ── */
  const handleToggle = useCallback(async (id: string) => {
    await tasksApi.toggle(id)
    await Promise.all([refreshTasks(), refreshActivity()])
  }, [refreshTasks, refreshActivity])

  const handleDelete = useCallback(async (id: string) => {
    await tasksApi.delete(id)
    await Promise.all([refreshTasks(), refreshActivity()])
    showToast('Task deleted', 'info', () => {
      // undo is best-effort — re-create not supported by simple delete, so we refresh
      refreshTasks()
    })
  }, [refreshTasks, refreshActivity])

  const handleCreate = useCallback(async () => {
    if (!form.text.trim()) return
    await tasksApi.create({
      text: form.text.trim(),
      description: form.description.trim() || null,
      client_id: form.client_id || null,
      priority: form.priority,
      due_date: form.due_date || null,
      tags: form.tags.trim() || null,
      recurring: form.recurring === 'none' ? null : form.recurring,
    })
    await Promise.all([refreshTasks(), refreshActivity()])
    setForm({ ...EMPTY_FORM })
    setModalOpen(false)
    showToast('Task created', 'success')
  }, [form, refreshTasks, refreshActivity])

  const handleUpdate = useCallback(async () => {
    if (!form.text.trim() || !editingId) return
    await tasksApi.update(editingId, {
      text: form.text.trim(),
      description: form.description.trim() || null,
      client_id: form.client_id || null,
      priority: form.priority,
      due_date: form.due_date || null,
      tags: form.tags.trim() || null,
      recurring: form.recurring === 'none' ? null : form.recurring,
    })
    await Promise.all([refreshTasks(), refreshActivity()])
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setModalOpen(false)
    showToast('Task updated', 'success')
  }, [editingId, form, refreshTasks, refreshActivity])

  const openEdit = useCallback((task: typeof tasks[number]) => {
    const tags = safeParseJSON<string[]>(task.tags, [])
    setForm({
      text: task.text || '',
      description: task.description || '',
      client_id: task.client_id || '',
      priority: task.priority || 'medium',
      due_date: task.due_date || '',
      tags: tags.join(', '),
      recurring: task.recurring || 'none',
    })
    setEditingId(task.id)
    setModalOpen(true)
  }, [])

  /* ── helpers ── */
  function priorityBadge(priority: string) {
    switch (priority) {
      case 'urgent': return <span className="badge badge-err">Urgent</span>
      case 'high':   return <span className="badge badge-warn">High</span>
      case 'medium': return <span className="badge badge-neutral">Med</span>
      case 'low':    return <span className="badge badge-neutral">Low</span>
      default:       return null
    }
  }

  function recurringBadge(recurring: string | null) {
    if (!recurring) return null
    return (
      <span className="badge badge-neutral" style={{ gap: '3px' }}>
        <RefreshCw size={8} />
        {recurring}
      </span>
    )
  }

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all',     label: 'All',     count: counts.all },
    { key: 'todo',    label: 'To Do',   count: counts.todo },
    { key: 'today',   label: 'Today',   count: counts.today },
    { key: 'overdue', label: 'Overdue', count: counts.overdue },
    { key: 'done',    label: 'Done',    count: counts.done },
  ]

  /* ── render ── */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1>Tasks</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM }); setModalOpen(true) }}>
          <Plus size={12} strokeWidth={2.5} />
          New Task
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 font-sans cursor-pointer transition-all duration-150 border ${
              filter === f.key
                ? 'bg-polar text-obsidian border-polar'
                : 'bg-transparent text-steel border-border-hard hover:border-dim hover:text-polar'
            }`}
            style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}
          >
            {f.label}
            <span
              className={`ml-1.5 ${filter === f.key ? 'text-obsidian/60' : 'text-dim'}`}
              style={{ fontSize: '10px' }}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks here"
          description={
            filter === 'all'
              ? 'Create your first task to get started.'
              : `No tasks match the "${FILTERS.find(f => f.key === filter)?.label}" filter.`
          }
          actionLabel={filter === 'all' ? '+ New Task' : undefined}
          onAction={filter === 'all' ? () => { setEditingId(null); setForm({ ...EMPTY_FORM }); setModalOpen(true) } : undefined}
        />
      ) : (
        <div>
          {filteredTasks.map(task => {
            const tags = safeParseJSON<string[]>(task.tags, [])
            const overdue = !task.done && isOverdue(task.due_date)
            const todayTask = !task.done && task.due_date && (() => {
              try { return isToday(parseISO(task.due_date!)) } catch { return false }
            })()

            const taskCtx: ContextMenuItem[] = [
              { label: 'Edit Task', icon: Edit3, action: () => openEdit(task) },
              { label: task.done ? 'Mark Incomplete' : 'Mark Complete', icon: Check, action: () => handleToggle(task.id) },
              { label: 'Delete Task', icon: Trash2, action: () => handleDelete(task.id), danger: true },
            ]

            return (
              <ContextMenu key={task.id} items={taskCtx}>
              <div
                className={`table-row flex items-center gap-3 py-2.5 px-2 ${task.done ? 'opacity-40' : ''}`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => handleToggle(task.id)}
                  className={`flex-shrink-0 w-4 h-4 border cursor-pointer transition-colors duration-100 flex items-center justify-center ${
                    task.done
                      ? 'bg-ok/20 border-ok text-ok'
                      : 'border-dim hover:border-steel text-transparent hover:text-dim'
                  }`}
                  style={{ borderRadius: '2px' }}
                >
                  {task.done && (
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2 6 5 9 10 3" />
                    </svg>
                  )}
                </button>

                {/* Text + description */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(task)}>
                  <div
                    className={`truncate ${task.done ? 'line-through text-steel' : overdue ? 'text-err' : ''}`}
                    style={{ fontSize: '13px', fontWeight: 600 }}
                  >
                    {task.text}
                  </div>
                  {task.description && !task.done && (
                    <div className="text-steel truncate mt-0.5" style={{ fontSize: '11px' }}>
                      {task.description}
                    </div>
                  )}
                </div>

                {/* Client name */}
                {task.client_name && (
                  <span className="flex-shrink-0 text-steel" style={{ fontSize: '11px', maxWidth: '100px' }}>
                    <span className="truncate block">{task.client_name}</span>
                  </span>
                )}

                {/* Due date */}
                {task.due_date && (
                  <span
                    className={`flex-shrink-0 mono flex items-center gap-1 ${
                      task.done ? 'text-steel' : overdue ? 'text-err' : todayTask ? 'text-warn' : 'text-steel'
                    }`}
                  >
                    <CalIcon size={9} />
                    {friendlyDate(task.due_date)}
                  </span>
                )}

                {/* Recurring badge */}
                {recurringBadge(task.recurring)}

                {/* Tags */}
                {tags.length > 0 && (
                  <div className="flex-shrink-0 flex items-center gap-1">
                    {tags.slice(0, 3).map((tag, i) => (
                      <span
                        key={i}
                        className="badge badge-neutral"
                        style={{ fontSize: '9px', padding: '1px 5px' }}
                      >
                        {tag}
                      </span>
                    ))}
                    {tags.length > 3 && (
                      <span className="text-dim" style={{ fontSize: '9px' }}>+{tags.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Priority badge */}
                <div className="flex-shrink-0">{priorityBadge(task.priority)}</div>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(task.id)}
                  className="flex-shrink-0 text-dim hover:text-err transition-colors cursor-pointer p-1"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              </ContextMenu>
            )
          })}
        </div>
      )}

      {/* ── New Task Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Task' : 'New Task'}>
        <div className="space-y-4">
          {/* Task text */}
          <div>
            <label className="label text-steel block mb-1.5">Task</label>
            <input
              type="text"
              value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              placeholder="What needs to be done?"
              className="w-full bg-surface border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors"
              style={{ fontSize: '13px' }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) (editingId ? handleUpdate : handleCreate)() }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="label text-steel block mb-1.5">Description</label>
            <VoiceTextarea
              value={form.description}
              onChange={(val) => setForm(f => ({ ...f, description: val }))}
              placeholder="Optional details..."
              rows={3}
              className="w-full bg-surface border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors resize-none"
              style={{ fontSize: '13px' }}
            />
          </div>

          {/* Client + Priority row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label text-steel block mb-1.5">Client</label>
              <select
                value={form.client_id}
                onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar focus:outline-none focus:border-dim transition-colors cursor-pointer"
                style={{ fontSize: '13px' }}
              >
                <option value="">No client</option>
                {clients
                  .filter(c => c.status === 'active')
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label text-steel block mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar focus:outline-none focus:border-dim transition-colors cursor-pointer"
                style={{ fontSize: '13px' }}
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>

          {/* Due date + Recurring row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label text-steel block mb-1.5">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar focus:outline-none focus:border-dim transition-colors cursor-pointer"
                style={{ fontSize: '13px' }}
              />
            </div>
            <div>
              <label className="label text-steel block mb-1.5">Recurring</label>
              <select
                value={form.recurring}
                onChange={e => setForm(f => ({ ...f, recurring: e.target.value }))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar focus:outline-none focus:border-dim transition-colors cursor-pointer"
                style={{ fontSize: '13px' }}
              >
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="label text-steel block mb-1.5">Tags</label>
            <input
              type="text"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="design, website, seo (comma separated)"
              className="w-full bg-surface border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors"
              style={{ fontSize: '13px' }}
            />
            <span className="text-dim mt-1 block" style={{ fontSize: '10px' }}>Separate with commas</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button className="btn-ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={!form.text.trim()}
              style={{ opacity: form.text.trim() ? 1 : 0.4 }}
            >
              {editingId ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
