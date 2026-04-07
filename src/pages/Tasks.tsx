import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { CheckSquare, Plus, Trash2, RefreshCw, Calendar as CalIcon, Edit3, Check, AlertTriangle, Clock, Download, X, List, LayoutGrid, Play, Square } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { tasks as tasksApi, timeEntries as timeEntriesApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import VoiceTextarea from '@/components/ui/VoiceTextarea'
import ContextMenu, { ContextMenuItem } from '@/components/ui/ContextMenu'
import { formatDate, friendlyDate, isOverdue, safeParseJSON } from '@/lib/utils'
import { exportToCSV } from '@/lib/export-csv'
import { isToday, parseISO, differenceInCalendarDays } from 'date-fns'

/* Priority sort weight — lower = higher priority */
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

type Filter = 'all' | 'todo' | 'today' | 'overdue' | 'done'
type ViewMode = 'list' | 'board'

const PRIORITY_COLUMNS = ['urgent', 'high', 'medium', 'low'] as const
const PRIORITY_COLUMN_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/* Format elapsed seconds as H:MM:SS */
function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

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
  const { tasks, clients, runningTimer, refreshTasks, refreshActivity, refreshTimeEntries, refreshRunningTimer } = useAppStore()

  const [filter, setFilter] = useState<Filter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('gth_tasks_view') as ViewMode) || 'list'
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set())

  /* ── Timer state ── */
  const [activeTimerTaskId, setActiveTimerTaskId] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sync running timer from store
  useEffect(() => {
    if (runningTimer && runningTimer.notes && runningTimer.notes.startsWith('task:')) {
      const taskId = runningTimer.notes.replace('task:', '')
      setActiveTimerTaskId(taskId)
      // Calculate elapsed from started_at
      const startedMs = new Date(runningTimer.started_at).getTime()
      const nowMs = Date.now()
      setElapsedSeconds(Math.floor((nowMs - startedMs) / 1000))
    } else {
      setActiveTimerTaskId(null)
      setElapsedSeconds(0)
    }
  }, [runningTimer])

  // Tick the timer every second
  useEffect(() => {
    if (activeTimerTaskId) {
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1)
      }, 1000)
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [activeTimerTaskId])

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('gth_tasks_view', viewMode)
  }, [viewMode])

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
    // Check if the task is currently not done (i.e. being completed)
    const task = tasks.find(t => t.id === id)
    const isCompleting = task && !task.done

    await tasksApi.toggle(id)
    await Promise.all([refreshTasks(), refreshActivity()])

    if (isCompleting) {
      setRecentlyCompleted(prev => new Set(prev).add(id))
      setTimeout(() => {
        setRecentlyCompleted(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 1000)
    }
  }, [tasks, refreshTasks, refreshActivity])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this task? This cannot be undone.')) return
    await tasksApi.delete(id)
    await Promise.all([refreshTasks(), refreshActivity()])
    showToast('Task deleted', 'info', () => {
      // undo is best-effort — re-create not supported by simple delete, so we refresh
      refreshTasks()
    })
  }, [refreshTasks, refreshActivity])

  const handleCreate = useCallback(async () => {
    if (!form.text.trim() || saving) return
    setSaving(true)
    try {
      await tasksApi.create({
        text: form.text.trim(),
        description: form.description.trim() || null,
        client_id: form.client_id || null,
        priority: form.priority,
        due_date: form.due_date || null,
        tags: form.tags.trim() || null,
        recurring: form.recurring === 'none' ? null : form.recurring,
        done: 0,
      })
      await Promise.all([refreshTasks(), refreshActivity()])
      setForm({ ...EMPTY_FORM })
      setModalOpen(false)
      showToast('Task created', 'success')
    } catch (err: any) {
      console.error('Task create failed:', err)
      showToast(err?.message || 'Failed to create task', 'error')
    } finally {
      setSaving(false)
    }
  }, [form, saving, refreshTasks, refreshActivity])

  const handleUpdate = useCallback(async () => {
    if (!form.text.trim() || !editingId || saving) return
    setSaving(true)
    try {
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
    } catch (err: any) {
      console.error('Task update failed:', err)
      showToast(err?.message || 'Failed to update task', 'error')
    } finally {
      setSaving(false)
    }
  }, [editingId, form, saving, refreshTasks, refreshActivity])

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

  /* ── bulk selection helpers ── */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === filteredTasks.length && filteredTasks.length > 0) return new Set()
      return new Set(filteredTasks.map(t => t.id))
    })
  }, [filteredTasks])

  const handleBulkDone = useCallback(async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      const undone = tasks.filter(t => selectedIds.has(t.id) && !t.done)
      await Promise.all(
        undone.map(t => tasksApi.update(t.id, { done: 1, completed_at: new Date().toISOString() }))
      )
      await Promise.all([refreshTasks(), refreshActivity()])
      showToast(`${undone.length} task${undone.length !== 1 ? 's' : ''} marked done`, 'success')
    } catch {
      showToast('Failed to mark tasks done', 'error')
    } finally {
      setSelectedIds(new Set())
      setBulkLoading(false)
    }
  }, [selectedIds, tasks, refreshTasks, refreshActivity])

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} task${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkLoading(true)
    try {
      await Promise.all(
        Array.from(selectedIds).map(id => tasksApi.delete(id))
      )
      await Promise.all([refreshTasks(), refreshActivity()])
      showToast(`${selectedIds.size} task${selectedIds.size !== 1 ? 's' : ''} deleted`, 'info')
    } catch {
      showToast('Failed to delete tasks', 'error')
    } finally {
      setSelectedIds(new Set())
      setBulkLoading(false)
    }
  }, [selectedIds, refreshTasks, refreshActivity])

  /* ── Timer handler ── */
  const handleTimerToggle = useCallback(async (taskId: string) => {
    try {
      // If this task already has a running timer, stop it
      if (activeTimerTaskId === taskId && runningTimer) {
        await timeEntriesApi.stop(runningTimer.id, `task:${taskId}`)
        setActiveTimerTaskId(null)
        setElapsedSeconds(0)
        await Promise.all([refreshTimeEntries(), refreshRunningTimer()])
        const task = tasks.find(t => t.id === taskId)
        showToast(`Timer stopped for "${task?.text || 'task'}"`, 'info')
        return
      }

      // If another timer is running, stop it first
      if (runningTimer) {
        await timeEntriesApi.stop(runningTimer.id, runningTimer.notes || '')
      }

      // Find the task to get client_id
      const task = tasks.find(t => t.id === taskId)

      // Start new timer
      await timeEntriesApi.start({
        client_id: task?.client_id || null,
        project_id: null,
        notes: `task:${taskId}`,
        billable: 1,
      })
      await Promise.all([refreshTimeEntries(), refreshRunningTimer()])
      showToast(`Timer started for "${task?.text || 'task'}"`, 'success')
    } catch {
      showToast('Failed to toggle timer', 'error')
    }
  }, [activeTimerTaskId, runningTimer, tasks, refreshTimeEntries, refreshRunningTimer])

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

  function timerButton(taskId: string, compact = false) {
    const isActive = activeTimerTaskId === taskId
    return (
      <button
        onClick={(e) => { e.stopPropagation(); handleTimerToggle(taskId) }}
        className={`flex-shrink-0 flex items-center gap-1 cursor-pointer transition-all duration-150 ${
          isActive
            ? 'text-ok hover:text-ok/80'
            : 'text-dim hover:text-steel'
        }`}
        style={{ fontSize: '10px', fontWeight: 600, padding: compact ? '2px 4px' : '2px 6px' }}
        title={isActive ? 'Stop timer' : 'Start timer'}
      >
        {isActive ? (
          <>
            <Square size={10} fill="currentColor" />
            <span className="mono">{formatElapsed(elapsedSeconds)}</span>
          </>
        ) : (
          <Play size={11} />
        )}
      </button>
    )
  }

  /* ── Kanban board columns ── */
  const boardColumns = useMemo(() => {
    const cols: Record<string, typeof filteredTasks> = {
      urgent: [],
      high: [],
      medium: [],
      low: [],
    }
    for (const task of filteredTasks) {
      const p = task.priority || 'low'
      if (cols[p]) cols[p].push(task)
      else cols.low.push(task) // 'none' and unknown go to low
    }
    return cols
  }, [filteredTasks])

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all',     label: 'All',     count: counts.all },
    { key: 'todo',    label: 'To Do',   count: counts.todo },
    { key: 'today',   label: 'Today',   count: counts.today },
    { key: 'overdue', label: 'Overdue', count: counts.overdue },
    { key: 'done',    label: 'Done',    count: counts.done },
  ]

  /* ── render ── */
  return (
    <div className="space-y-5" style={{ paddingBottom: selectedIds.size > 0 ? '80px' : undefined }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1>Tasks</h1>
          <CheckSquare size={14} className="text-dim" />
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-border-hard" style={{ borderRadius: '2px' }}>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 cursor-pointer transition-colors ${viewMode === 'list' ? 'bg-polar/15 text-polar' : 'text-dim hover:text-steel'}`}
              title="List view"
            >
              <List size={13} />
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`p-1.5 cursor-pointer transition-colors ${viewMode === 'board' ? 'bg-polar/15 text-polar' : 'text-dim hover:text-steel'}`}
              title="Board view"
            >
              <LayoutGrid size={13} />
            </button>
          </div>
          <button
            onClick={() => exportToCSV(
              filteredTasks.map(t => ({
                title: t.text || '',
                status: t.done ? 'done' : 'todo',
                priority: t.priority || '',
                due_date: t.due_date || '',
                client: t.client_name || '',
              })),
              'tasks-export'
            )}
            className="btn-ghost flex items-center gap-2"
          >
            <Download size={12} /> Export CSV
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM }); setModalOpen(true) }}>
            <Plus size={12} strokeWidth={2.5} />
            New Task
          </button>
        </div>
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

      {/* Task list / board */}
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
      ) : viewMode === 'board' ? (
        /* ═══════════════ BOARD VIEW ═══════════════ */
        <div
          className="flex gap-4"
          style={{ overflowX: 'auto', paddingBottom: '8px', minHeight: '400px' }}
        >
          {PRIORITY_COLUMNS.map(priority => {
            const colTasks = boardColumns[priority]
            return (
              <div
                key={priority}
                className="flex-1"
                style={{ minWidth: '220px', maxWidth: '320px' }}
              >
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-3 py-2 mb-2 border-b"
                  style={{
                    borderColor: priority === 'urgent' ? 'var(--err, #ef4444)' : priority === 'high' ? 'var(--warn, #f59e0b)' : 'var(--border-hard, #2a2a2a)',
                    borderBottomWidth: '2px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }} className="text-polar">
                    {PRIORITY_COLUMN_LABELS[priority]}
                  </span>
                  <span className="text-dim" style={{ fontSize: '10px', fontWeight: 700 }}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Column body — scrollable */}
                <div
                  className="space-y-2"
                  style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 320px)', paddingRight: '4px' }}
                >
                  {colTasks.length === 0 && (
                    <div className="text-dim text-center py-6" style={{ fontSize: '11px' }}>No tasks</div>
                  )}
                  {colTasks.map(task => {
                    const overdue = !task.done && isOverdue(task.due_date)
                    return (
                      <div
                        key={task.id}
                        className={`border border-border-hard p-3 cursor-pointer transition-colors hover:border-dim ${task.done ? 'opacity-40' : ''}`}
                        style={{ background: 'var(--surface, #151515)', borderRadius: '3px' }}
                        onClick={() => openEdit(task)}
                      >
                        {/* Top row: checkbox + title + timer */}
                        <div className="flex items-start gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggle(task.id) }}
                            className={`flex-shrink-0 w-3.5 h-3.5 border cursor-pointer transition-colors duration-100 flex items-center justify-center mt-0.5 ${
                              task.done
                                ? 'bg-ok/20 border-ok text-ok'
                                : 'border-dim hover:border-steel text-transparent hover:text-dim'
                            }`}
                            style={{ borderRadius: '2px' }}
                          >
                            {task.done && (
                              <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="2 6 5 9 10 3" />
                              </svg>
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div
                              className={`${task.done ? 'line-through text-steel' : overdue ? 'text-err' : 'text-polar'}`}
                              style={{ fontSize: '12px', fontWeight: 600, lineHeight: 1.3 }}
                            >
                              {task.text}
                            </div>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            {timerButton(task.id, true)}
                          </div>
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {task.client_name && (
                            <span className="text-steel truncate" style={{ fontSize: '10px', maxWidth: '120px' }}>
                              {task.client_name}
                            </span>
                          )}
                          {task.due_date && (
                            <span
                              className={`mono flex items-center gap-1 ${
                                task.done ? 'text-steel' : overdue ? 'text-err' : 'text-steel'
                              }`}
                              style={{ fontSize: '10px' }}
                            >
                              <CalIcon size={8} />
                              {friendlyDate(task.due_date)}
                              {overdue && !task.done && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-err/15 text-err px-1 py-0.5" style={{ fontSize: '8px', fontWeight: 700, lineHeight: 1 }}>
                                  OVERDUE
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ═══════════════ LIST VIEW ═══════════════ */
        <div>
          {/* Select-all header */}
          <div className="flex items-center gap-3 px-2 py-1.5 border-b border-border-hard" style={{ marginBottom: '2px' }}>
            <button
              onClick={toggleSelectAll}
              className={`flex-shrink-0 w-3.5 h-3.5 border cursor-pointer transition-colors duration-100 flex items-center justify-center ${
                selectedIds.size === filteredTasks.length && filteredTasks.length > 0
                  ? 'bg-polar/20 border-polar text-polar'
                  : selectedIds.size > 0
                    ? 'bg-polar/10 border-polar/50 text-polar/50'
                    : 'border-dim hover:border-steel text-transparent hover:text-dim'
              }`}
              style={{ borderRadius: '2px' }}
            >
              {selectedIds.size > 0 && (
                <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {selectedIds.size === filteredTasks.length
                    ? <polyline points="2 6 5 9 10 3" />
                    : <line x1="3" y1="6" x2="9" y2="6" />
                  }
                </svg>
              )}
            </button>
            <span className="text-dim" style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
            </span>
          </div>
          {filteredTasks.map(task => {
            const tags = safeParseJSON<string[]>(task.tags, [])
            const overdue = !task.done && isOverdue(task.due_date)
            const todayTask = !task.done && task.due_date && (() => {
              try { return isToday(parseISO(task.due_date!)) } catch { return false }
            })()
            const dueSoon = !task.done && !overdue && !todayTask && task.due_date && (() => {
              try {
                const diff = differenceInCalendarDays(parseISO(task.due_date!), new Date())
                return diff > 0 && diff <= 2
              } catch { return false }
            })()

            const taskCtx: ContextMenuItem[] = [
              { label: 'Edit Task', icon: Edit3, action: () => openEdit(task) },
              { label: task.done ? 'Mark Incomplete' : 'Mark Complete', icon: Check, action: () => handleToggle(task.id) },
              { label: 'Delete Task', icon: Trash2, action: () => handleDelete(task.id), danger: true },
            ]

            return (
              <ContextMenu key={task.id} items={taskCtx}>
              <div
                className={`table-row flex items-center gap-3 py-2.5 px-2 ${task.done ? 'opacity-40' : ''} ${selectedIds.has(task.id) ? 'row-selected' : ''} ${recentlyCompleted.has(task.id) ? 'task-just-completed' : ''}`}
              >
                {/* Selection checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelect(task.id) }}
                  className={`flex-shrink-0 w-3.5 h-3.5 border cursor-pointer transition-colors duration-100 flex items-center justify-center ${
                    selectedIds.has(task.id)
                      ? 'bg-polar/20 border-polar text-polar'
                      : 'border-dim/50 hover:border-steel text-transparent hover:text-dim'
                  }`}
                  style={{ borderRadius: '2px' }}
                >
                  {selectedIds.has(task.id) && (
                    <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2 6 5 9 10 3" />
                    </svg>
                  )}
                </button>

                {/* Done toggle checkbox */}
                <button
                  onClick={() => handleToggle(task.id)}
                  className={`done-checkbox flex-shrink-0 w-4 h-4 border cursor-pointer transition-colors duration-100 flex items-center justify-center ${
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
                    style={{ fontSize: '13px', fontWeight: 600, transition: 'all 0.4s ease', opacity: recentlyCompleted.has(task.id) || task.done ? 0.5 : 1 }}
                  >
                    {task.text}
                  </div>
                  {task.description && !task.done && (
                    <div className="text-steel truncate mt-0.5" style={{ fontSize: '11px' }}>
                      {task.description}
                    </div>
                  )}
                </div>

                {/* Timer button */}
                {timerButton(task.id)}

                {/* Client name */}
                {task.client_name && (
                  <span className="flex-shrink-0 text-steel" style={{ fontSize: '11px', maxWidth: '100px' }}>
                    <span className="truncate block">{task.client_name}</span>
                  </span>
                )}

                {/* Due date */}
                {task.due_date && (
                  <span
                    className={`flex-shrink-0 mono flex items-center gap-1.5 ${
                      task.done ? 'text-steel' : overdue ? 'text-err' : (todayTask || dueSoon) ? 'text-warn' : 'text-steel'
                    }`}
                  >
                    <CalIcon size={9} />
                    {friendlyDate(task.due_date)}
                    {overdue && !task.done && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-err/15 text-err px-1.5 py-0.5" style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1 }}>
                        <AlertTriangle size={8} />
                        OVERDUE
                      </span>
                    )}
                    {todayTask && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-warn/15 text-warn px-1.5 py-0.5" style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1 }}>
                        <Clock size={8} />
                        DUE TODAY
                      </span>
                    )}
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
                  aria-label={`Delete task: ${task.text}`}
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
              disabled={!form.text.trim() || saving}
              style={{ opacity: (!form.text.trim() || saving) ? 0.5 : 1 }}
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Bulk Action Bar ── */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-center pointer-events-none"
          style={{ padding: '16px 16px 24px' }}
        >
          <div
            className="pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-lg shadow-lg"
            style={{
              background: 'var(--obsidian, #0d0d0d)',
              border: '1px solid var(--border-hard, #2a2a2a)',
              maxWidth: '480px',
              width: '100%',
            }}
          >
            <span className="text-polar font-semibold whitespace-nowrap" style={{ fontSize: '13px' }}>
              {selectedIds.size} task{selectedIds.size !== 1 ? 's' : ''} selected
            </span>

            <div className="flex-1" />

            <button
              onClick={handleBulkDone}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-colors"
              style={{
                fontSize: '12px',
                fontWeight: 600,
                background: 'var(--ok, #22c55e)',
                color: '#fff',
                opacity: bulkLoading ? 0.5 : 1,
              }}
            >
              <Check size={12} strokeWidth={2.5} />
              Mark Done
            </button>

            <button
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-colors"
              style={{
                fontSize: '12px',
                fontWeight: 600,
                background: 'var(--err, #ef4444)',
                color: '#fff',
                opacity: bulkLoading ? 0.5 : 1,
              }}
            >
              <Trash2 size={12} />
              Delete
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-steel hover:text-polar transition-colors"
              style={{ fontSize: '11px', fontWeight: 600 }}
            >
              <X size={12} />
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
