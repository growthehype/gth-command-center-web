import { useState, useMemo } from 'react'
import { Briefcase, Plus, Archive, RotateCcw, Search, X, ArrowUpDown } from 'lucide-react'
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

type SortKey = 'name' | 'price-high' | 'price-low' | 'hours'

export default function Services() {
  const { services, refreshServices, refreshActivity } = useAppStore()
  const [filter, setFilter] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [hideArchived, setHideArchived] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  const visible = useMemo(() => {
    let list = filter === 'All' ? [...services] : services.filter(s => s.category === filter)

    // Filter archived
    if (hideArchived) list = list.filter(s => s.active)

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q)
      )
    }

    // Sort
    list.sort((a, b) => {
      // Always active first
      if (a.active !== b.active) return b.active - a.active
      switch (sort) {
        case 'price-high': return (b.default_price || 0) - (a.default_price || 0)
        case 'price-low': return (a.default_price || 0) - (b.default_price || 0)
        case 'hours': return (b.typical_hours || 0) - (a.typical_hours || 0)
        case 'name':
        default: return a.name.localeCompare(b.name)
      }
    })
    return list
  }, [services, filter, search, sort, hideArchived])

  // Aggregate stats
  const stats = useMemo(() => {
    const active = services.filter(s => s.active)
    const totalRevenue = active.reduce((sum, s) => sum + (s.default_price || 0), 0)
    const avgPrice = active.length ? totalRevenue / active.length : 0
    return {
      total: services.length,
      active: active.length,
      archived: services.length - active.length,
      avgPrice,
    }
  }, [services])

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
    if (Number(form.default_price) < 0) { showToast('Default price cannot be negative', 'error'); return }
    if (Number(form.typical_hours) < 0) { showToast('Typical hours cannot be negative', 'error'); return }
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

  const hasActiveFilter = filter !== 'All' || search.trim() !== '' || !hideArchived

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Services</h1>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            Service catalog and pricing
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={12} /> Add Service
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="label text-dim">TOTAL</div>
          <div className="mono text-polar mt-1" style={{ fontSize: '20px', fontWeight: 700 }}>{stats.total}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="label text-dim">ACTIVE</div>
          <div className="mono mt-1" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ok)' }}>{stats.active}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="label text-dim">ARCHIVED</div>
          <div className="mono text-dim mt-1" style={{ fontSize: '20px', fontWeight: 700 }}>{stats.archived}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="label text-dim">AVG PRICE</div>
          <div className="mono text-polar mt-1" style={{ fontSize: '20px', fontWeight: 700 }}>
            {stats.avgPrice ? formatCurrency(stats.avgPrice) : '--'}
          </div>
        </div>
      </div>

      {/* Controls row: search, sort, hide archived */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
          <input
            type="text"
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-border pl-9 pr-8 py-2 text-polar outline-none focus:border-dim"
            style={{ fontSize: '13px' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-polar p-1"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <div className="relative flex items-center gap-1.5 text-dim" style={{ fontSize: '12px' }}>
          <ArrowUpDown size={12} />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-surface border border-border px-2 py-2 text-polar outline-none focus:border-dim cursor-pointer"
            style={{ fontSize: '12px' }}
          >
            <option value="name">Name (A-Z)</option>
            <option value="price-high">Price (High → Low)</option>
            <option value="price-low">Price (Low → High)</option>
            <option value="hours">Hours (Most → Least)</option>
          </select>
        </div>

        {/* Hide archived toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-steel" style={{ fontSize: '12px' }}>
          <input
            type="checkbox"
            checked={hideArchived}
            onChange={(e) => setHideArchived(e.target.checked)}
            className="cursor-pointer"
          />
          Hide archived
        </label>

        {hasActiveFilter && (
          <button
            onClick={() => { setFilter('All'); setSearch(''); setHideArchived(true) }}
            className="btn-ghost text-dim hover:text-polar"
            style={{ fontSize: '11px', padding: '6px 12px' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
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
        <div className="text-center py-16">
          <Search size={32} className="text-dim mx-auto mb-3 opacity-40" />
          <p className="text-steel mb-2" style={{ fontSize: '14px', fontWeight: 600 }}>No services match your filters</p>
          <p className="text-dim mb-4" style={{ fontSize: '12px' }}>
            Try adjusting your search or clearing filters to see all services.
          </p>
          <button
            onClick={() => { setFilter('All'); setSearch(''); setHideArchived(false) }}
            className="btn-ghost"
            style={{ fontSize: '12px' }}
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map(s => {
            const deliverables = safeParseJSON<string[]>(s.deliverables, [])
            return (
              <div
                key={s.id}
                onClick={() => openEdit(s)}
                className={`card cursor-pointer transition-all hover:border-dim relative ${!s.active ? 'opacity-70' : ''}`}
                style={!s.active ? { backgroundColor: 'var(--color-surface)' } : undefined}
              >
                {!s.active && (
                  <span
                    className="absolute top-3 right-10 badge"
                    style={{
                      backgroundColor: 'rgba(217, 119, 6, 0.15)',
                      color: 'var(--color-warn)',
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                    }}
                  >
                    ARCHIVED
                  </span>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-polar font-[700] truncate" style={{ fontSize: '14px' }}>{s.name}</h3>
                    {s.category && (
                      <span className={CATEGORY_BADGE[s.category] || 'badge badge-neutral'} style={{ marginTop: '4px' }}>
                        {s.category}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => toggleActive(s, e)}
                    className="text-dim hover:text-polar transition-colors p-1"
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
