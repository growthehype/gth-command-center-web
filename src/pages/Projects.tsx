import { useState, useMemo, useCallback, useRef } from 'react'
import { Kanban, Plus, ChevronLeft, ChevronRight, Trash2, Edit3, ArrowRight, ArrowLeft } from 'lucide-react'
import { useAppStore, type Project } from '@/lib/store'
import { projects as projectsApi } from '@/lib/api'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import EmptyState from '@/components/ui/EmptyState'
import ContextMenu, { ContextMenuItem } from '@/components/ui/ContextMenu'
import { friendlyDate, isOverdue } from '@/lib/utils'

/* ── Constants ── */

const COLUMNS = ['backlog', 'progress', 'review', 'done'] as const
type ColumnKey = (typeof COLUMNS)[number]

const COLUMN_META: Record<ColumnKey, { label: string }> = {
  backlog: { label: 'Backlog' },
  progress: { label: 'In Progress' },
  review: { label: 'Review' },
  done: { label: 'Done' },
}

const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

const EMPTY_FORM = {
  title: '',
  description: '',
  client_id: '',
  priority: 'medium',
  status: 'backlog' as ColumnKey,
  due_date: '',
  hours: 0,
  links: '',
  recurring: 'none',
}

/* ── Helpers ── */

function priorityBadge(priority: string | null) {
  switch (priority) {
    case 'urgent': return <span className="badge badge-err">Urgent</span>
    case 'high':   return <span className="badge badge-warn">High</span>
    case 'medium': return <span className="badge badge-neutral">Med</span>
    case 'low':    return <span className="badge badge-neutral">Low</span>
    default:       return null
  }
}

function truncate(str: string | null, max: number): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '...' : str
}

function sortByPriorityThenDue(a: Project, b: Project): number {
  const pa = PRIORITY_WEIGHT[a.priority || 'none'] ?? 4
  const pb = PRIORITY_WEIGHT[b.priority || 'none'] ?? 4
  if (pa !== pb) return pa - pb
  const da = a.due_date || '9999'
  const db = b.due_date || '9999'
  return da.localeCompare(db)
}

/* ── Component ── */

export default function Projects() {
  const { projects, clients, refreshProjects, refreshActivity } = useAppStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<ColumnKey | null>(null)

  /* ── Columns data ── */
  const columns = useMemo(() => {
    const map: Record<ColumnKey, Project[]> = {
      backlog: [],
      progress: [],
      review: [],
      done: [],
    }
    for (const p of projects) {
      const key = (COLUMNS.includes(p.status as ColumnKey) ? p.status : 'backlog') as ColumnKey
      map[key].push(p)
    }
    for (const key of COLUMNS) {
      map[key].sort(sortByPriorityThenDue)
    }
    return map
  }, [projects])

  /* ── Drag and Drop handlers ── */
  const handleDragStart = useCallback((e: React.DragEvent, projectId: string) => {
    setDraggedId(projectId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', projectId)
    // Make drag ghost slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedId(null)
    setDropTarget(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, colKey: ColumnKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(colKey)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, colKey: ColumnKey) => {
    e.preventDefault()
    setDropTarget(null)
    const projectId = e.dataTransfer.getData('text/plain')
    if (!projectId) return

    const project = projects.find(p => p.id === projectId)
    if (!project || project.status === colKey) {
      setDraggedId(null)
      return
    }

    try {
      await projectsApi.moveStatus(projectId, colKey)
      await Promise.all([refreshProjects(), refreshActivity()])
      showToast(`Moved to ${COLUMN_META[colKey].label}`, 'info')
    } catch (err) {
      showToast('Failed to move project', 'error')
    }
    setDraggedId(null)
  }, [projects, refreshProjects, refreshActivity])

  /* ── Move status ── */
  const handleMove = useCallback(async (project: Project, direction: 'left' | 'right') => {
    const currentIdx = COLUMNS.indexOf(project.status as ColumnKey)
    const nextIdx = direction === 'left' ? currentIdx - 1 : currentIdx + 1
    if (nextIdx < 0 || nextIdx >= COLUMNS.length) return
    const nextStatus = COLUMNS[nextIdx]
    await projectsApi.moveStatus(project.id, nextStatus)
    await Promise.all([refreshProjects(), refreshActivity()])
    showToast(`Moved to ${COLUMN_META[nextStatus].label}`, 'info')
  }, [refreshProjects, refreshActivity])

  /* ── Delete ── */
  const handleDelete = useCallback(async (id: string) => {
    await projectsApi.delete(id)
    await Promise.all([refreshProjects(), refreshActivity()])
    setEditProject(null)
    setModalOpen(false)
    showToast('Project deleted', 'info')
  }, [refreshProjects, refreshActivity])

  /* ── Open detail modal ── */
  const openDetail = useCallback((project: Project) => {
    setEditProject(project)
    setForm({
      title: project.title,
      description: project.description || '',
      client_id: project.client_id || '',
      priority: project.priority || 'medium',
      status: (COLUMNS.includes(project.status as ColumnKey) ? project.status : 'backlog') as ColumnKey,
      due_date: project.due_date || '',
      hours: project.hours || 0,
      links: project.links || '',
      recurring: project.recurring || 'none',
    })
    setModalOpen(true)
  }, [])

  /* ── Open new modal ── */
  const openNew = useCallback(() => {
    setEditProject(null)
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }, [])

  /* ── Save (create or update) ── */
  const handleSave = useCallback(async () => {
    if (!form.title.trim()) return
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      client_id: form.client_id || null,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      hours: form.hours || 0,
      links: form.links.trim() || null,
      recurring: form.recurring === 'none' ? null : form.recurring,
    }
    try {
      if (editProject) {
        await projectsApi.update(editProject.id, payload)
        showToast('Project updated', 'success')
      } else {
        await projectsApi.create(payload)
        showToast('Project created', 'success')
      }
      await Promise.all([refreshProjects(), refreshActivity()])
      setModalOpen(false)
      setEditProject(null)
      setForm({ ...EMPTY_FORM })
    } catch (err: any) {
      console.error('Failed to save project:', err)
      showToast(`Error: ${err?.message || 'Failed to save'}`, 'error')
    }
  }, [form, editProject, refreshProjects, refreshActivity])

  /* ── Client name resolver ── */
  const clientName = useCallback((project: Project): string => {
    if (project.client_name) return project.client_name
    if (project.client_id) {
      const c = clients.find(cl => cl.id === project.client_id)
      return c ? c.name : 'GTH Internal'
    }
    return 'GTH Internal'
  }, [clients])

  /* ── Empty state ── */
  const totalProjects = projects.length
  if (totalProjects === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1>Projects</h1>
          <button className="btn-primary flex items-center gap-2" onClick={openNew}>
            <Plus size={12} strokeWidth={2.5} />
            New Project
          </button>
        </div>
        <EmptyState
          icon={Kanban}
          title="No projects yet"
          description="Create your first project to start tracking work across the pipeline."
          actionLabel="+ New Project"
          onAction={openNew}
        />
        {renderModal()}
      </div>
    )
  }

  /* ── Modal render ── */
  function renderModal() {
    return (
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditProject(null) }}
        title={editProject ? 'Edit Project' : 'New Project'}
        width="540px"
      >
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="label text-steel block mb-1.5">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Project title"
              className="w-full bg-surface border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors"
              style={{ fontSize: '13px' }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSave() }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="label text-steel block mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Project details..."
              rows={3}
              className="w-full bg-surface border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors resize-none"
              style={{ fontSize: '13px' }}
            />
          </div>

          {/* Client + Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label text-steel block mb-1.5">Client</label>
              <select
                value={form.client_id}
                onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar focus:outline-none focus:border-dim transition-colors cursor-pointer"
                style={{ fontSize: '13px' }}
              >
                <option value="">GTH Internal</option>
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

          {/* Status + Due Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label text-steel block mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as ColumnKey }))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar focus:outline-none focus:border-dim transition-colors cursor-pointer"
                style={{ fontSize: '13px' }}
              >
                {COLUMNS.map(col => (
                  <option key={col} value={col}>{COLUMN_META[col].label}</option>
                ))}
              </select>
            </div>
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
          </div>

          {/* Hours + Recurring */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label text-steel block mb-1.5">Estimated Hours</label>
              <input
                type="number"
                value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: Number(e.target.value) }))}
                min={0}
                className="w-full bg-surface border border-border px-3 py-2 text-polar focus:outline-none focus:border-dim transition-colors"
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
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {/* Links */}
          <div>
            <label className="label text-steel block mb-1.5">Links</label>
            <input
              type="text"
              value={form.links}
              onChange={e => setForm(f => ({ ...f, links: e.target.value }))}
              placeholder="Figma, drive, repo URLs..."
              className="w-full bg-surface border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors"
              style={{ fontSize: '13px' }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {editProject && (
                <button
                  className="text-dim hover:text-err transition-colors cursor-pointer flex items-center gap-1.5"
                  style={{ fontSize: '11px', fontWeight: 600 }}
                  onClick={() => handleDelete(editProject.id)}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button className="btn-ghost" onClick={() => { setModalOpen(false); setEditProject(null) }}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={!form.title.trim()}
                style={{ opacity: form.title.trim() ? 1 : 0.4 }}
              >
                {editProject ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    )
  }

  /* ── Main render ── */
  return (
    <div className="space-y-5" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1>Projects</h1>
        <button className="btn-primary flex items-center gap-2" onClick={openNew}>
          <Plus size={12} strokeWidth={2.5} />
          New Project
        </button>
      </div>

      {/* Kanban board */}
      <div
        className="flex gap-4 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0 pb-4"
        style={{
          height: 'calc(100% - 60px)',
        }}
      >
        {COLUMNS.map(colKey => {
          const items = columns[colKey]
          const isDone = colKey === 'done'
          const isDropping = dropTarget === colKey

          return (
            <div
              key={colKey}
              className="flex flex-col min-h-0 min-w-[280px] flex-1"
              onDragOver={e => handleDragOver(e, colKey)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, colKey)}
            >
              {/* Column header */}
              <div
                className="flex items-center gap-2 pb-3 mb-3 border-b border-border"
              >
                <span
                  className="text-steel"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  {COLUMN_META[colKey].label}
                </span>
                <span
                  className="text-dim font-mono"
                  style={{
                    fontSize: '11px',
                    background: 'rgba(0,0,0,0.04)',
                    padding: '1px 6px',
                  }}
                >
                  {items.length}
                </span>
              </div>

              {/* Cards container — drop zone highlight */}
              <div
                className="flex-1 overflow-y-auto space-y-2 pr-1 transition-colors duration-150"
                style={{
                  borderRadius: '4px',
                  border: isDropping ? '2px dashed #999' : '2px dashed transparent',
                  backgroundColor: isDropping ? 'rgba(0,0,0,0.02)' : 'transparent',
                  padding: isDropping ? '6px' : '0',
                }}
              >
                {items.map(project => {
                  const overdue = !isDone && isOverdue(project.due_date)
                  const colIdx = COLUMNS.indexOf(colKey)
                  const canLeft = colIdx > 0
                  const canRight = colIdx < COLUMNS.length - 1
                  const name = clientName(project)
                  const isDragging = draggedId === project.id

                  const projCtx: ContextMenuItem[] = [
                    { label: 'Edit Project', icon: Edit3, action: () => openDetail(project) },
                    ...(canLeft ? [{ label: 'Move Left', icon: ArrowLeft, action: () => handleMove(project, 'left' as const) }] : []),
                    ...(canRight ? [{ label: 'Move Right', icon: ArrowRight, action: () => handleMove(project, 'right' as const) }] : []),
                    { label: '', action: () => {}, divider: true },
                    { label: 'Delete Project', icon: Trash2, action: () => handleDelete(project.id), danger: true },
                  ]

                  return (
                    <ContextMenu key={project.id} items={projCtx}>
                    <div
                      draggable
                      onDragStart={e => handleDragStart(e, project.id)}
                      onDragEnd={handleDragEnd}
                      className={`bg-cell border border-border hover:border-dim transition-all duration-150 cursor-grab active:cursor-grabbing ${
                        isDone ? 'opacity-40' : ''
                      } ${isDragging ? 'opacity-30' : ''}`}
                      style={{ padding: '10px 12px' }}
                      onClick={() => openDetail(project)}
                    >
                      {/* Client name */}
                      <div
                        className="text-steel mb-1"
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {name}
                      </div>

                      {/* Title */}
                      <div
                        className="text-polar truncate"
                        style={{ fontSize: '13px', fontWeight: 700 }}
                      >
                        {project.title}
                      </div>

                      {/* Description truncated */}
                      {project.description && (
                        <div
                          className="text-steel mt-1"
                          style={{
                            fontSize: '11px',
                            lineHeight: '1.35',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {truncate(project.description, 120)}
                        </div>
                      )}

                      {/* Footer: due date + priority + arrows */}
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex items-center gap-2">
                          {project.due_date && (
                            <span
                              className={`font-mono ${overdue ? 'text-err' : 'text-steel'}`}
                              style={{ fontSize: '11px' }}
                            >
                              {friendlyDate(project.due_date)}
                            </span>
                          )}
                          {priorityBadge(project.priority)}
                        </div>

                        {/* Arrow buttons */}
                        <div
                          className="flex items-center gap-0.5"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => canLeft && handleMove(project, 'left')}
                            className={`p-0.5 transition-colors cursor-pointer ${
                              canLeft
                                ? 'text-dim hover:text-polar'
                                : 'text-dim/20 cursor-default'
                            }`}
                            disabled={!canLeft}
                          >
                            <ChevronLeft size={13} />
                          </button>
                          <button
                            onClick={() => canRight && handleMove(project, 'right')}
                            className={`p-0.5 transition-colors cursor-pointer ${
                              canRight
                                ? 'text-dim hover:text-polar'
                                : 'text-dim/20 cursor-default'
                            }`}
                            disabled={!canRight}
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                    </ContextMenu>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {renderModal()}
    </div>
  )
}
