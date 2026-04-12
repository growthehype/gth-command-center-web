import { useState, useMemo } from 'react'
import { BookOpen, Plus, ExternalLink, Trash2 } from 'lucide-react'
import { useAppStore, Sop } from '@/lib/store'
import { sops as sopsApi, shell } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { relativeDate } from '@/lib/utils'

const STATUS_CYCLE = ['active', 'draft', 'archived'] as const

const STATUS_BADGE: Record<string, string> = {
  active: 'badge badge-ok',
  draft: 'badge badge-warn',
  archived: 'badge badge-neutral',
}

const EMPTY_FORM = {
  title: '',
  area: '',
  status: 'draft' as string,
  url: '',
}

export default function SOPs() {
  const { sops, refreshSops, refreshActivity } = useAppStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  const sorted = useMemo(() => {
    return [...sops].sort((a, b) => {
      const order: Record<string, number> = { active: 0, draft: 1, archived: 2 }
      const diff = (order[a.status] ?? 2) - (order[b.status] ?? 2)
      if (diff !== 0) return diff
      return (b.updated_at || '').localeCompare(a.updated_at || '')
    })
  }, [sops])

  const set = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }))

  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) { showToast('Title is required', 'warn'); return }
    try {
      const payload = {
        title: form.title,
        area: form.area || null,
        status: form.status,
        url: form.url || null,
      }
      await sopsApi.create(payload)
      showToast('SOP created', 'success')
      await Promise.all([refreshSops(), refreshActivity()])
      setModalOpen(false)
    } catch { showToast('Failed to create SOP', 'error') }
  }

  const cycleStatus = async (sop: Sop, e: React.MouseEvent) => {
    e.stopPropagation()
    const idx = STATUS_CYCLE.indexOf(sop.status as typeof STATUS_CYCLE[number])
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    try {
      await sopsApi.update(sop.id, { status: next })
      await refreshSops()
      showToast(`${sop.title} → ${next}`, 'success')
    } catch { showToast('Failed to update SOP status', 'error') }
  }

  const deleteSop = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await sopsApi.delete(id)
      await Promise.all([refreshSops(), refreshActivity()])
      showToast('SOP deleted', 'info')
    } catch { showToast('Failed to delete SOP', 'error') }
  }

  const openDoc = (url: string | null, e: React.MouseEvent) => {
    e.stopPropagation()
    if (url) shell.openExternal(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>SOPs</h1>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {sops.length} procedures &middot; {sops.filter(s => s.status === 'active').length} active
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={12} /> New SOP
        </button>
      </div>

      {sops.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No SOPs yet"
          description="Document your standard operating procedures for consistency."
          actionLabel="New SOP"
          onAction={openCreate}
        />
      ) : (
        <div className="border border-border overflow-x-auto">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-border bg-cell/50 min-w-[700px]">
            <span className="label text-dim col-span-4">TITLE</span>
            <span className="label text-dim col-span-2">AREA</span>
            <span className="label text-dim col-span-2">LAST UPDATED</span>
            <span className="label text-dim col-span-2">STATUS</span>
            <span className="label text-dim col-span-2 text-right">ACTIONS</span>
          </div>
          {sorted.map(sop => (
            <div key={sop.id} className="table-row grid grid-cols-12 gap-4 px-4 py-3 items-center min-w-[700px]">
              <span className="col-span-4 text-polar font-[600] truncate" style={{ fontSize: '13px' }}>
                {sop.title}
              </span>
              <span className="col-span-2 mono text-steel">{sop.area || '--'}</span>
              <span className="col-span-2 mono text-dim">{relativeDate(sop.updated_at)}</span>
              <span className="col-span-2">
                <button
                  onClick={(e) => cycleStatus(sop, e)}
                  className={`${STATUS_BADGE[sop.status] || 'badge badge-neutral'} cursor-pointer hover:opacity-80 transition-opacity`}
                  title="Click to cycle status"
                >
                  {sop.status}
                </button>
              </span>
              <div className="col-span-2 flex items-center justify-end gap-3">
                {sop.url && (
                  <button
                    onClick={(e) => openDoc(sop.url, e)}
                    className="text-dim hover:text-polar transition-colors flex items-center gap-1"
                    title="Open document"
                  >
                    <ExternalLink size={13} />
                    <span className="label text-dim">Open</span>
                  </button>
                )}
                <button
                  onClick={(e) => deleteSop(sop.id, e)}
                  className="text-dim hover:text-err transition-colors"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New SOP">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="label text-dim">TITLE</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="SOP title"
              className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '12px' }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="label text-dim">AREA</label>
              <input
                value={form.area}
                onChange={e => set('area', e.target.value)}
                placeholder="e.g. Onboarding, Reporting"
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
            <div className="space-y-1">
              <label className="label text-dim">STATUS</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim"
                style={{ fontSize: '12px' }}
              >
                {STATUS_CYCLE.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="label text-dim">DOCUMENT URL</label>
            {form.url && (
              <div className="mb-1.5">
                <button
                  onClick={() => shell.openExternal(form.url)}
                  className="inline-flex items-center gap-1 bg-surface border border-border px-2 py-0.5 text-steel hover:text-polar hover:border-dim transition-colors cursor-pointer"
                  style={{ fontSize: '10px', borderRadius: '3px' }}
                  title={form.url}
                >
                  <ExternalLink size={9} />
                  {(() => { try { return new URL(form.url).hostname.replace('www.', '') } catch { return form.url } })()}
                </button>
              </div>
            )}
            <input
              value={form.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://docs.google.com/..."
              className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '12px' }}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary">Create</button>
            <button onClick={() => setModalOpen(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
