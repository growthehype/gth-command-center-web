import { useState, useMemo, useCallback } from 'react'
import { Plus, Trash2, Search, Lock, Eye, EyeOff, X, AlertTriangle, Clock } from 'lucide-react'
import { useAppStore, type Credential } from '@/lib/store'
import { credentials as credentialsApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import { safeParseJSON, fuzzyMatch } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { differenceInCalendarDays, parseISO } from 'date-fns'

function credentialAge(createdAt: string): { days: number; label: string; color: 'ok' | 'warn' | 'err' } {
  try {
    const days = differenceInCalendarDays(new Date(), parseISO(createdAt))
    if (days < 0) return { days: 0, label: 'Just now', color: 'ok' }
    if (days <= 30) return { days, label: days === 0 ? 'Today' : `${days}d ago`, color: 'ok' }
    if (days <= 90) return { days, label: `${days}d ago`, color: 'warn' }
    return { days, label: `${days}d ago`, color: 'err' }
  } catch {
    return { days: -1, label: 'Unknown', color: 'warn' }
  }
}

interface FieldPair {
  label: string
  value: string
}

const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'

export default function Credentials() {
  const { credentials, clients, refreshCredentials, refreshActivity } = useAppStore()

  const [search, setSearch] = useState('')
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form
  const [formPlatform, setFormPlatform] = useState('')
  const [formClientId, setFormClientId] = useState('')
  const [formFields, setFormFields] = useState<FieldPair[]>([{ label: '', value: '' }])

  /* ── Filtered credentials ── */
  const filtered = useMemo(() => {
    if (!search.trim()) return credentials
    const q = search.trim()
    return credentials.filter(c =>
      fuzzyMatch(q, c.platform) ||
      (c.client_name && fuzzyMatch(q, c.client_name))
    )
  }, [credentials, search])

  /* ── Reveal/hide a specific field ── */
  const toggleReveal = useCallback((key: string) => {
    setRevealedFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  /* ── Create credential ── */
  const handleCreate = useCallback(async () => {
    if (!formPlatform.trim()) return
    const validFields = formFields.filter(f => f.label.trim() && f.value.trim())
    if (validFields.length === 0) {
      showToast('Add at least one field', 'warn')
      return
    }
    try {
      await credentialsApi.create({
        platform: formPlatform.trim(),
        client_id: formClientId || null,
        fields: JSON.stringify(validFields),
      })
      await Promise.all([refreshCredentials(), refreshActivity()])
      setFormPlatform('')
      setFormClientId('')
      setFormFields([{ label: '', value: '' }])
      setModalOpen(false)
      showToast('Credential saved', 'success')
    } catch (err: any) {
      console.error('Credential save failed:', err)
      showToast(err?.message || 'Failed to save credential', 'error')
    }
  }, [formPlatform, formClientId, formFields, refreshCredentials, refreshActivity])

  /* ── Delete credential ── */
  const handleDelete = useCallback(async () => {
    if (!deleteId) return
    try {
      await credentialsApi.delete(deleteId)
      await Promise.all([refreshCredentials(), refreshActivity()])
      setDeleteId(null)
      showToast('Credential deleted', 'info')
    } catch (err: any) {
      console.error('Credential delete failed:', err)
      showToast(err?.message || 'Failed to delete credential', 'error')
    }
  }, [deleteId, refreshCredentials, refreshActivity])

  /* ── Add/remove form field pairs ── */
  const addField = () => setFormFields(prev => [...prev, { label: '', value: '' }])
  const removeField = (idx: number) => setFormFields(prev => prev.filter((_, i) => i !== idx))
  const updateField = (idx: number, key: 'label' | 'value', val: string) => {
    setFormFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f))
  }

  const inputClass = 'w-full bg-cell border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors'
  const selectClass = 'w-full bg-cell border border-border px-3 py-2 text-polar focus:outline-none focus:border-dim transition-colors cursor-pointer'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1>Credentials</h1>
          <Lock size={14} className="text-dim" />
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setModalOpen(true)}>
          <Plus size={12} strokeWidth={2.5} />
          Add Credential
        </button>
      </div>

      {/* Search */}
      <div className="relative" style={{ maxWidth: '320px' }}>
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by platform or client..."
          className={`${inputClass} pl-8`}
          style={{ fontSize: '13px' }}
        />
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="No credentials"
          description={search ? 'No credentials match your search.' : 'Store login credentials securely.'}
          actionLabel={!search ? '+ Add Credential' : undefined}
          onAction={!search ? () => setModalOpen(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(cred => {
            const fields: FieldPair[] = safeParseJSON(cred.fields, [])
            const age = credentialAge(cred.created_at)
            return (
              <div key={cred.id} className="border border-border bg-surface">
                {/* Card header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-dim font-sans uppercase font-bold"
                        style={{ fontSize: '10px', letterSpacing: '0.14em' }}
                      >
                        {cred.platform}
                      </span>
                      {age.color === 'err' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-err/15 text-err px-1.5 py-0.5" style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1 }}>
                          <AlertTriangle size={8} />
                          Review
                        </span>
                      )}
                      {age.color === 'warn' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-warn/15 text-warn px-1.5 py-0.5" style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1 }}>
                          <Clock size={8} />
                          Aging
                        </span>
                      )}
                    </div>
                    {cred.client_name && (
                      <span className="text-polar block mt-0.5" style={{ fontSize: '15px', fontWeight: 800 }}>
                        {cred.client_name}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteId(cred.id)}
                    className="text-dim hover:text-err transition-colors cursor-pointer p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Fields */}
                <div className="px-4 py-3 space-y-2.5">
                  {fields.map((field, idx) => {
                    const fieldKey = `${cred.id}-${idx}`
                    const revealed = revealedFields.has(fieldKey)
                    return (
                      <div key={idx}>
                        <span className="text-dim block" style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          {field.label}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-polar mono cursor-pointer select-all"
                            style={{ fontSize: '12px' }}
                            onClick={() => toggleReveal(fieldKey)}
                          >
                            {revealed ? field.value : MASK}
                          </span>
                          <button
                            onClick={() => toggleReveal(fieldKey)}
                            className="text-dim hover:text-steel transition-colors cursor-pointer"
                          >
                            {revealed ? <EyeOff size={10} /> : <Eye size={10} />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {fields.length === 0 && (
                    <span className="text-dim" style={{ fontSize: '11px' }}>No fields stored</span>
                  )}
                </div>

                {/* Staleness indicator */}
                <div className="px-4 py-2 border-t border-border">
                  <span
                    className={`mono ${age.color === 'ok' ? 'text-ok' : age.color === 'warn' ? 'text-warn' : 'text-err'}`}
                    style={{ fontSize: '10px' }}
                    title={`Created: ${cred.created_at}`}
                  >
                    Last updated: {age.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add Credential Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Credential" width="520px">
        <div className="space-y-4">
          <div>
            <label className="label text-steel block mb-1.5">Platform</label>
            <input
              type="text"
              value={formPlatform}
              onChange={e => setFormPlatform(e.target.value)}
              placeholder="e.g. Google Ads, Shopify, Hosting"
              className={inputClass}
              style={{ fontSize: '13px' }}
              autoFocus
            />
          </div>

          <div>
            <label className="label text-steel block mb-1.5">Client</label>
            <select
              value={formClientId}
              onChange={e => setFormClientId(e.target.value)}
              className={selectClass}
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

          {/* Dynamic fields */}
          <div>
            <label className="label text-steel block mb-1.5">Fields</label>
            <div className="space-y-2">
              {formFields.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={f.label}
                    onChange={e => updateField(idx, 'label', e.target.value)}
                    placeholder="Label (e.g. Username)"
                    className={inputClass}
                    style={{ fontSize: '13px', flex: 1 }}
                  />
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => updateField(idx, 'value', e.target.value)}
                    placeholder="Value"
                    className={inputClass}
                    style={{ fontSize: '13px', flex: 1 }}
                  />
                  {formFields.length > 1 && (
                    <button
                      onClick={() => removeField(idx)}
                      className="text-dim hover:text-err transition-colors cursor-pointer p-1 flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addField}
              className="text-dim hover:text-polar transition-colors cursor-pointer mt-2 font-sans uppercase font-bold"
              style={{ fontSize: '10px', letterSpacing: '0.14em' }}
            >
              + Add Field
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button className="btn-ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={!formPlatform.trim()}
              style={{ opacity: formPlatform.trim() ? 1 : 0.4 }}
            >
              Save Credential
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Credential">
        <div className="space-y-4">
          <p className="text-steel" style={{ fontSize: '13px' }}>
            Are you sure you want to delete this credential? This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button className="btn-ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-err text-obsidian font-sans uppercase font-bold cursor-pointer hover:bg-err/80 transition-colors"
              style={{ fontSize: '10px', letterSpacing: '0.14em' }}
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
