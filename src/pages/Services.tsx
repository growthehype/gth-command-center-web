import { useState, useMemo } from 'react'
import { Briefcase, Plus, Archive, RotateCcw } from 'lucide-react'
import { useAppStore, Service } from '@/lib/store'
import { services as servicesApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { formatCurrency, safeParseJSON } from '@/lib/utils'

const CATEGORIES = ['All', 'Paid Media', 'Web Design', 'Creative', 'Photography', 'Videography', 'Reporting', 'Consulting', 'Growth', 'SEO'] as const

const PRICING_MODELS = ['monthly', 'hourly', 'project', 'performance'] as const

const CATEGORY_BADGE: Record<string, string> = {
  'Paid Media': 'badge badge-ok',
  'Web Design': 'badge badge-warn',
  Creative: 'badge badge-err',
  Photography: 'badge badge-warn',
  Videography: 'badge badge-warn',
  Reporting: 'badge badge-neutral',
  Consulting: 'badge badge-ok',
  Growth: 'badge badge-warn',
  SEO: 'badge badge-err',
}

const EMPTY_FORM = {
  name: '',
  category: 'Paid Media',
  description: '',
  pricing_model: 'monthly' as string,
  default_price: 0,
  typical_hours: 0,
  deliverables: '',
  active: 1,
}

export default function Services() {
  const { services, refreshServices, refreshActivity } = useAppStore()
  const [filter, setFilter] = useState<string>('All')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  const visible = useMemo(() => {
    let list = filter === 'All' ? [...services] : services.filter(s => s.category === filter)
    // Active first, then archived
    list.sort((a, b) => b.active - a.active || a.name.localeCompare(b.name))
    return list
  }, [services, filter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: services.length }
    CATEGORIES.forEach(cat => {
      if (cat !== 'All') c[cat] = services.filter(s => s.category === cat).length
    })
    return c
  }, [services])

  const set = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }))

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }

  const openEdit = (s: Service) => {
    setEditingId(s.id)
    setForm({
      name: s.name,
      category: s.category || 'Paid Media',
      description: s.description || '',
      pricing_model: s.pricing_model,
      default_price: s.default_price || 0,
      typical_hours: s.typical_hours || 0,
      deliverables: safeParseJSON<string[]>(s.deliverables, []).join('\n'),
      active: s.active,
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) { showToast('Name is required', 'warn'); return }
    try {
      const deliverablesArr = form.deliverables.split('\n').map(d => d.trim()).filter(Boolean)
      const payload = {
        name: form.name,
        category: form.category || null,
        description: form.description || null,
        pricing_model: form.pricing_model,
        default_price: Number(form.default_price) || null,
        typical_hours: Number(form.typical_hours) || null,
        deliverables: deliverablesArr.length > 0 ? JSON.stringify(deliverablesArr) : null,
        active: form.active,
      }
      if (editingId) {
        await servicesApi.update(editingId, payload)
        showToast('Service updated', 'success')
      } else {
        await servicesApi.create(payload)
        showToast('Service created', 'success')
      }
      await Promise.all([refreshServices(), refreshActivity()])
      setModalOpen(false)
    } catch { showToast('Save failed', 'error') }
  }

  const toggleActive = async (s: Service, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await servicesApi.update(s.id, { active: s.active ? 0 : 1 })
      await refreshServices()
      showToast(s.active ? `${s.name} archived` : `${s.name} activated`, 'success')
    } catch { showToast('Update failed', 'error') }
  }

  const deleteService = async (id: string) => {
    try {
      await servicesApi.delete(id)
      await Promise.all([refreshServices(), refreshActivity()])
      showToast('Service deleted', 'info')
    } catch { showToast('Delete failed', 'error') }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Services</h1>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {services.length} total &middot; {services.filter(s => s.active).length} active
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={12} /> Add Service
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`label-md px-3 py-1.5 border transition-colors cursor-pointer ${
              filter === cat
                ? 'bg-polar text-obsidian border-polar'
                : 'bg-transparent text-steel border-border-hard hover:border-dim'
            }`}
          >
            {cat} <span className="ml-1 mono" style={{ fontSize: '10px' }}>({counts[cat] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Cards grid or empty */}
      {services.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No services yet"
          description="Define your service catalog to track offerings and pricing."
          actionLabel="Add Service"
          onAction={openCreate}
        />
      ) : visible.length === 0 ? (
        <p className="text-dim text-center py-12" style={{ fontSize: '13px' }}>No services match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map(s => {
            const deliverables = safeParseJSON<string[]>(s.deliverables, [])
            return (
              <div
                key={s.id}
                onClick={() => openEdit(s)}
                className={`card cursor-pointer ${!s.active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-polar font-[700]" style={{ fontSize: '14px' }}>{s.name}</h3>
                    {s.category && (
                      <span className={CATEGORY_BADGE[s.category] || 'badge badge-neutral'} style={{ marginTop: '4px' }}>
                        {s.category}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => toggleActive(s, e)}
                    className="text-dim hover:text-polar transition-colors"
                    title={s.active ? 'Archive' : 'Activate'}
                  >
                    {s.active ? <Archive size={14} /> : <RotateCcw size={14} />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <span className="label text-dim">PRICING</span>
                    <p className="mono text-steel mt-0.5">{s.pricing_model}</p>
                  </div>
                  <div>
                    <span className="label text-dim">DEFAULT PRICE</span>
                    <p className="mono text-polar mt-0.5">{s.default_price ? formatCurrency(s.default_price) : '--'}</p>
                  </div>
                  <div>
                    <span className="label text-dim">TYPICAL HOURS</span>
                    <p className="mono text-steel mt-0.5">{s.typical_hours ? `${s.typical_hours}h` : '--'}</p>
                  </div>
                </div>

                {deliverables.length > 0 && (
                  <div>
                    <span className="label text-dim">DELIVERABLES</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {deliverables.map((d, i) => (
                        <span key={i} className="badge badge-neutral">{d}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Service' : 'New Service'}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="label text-dim">NAME</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Service name"
              className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '12px' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="label text-dim">CATEGORY</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim"
                style={{ fontSize: '12px' }}
              >
                {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="label text-dim">PRICING MODEL</label>
              <select
                value={form.pricing_model}
                onChange={e => set('pricing_model', e.target.value)}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim"
                style={{ fontSize: '12px' }}
              >
                {PRICING_MODELS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="label text-dim">DEFAULT PRICE ($)</label>
              <input
                type="number"
                value={form.default_price}
                onChange={e => set('default_price', Number(e.target.value))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
            <div className="space-y-1">
              <label className="label text-dim">TYPICAL HOURS</label>
              <input
                type="number"
                value={form.typical_hours}
                onChange={e => set('typical_hours', Number(e.target.value))}
                className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
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

          <div className="space-y-1">
            <label className="label text-dim">DELIVERABLES (one per line)</label>
            <textarea
              value={form.deliverables}
              onChange={e => set('deliverables', e.target.value)}
              rows={4}
              placeholder="Campaign setup&#10;Monthly reporting&#10;Ad creative"
              className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim resize-none transition-colors"
              style={{ fontSize: '12px' }}
            />
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
                onClick={async () => { await deleteService(editingId); setModalOpen(false) }}
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
