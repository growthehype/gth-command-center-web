import { useState, useMemo, useCallback, useEffect } from 'react'
import { Plus, Trash2, Search, Shield, Eye, EyeOff, X, AlertTriangle, Clock, Copy, Check, KeyRound, Globe, Edit3 } from 'lucide-react'
import { useAppStore, type Credential } from '@/lib/store'
import { credentials as credentialsApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import { safeParseJSON, fuzzyMatch } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { differenceInCalendarDays, parseISO, format } from 'date-fns'

/* ── Helpers ── */

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

const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'

/* Platform icons/colors */
const PLATFORM_META: Record<string, { color: string; icon: string }> = {
  'google ads': { color: '#4285F4', icon: 'G' },
  'google': { color: '#4285F4', icon: 'G' },
  'meta ads': { color: '#0668E1', icon: 'M' },
  'meta': { color: '#0668E1', icon: 'M' },
  'facebook': { color: '#1877F2', icon: 'f' },
  'instagram': { color: '#E4405F', icon: 'I' },
  'shopify': { color: '#96BF48', icon: 'S' },
  'stripe': { color: '#635BFF', icon: 'S' },
  'aws': { color: '#FF9900', icon: 'A' },
  'github': { color: '#8B949E', icon: 'G' },
  'wordpress': { color: '#21759B', icon: 'W' },
  'hosting': { color: '#00B4D8', icon: 'H' },
  'godaddy': { color: '#1BDBDB', icon: 'G' },
  'cloudflare': { color: '#F38020', icon: 'C' },
  'mailchimp': { color: '#FFE01B', icon: 'M' },
  'linkedin': { color: '#0A66C2', icon: 'L' },
  'tiktok': { color: '#FF004F', icon: 'T' },
  'bing ads': { color: '#00809D', icon: 'B' },
  'semrush': { color: '#FF642D', icon: 'S' },
}

function getPlatformMeta(platform: string) {
  const key = platform.toLowerCase()
  return PLATFORM_META[key] || { color: '#6B7280', icon: platform.charAt(0).toUpperCase() }
}

const COMMON_PLATFORMS = [
  'Google Ads', 'Meta Ads', 'Shopify', 'Stripe', 'WordPress', 'Hosting',
  'GitHub', 'AWS', 'Cloudflare', 'Mailchimp', 'LinkedIn', 'TikTok Ads',
]

/* ── Component ── */

export default function Credentials() {
  const { credentials, clients, refreshCredentials, refreshActivity, selectedCredentialId, setSelectedCredentialId } = useAppStore()

  const [search, setSearch] = useState('')
  const [revealedCards, setRevealedCards] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [filterClient, setFilterClient] = useState('')
  const [saving, setSaving] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form
  const [formPlatform, setFormPlatform] = useState('')
  const [formClientId, setFormClientId] = useState('')
  const [formFields, setFormFields] = useState<FieldPair[]>([
    { label: 'Username', value: '' },
    { label: 'Password', value: '' },
  ])
  const [formUrl, setFormUrl] = useState('')
  const [formNotes, setFormNotes] = useState('')

  /* ── Resolve client names manually (no FK join) ── */
  const clientMap = useMemo(() => {
    const map: Record<string, string> = {}
    clients.forEach(c => { map[c.id] = c.name })
    return map
  }, [clients])

  /* ── Filtered + enriched credentials (exclude internal tokens like google_calendar) ── */
  const filtered = useMemo(() => {
    let list = credentials
      .filter(c => c.platform !== 'google_calendar')
      .map(c => ({
        ...c,
        client_name: c.client_id ? clientMap[c.client_id] || null : null,
      }))

    if (filterClient) {
      list = list.filter(c => c.client_id === filterClient)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.platform.toLowerCase().includes(q) ||
        (c.client_name && c.client_name.toLowerCase().includes(q))
      )
    }
    return list
  }, [credentials, clientMap, search, filterClient])

  /* ── Stats (exclude internal tokens) ── */
  const userCredentials = useMemo(() => credentials.filter(c => c.platform !== 'google_calendar'), [credentials])
  const stats = useMemo(() => {
    const total = userCredentials.length
    const aging = userCredentials.filter(c => {
      const age = credentialAge(c.created_at)
      return age.color === 'warn' || age.color === 'err'
    }).length
    const uniquePlatforms = new Set(userCredentials.map(c => c.platform.toLowerCase())).size
    return { total, aging, uniquePlatforms }
  }, [userCredentials])

  /* ── Reveal/hide all fields on a card ── */
  const toggleRevealCard = useCallback((credId: string) => {
    setRevealedCards(prev => {
      const next = new Set(prev)
      if (next.has(credId)) next.delete(credId)
      else next.add(credId)
      return next
    })
  }, [])

  /* ── Copy to clipboard ── */
  const copyToClipboard = useCallback((value: string, fieldKey: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(fieldKey)
      setTimeout(() => setCopiedKey(null), 1500)
    })
  }, [])

  /* ── Open create modal ── */
  const openCreate = () => {
    setEditingId(null)
    setFormPlatform('')
    setFormClientId('')
    setFormFields([
      { label: 'Username', value: '' },
      { label: 'Password', value: '' },
    ])
    setFormUrl('')
    setFormNotes('')
    setModalOpen(true)
  }

  /* ── Open edit modal ── */
  const openEdit = (cred: Credential & { client_name?: string | null }) => {
    const rawFields = safeParseJSON(cred.fields, [])
    const fields: FieldPair[] = Array.isArray(rawFields) ? rawFields : []
    // Extract url and notes from fields if they exist
    const urlField = fields.find(f => f.label.toLowerCase() === 'url' || f.label.toLowerCase() === 'login url')
    const notesField = fields.find(f => f.label.toLowerCase() === 'notes')
    const otherFields = fields.filter(f =>
      f.label.toLowerCase() !== 'url' &&
      f.label.toLowerCase() !== 'login url' &&
      f.label.toLowerCase() !== 'notes'
    )

    setEditingId(cred.id)
    setFormPlatform(cred.platform)
    setFormClientId(cred.client_id || '')
    setFormFields(otherFields.length > 0 ? otherFields : [{ label: 'Username', value: '' }, { label: 'Password', value: '' }])
    setFormUrl(urlField?.value || '')
    setFormNotes(notesField?.value || '')
    setModalOpen(true)
  }

  /* ── Cross-page deep-link: open credential from another page ── */
  useEffect(() => {
    if (!selectedCredentialId) return
    const target = credentials.find(c => c.id === selectedCredentialId)
    if (target) {
      openEdit(target)
      setSelectedCredentialId(null)
    }
  }, [selectedCredentialId, credentials, setSelectedCredentialId])

  /* ── Save credential (create or update) ── */
  const handleSave = useCallback(async () => {
    if (!formPlatform.trim() || saving) return
    const validFields = formFields.filter(f => f.label.trim() && f.value.trim())
    if (validFields.length === 0) {
      showToast('Add at least one credential field', 'warn')
      return
    }

    // Include url and notes as fields if provided
    const allFields = [...validFields]
    if (formUrl.trim()) allFields.push({ label: 'Login URL', value: formUrl.trim() })
    if (formNotes.trim()) allFields.push({ label: 'Notes', value: formNotes.trim() })

    setSaving(true)
    try {
      const payload = {
        platform: formPlatform.trim(),
        client_id: formClientId || null,
        fields: JSON.stringify(allFields),
      }
      if (editingId) {
        await credentialsApi.update(editingId, payload)
        showToast('Credential updated', 'success')
      } else {
        await credentialsApi.create(payload)
        showToast('Credential saved', 'success')
      }
      await Promise.all([refreshCredentials(), refreshActivity()])
      setModalOpen(false)
    } catch (err: any) {
      console.error('Credential save failed:', err)
      showToast(err?.message || 'Failed to save credential', 'error')
    } finally {
      setSaving(false)
    }
  }, [formPlatform, formClientId, formFields, formUrl, formNotes, editingId, saving, refreshCredentials, refreshActivity])

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

  /* ── Unique clients that have credentials ── */
  const credentialClients = useMemo(() => {
    const ids = new Set(credentials.map(c => c.client_id).filter(Boolean))
    return clients.filter(c => ids.has(c.id))
  }, [credentials, clients])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1>Credential Vault</h1>
            <Shield size={15} className="text-ok" />
          </div>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {stats.total} credential{stats.total !== 1 ? 's' : ''} across {stats.uniquePlatforms} platform{stats.uniquePlatforms !== 1 ? 's' : ''}
            {stats.aging > 0 && (
              <span className="text-warn ml-2">
                &middot; {stats.aging} need{stats.aging !== 1 ? '' : 's'} rotation
              </span>
            )}
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openCreate}>
          <Plus size={12} strokeWidth={2.5} />
          Add Credential
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1" style={{ maxWidth: '320px' }}>
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search platforms or clients..."
            className="input pl-8 w-full"
            style={{ fontSize: '13px' }}
          />
        </div>
        {credentialClients.length > 0 && (
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="input"
            style={{ fontSize: '13px', minWidth: '160px' }}
          >
            <option value="">All Clients</option>
            {credentialClients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Security notice */}
      <div
        className="flex items-start gap-3 px-4 py-3 border border-border bg-surface"
        style={{ borderRadius: '6px' }}
      >
        <Shield size={14} className="text-ok flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-polar" style={{ fontSize: '12px', fontWeight: 700 }}>
            Encrypted at rest
          </p>
          <p className="text-dim mt-0.5" style={{ fontSize: '11px', lineHeight: 1.5 }}>
            Credentials are stored in your private Supabase database with row-level security. Only you can access them. Click a card to reveal fields, or use the copy button for quick access.
          </p>
        </div>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No credentials"
          description={search || filterClient ? 'No credentials match your filters.' : 'Store login credentials for all your client platforms securely.'}
          actionLabel={!search && !filterClient ? '+ Add Credential' : undefined}
          onAction={!search && !filterClient ? openCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(cred => {
            const rawFields = safeParseJSON(cred.fields, [])
    const fields: FieldPair[] = Array.isArray(rawFields) ? rawFields : []
            const age = credentialAge(cred.created_at)
            const isRevealed = revealedCards.has(cred.id)
            const meta = getPlatformMeta(cred.platform)
            const clientName = cred.client_id ? clientMap[cred.client_id] || null : null

            // Separate url/notes from credential fields
            const urlField = fields.find(f => f.label.toLowerCase() === 'url' || f.label.toLowerCase() === 'login url')
            const notesField = fields.find(f => f.label.toLowerCase() === 'notes')
            const credFields = fields.filter(f =>
              f.label.toLowerCase() !== 'url' &&
              f.label.toLowerCase() !== 'login url' &&
              f.label.toLowerCase() !== 'notes'
            )

            return (
              <div
                key={cred.id}
                className="border border-border bg-surface hover:border-dim/50 transition-all"
                style={{ borderRadius: '6px', overflow: 'hidden' }}
              >
                {/* Card header with platform badge */}
                <div className="px-4 py-3.5 flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Platform icon */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: `${meta.color}15`,
                        border: `1px solid ${meta.color}30`,
                      }}
                    >
                      <span
                        className="font-[800]"
                        style={{ fontSize: '14px', color: meta.color }}
                      >
                        {meta.icon}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3
                        className="text-polar font-[700] truncate"
                        style={{ fontSize: '14px' }}
                      >
                        {cred.platform}
                      </h3>
                      {clientName ? (
                        <span className="text-steel truncate block" style={{ fontSize: '12px' }}>
                          {clientName}
                        </span>
                      ) : (
                        <span className="text-dim" style={{ fontSize: '12px' }}>Personal</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(cred)}
                      className="text-dim hover:text-polar transition-colors cursor-pointer p-1.5"
                      title="Edit"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => setDeleteId(cred.id)}
                      className="text-dim hover:text-err transition-colors cursor-pointer p-1.5"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Credential fields */}
                <div className="px-4 pb-3 space-y-2">
                  {credFields.map((field, idx) => {
                    const fieldKey = `${cred.id}-${idx}`
                    const isCopied = copiedKey === fieldKey
                    const isSensitive = /password|secret|key|token|pin/i.test(field.label)

                    return (
                      <div key={idx} className="group">
                        <span
                          className="text-dim block mb-0.5"
                          style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                        >
                          {field.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-polar mono flex-1 truncate"
                            style={{ fontSize: '12px' }}
                          >
                            {isSensitive && !isRevealed ? MASK : field.value}
                          </span>
                          <button
                            onClick={() => copyToClipboard(field.value, fieldKey)}
                            className="text-dim hover:text-ok transition-colors cursor-pointer p-1 opacity-0 group-hover:opacity-100"
                            title="Copy"
                          >
                            {isCopied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {credFields.length === 0 && (
                    <span className="text-dim" style={{ fontSize: '11px' }}>No fields stored</span>
                  )}
                </div>

                {/* Login URL */}
                {urlField && (
                  <div className="px-4 pb-3">
                    <a
                      href={urlField.value.startsWith('http') ? urlField.value : `https://${urlField.value}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-dim hover:text-polar transition-colors"
                      style={{ fontSize: '11px' }}
                    >
                      <Globe size={10} />
                      <span className="truncate" style={{ maxWidth: '200px' }}>{urlField.value}</span>
                    </a>
                  </div>
                )}

                {/* Footer: reveal toggle + age */}
                <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
                  <button
                    onClick={() => toggleRevealCard(cred.id)}
                    className="flex items-center gap-1.5 text-dim hover:text-polar transition-colors cursor-pointer"
                    style={{ fontSize: '11px', fontWeight: 600 }}
                  >
                    {isRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                    {isRevealed ? 'Hide' : 'Reveal'}
                  </button>

                  <div className="flex items-center gap-1.5">
                    {age.color === 'err' && (
                      <AlertTriangle size={10} className="text-err" />
                    )}
                    {age.color === 'warn' && (
                      <Clock size={10} className="text-warn" />
                    )}
                    <span
                      className={`mono ${age.color === 'ok' ? 'text-dim' : age.color === 'warn' ? 'text-warn' : 'text-err'}`}
                      style={{ fontSize: '10px' }}
                      title={`Created: ${cred.created_at ? format(parseISO(cred.created_at), 'MMM d, yyyy') : 'Unknown'}`}
                    >
                      {age.label}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add / Edit Credential Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Credential' : 'New Credential'}
        width="520px"
      >
        <div className="space-y-4">
          {/* Platform */}
          <div>
            <label className="label text-steel block mb-1.5">Platform</label>
            <input
              type="text"
              value={formPlatform}
              onChange={e => setFormPlatform(e.target.value)}
              placeholder="e.g. Google Ads, Shopify"
              className="input w-full"
              style={{ fontSize: '13px' }}
              autoFocus
            />
            {/* Quick-pick platforms */}
            {!editingId && !formPlatform && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {COMMON_PLATFORMS.map(p => (
                  <button
                    key={p}
                    onClick={() => setFormPlatform(p)}
                    className="px-2.5 py-1 border border-border text-dim hover:text-polar hover:border-dim transition-colors cursor-pointer"
                    style={{ fontSize: '10px', fontWeight: 600, borderRadius: '4px' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Client */}
          <div>
            <label className="label text-steel block mb-1.5">Client</label>
            <select
              value={formClientId}
              onChange={e => setFormClientId(e.target.value)}
              className="input w-full cursor-pointer"
              style={{ fontSize: '13px' }}
            >
              <option value="">Personal / Internal</option>
              {clients
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
          </div>

          {/* Credential fields */}
          <div>
            <label className="label text-steel block mb-1.5">Credentials</label>
            <div className="space-y-2">
              {formFields.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={f.label}
                    onChange={e => updateField(idx, 'label', e.target.value)}
                    placeholder="Label (e.g. Email)"
                    className="input flex-1"
                    style={{ fontSize: '13px' }}
                  />
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => updateField(idx, 'value', e.target.value)}
                    placeholder="Value"
                    className="input flex-1"
                    style={{ fontSize: '13px' }}
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
              className="text-dim hover:text-polar transition-colors cursor-pointer mt-2 flex items-center gap-1"
              style={{ fontSize: '11px', fontWeight: 600 }}
            >
              <Plus size={10} /> Add Field
            </button>
          </div>

          {/* Login URL */}
          <div>
            <label className="label text-steel block mb-1.5">Login URL <span className="text-dim font-normal">(optional)</span></label>
            <input
              type="text"
              value={formUrl}
              onChange={e => setFormUrl(e.target.value)}
              placeholder="https://ads.google.com"
              className="input w-full"
              style={{ fontSize: '13px' }}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="label text-steel block mb-1.5">Notes <span className="text-dim font-normal">(optional)</span></label>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder="e.g. 2FA enabled, recovery email is..."
              className="input w-full"
              rows={2}
              style={{ fontSize: '13px', resize: 'vertical' }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button className="btn-ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!formPlatform.trim() || saving}
              style={{ opacity: (!formPlatform.trim() || saving) ? 0.5 : 1 }}
            >
              {saving ? 'Saving...' : editingId ? 'Update Credential' : 'Save Credential'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Credential">
        <div className="space-y-4">
          <p className="text-steel" style={{ fontSize: '13px', lineHeight: 1.6 }}>
            Are you sure you want to permanently delete this credential? This action cannot be undone and the stored login information will be lost.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button className="btn-ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-err text-white font-sans uppercase font-bold cursor-pointer hover:bg-err/80 transition-colors"
              style={{ fontSize: '10px', letterSpacing: '0.14em', borderRadius: '4px' }}
              onClick={handleDelete}
            >
              Delete Credential
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
