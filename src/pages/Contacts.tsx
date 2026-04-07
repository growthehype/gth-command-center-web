import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Users, Plus, Trash2, Search, Mail, X, Download, ChevronUp, ChevronDown, Check, Phone, Copy } from 'lucide-react'
import { useAppStore, Contact } from '@/lib/store'
import { contacts as contactsApi, shell } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import VoiceTextarea from '@/components/ui/VoiceTextarea'
import { relativeDate } from '@/lib/utils'
import { exportToCSV } from '@/lib/export-csv'
import ClientAvatar from '@/components/ui/ClientAvatar'

const EMPTY_FORM = {
  name: '', role: '', client_id: '', email: '', phone: '',
  is_primary: false, notes: '',
}

function levenshteinContacts(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

export default function Contacts() {
  const { contacts, clients, refreshContacts } = useAppStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'primary'>('all')
  const [detailContact, setDetailContact] = useState<Contact | null>(null)
  const [sortField, setSortField] = useState<'name' | 'email' | 'role'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nameDupWarning, setNameDupWarning] = useState<string | null>(null)
  const [emailDupWarning, setEmailDupWarning] = useState<string | null>(null)
  const nameDupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emailDupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Duplicate name detection (debounced)
  useEffect(() => {
    if (nameDupTimer.current) clearTimeout(nameDupTimer.current)
    const name = (form.name || '').trim().toLowerCase()
    if (!name || name.length < 2) { setNameDupWarning(null); return }
    nameDupTimer.current = setTimeout(() => {
      const match = contacts.find(c => {
        if (editingId && c.id === editingId) return false
        const existing = (c.name || '').toLowerCase()
        return existing.includes(name) || name.includes(existing) || levenshteinContacts(existing, name) < 3
      })
      setNameDupWarning(match ? `Similar contact exists: ${match.name}` : null)
    }, 300)
    return () => { if (nameDupTimer.current) clearTimeout(nameDupTimer.current) }
  }, [form.name, contacts, editingId])

  // Duplicate email detection (debounced)
  useEffect(() => {
    if (emailDupTimer.current) clearTimeout(emailDupTimer.current)
    const email = (form.email || '').trim().toLowerCase()
    if (!email || email.length < 3) { setEmailDupWarning(null); return }
    emailDupTimer.current = setTimeout(() => {
      const match = contacts.find(c => {
        if (editingId && c.id === editingId) return false
        return (c.email || '').toLowerCase() === email
      })
      setEmailDupWarning(match ? `A contact with this email already exists: ${match.name}` : null)
    }, 300)
    return () => { if (emailDupTimer.current) clearTimeout(emailDupTimer.current) }
  }, [form.email, contacts, editingId])

  const handleSort = (field: 'name' | 'email' | 'role') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortField !== col) return <ChevronUp size={10} className="text-dim ml-1 inline" />
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-polar ml-1 inline" />
      : <ChevronDown size={10} className="text-polar ml-1 inline" />
  }

  // Filter + search + sort
  const visible = useMemo(() => {
    let list = [...contacts]
    if (filter === 'primary') list = list.filter(c => c.is_primary === 1)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.role || '').toLowerCase().includes(q) ||
        (c.client_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      const aVal = (a[sortField] || '').toLowerCase()
      const bVal = (b[sortField] || '').toLowerCase()
      const cmp = aVal.localeCompare(bVal)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [contacts, filter, search, sortField, sortDir])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (contact: Contact) => {
    setForm({
      name: contact.name || '',
      role: contact.role || '',
      client_id: contact.client_id || '',
      email: contact.email || '',
      phone: contact.phone || '',
      is_primary: contact.is_primary === 1,
      notes: contact.notes || '',
    })
    setEditingId(contact.id)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Name is required', 'warn'); return }
    if (saving) return
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        role: form.role || null,
        client_id: form.client_id || null,
        email: form.email || null,
        phone: form.phone || null,
        is_primary: form.is_primary ? 1 : 0,
        notes: form.notes || null,
      }
      if (editingId) {
        await contactsApi.update(editingId, data)
        showToast('Contact updated', 'success')
      } else {
        await contactsApi.create(data)
        showToast('Contact created', 'success')
      }
      await refreshContacts()
      setModalOpen(false)
    } catch (err: any) {
      console.error('Contact save failed:', err)
      showToast(err?.message || 'Failed to save contact', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${contact.name}"? This cannot be undone.`)) return
    try {
      await contactsApi.delete(contact.id)
      await refreshContacts()
      showToast(`Deleted ${contact.name}`, 'success')
    } catch (err: any) { console.error('Contact delete failed:', err); showToast(err?.message || 'Failed to delete', 'error') }
  }

  /* ── bulk selection helpers ── */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev =>
      prev.size === visible.length ? new Set() : new Set(visible.map(c => c.id))
    )
  }, [visible])

  const handleBulkExport = useCallback(() => {
    const selected = visible.filter(c => selectedIds.has(c.id))
    exportToCSV(
      selected.map(c => ({
        name: c.name || '',
        email: c.email || '',
        phone: c.phone || '',
        role: c.role || '',
        company: c.client_name || '',
      })),
      'contacts-bulk-export'
    )
    showToast(`Exported ${selected.length} contact${selected.length !== 1 ? 's' : ''}`, 'success')
  }, [selectedIds, visible])

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkLoading(true)
    try {
      await Promise.all(Array.from(selectedIds).map(id => contactsApi.delete(id)))
      await refreshContacts()
      showToast(`${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''} deleted`, 'info')
      setSelectedIds(new Set())
    } catch {
      showToast('Failed to delete contacts', 'error')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, refreshContacts])

  return (
    <div style={{ paddingBottom: selectedIds.size > 0 ? '80px' : undefined }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Contacts</h1>
          <p className="text-dim mt-1" style={{ fontSize: '13px' }}>{contacts.length} contacts across all clients</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToCSV(
              visible.map(c => ({
                name: c.name || '',
                email: c.email || '',
                phone: c.phone || '',
                role: c.role || '',
                company: c.client_name || '',
              })),
              'contacts-export'
            )}
            className="btn-ghost flex items-center gap-2"
          >
            <Download size={14} /> Export CSV
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Add Contact
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-4">
        <div className="relative w-full md:max-w-[320px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            className="input w-full pl-8"
            placeholder="Search contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(['all', 'primary'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 font-sans uppercase font-bold transition-colors ${
                filter === f ? 'bg-polar text-obsidian' : 'bg-surface text-dim hover:text-steel'
              }`}
              style={{ fontSize: '11px', letterSpacing: '0.12em' }}
            >
              {f === 'all' ? 'All' : 'Primary Contacts'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts found"
          description={search ? 'Try adjusting your search.' : 'Add your first contact to get started.'}
          actionLabel={!search ? '+ Add Contact' : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[700px]" style={{ fontSize: '13px' }}>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label px-4 py-3 w-10">
                  <button
                    onClick={toggleSelectAll}
                    className={`flex-shrink-0 w-3.5 h-3.5 border cursor-pointer transition-colors duration-100 flex items-center justify-center ${
                      selectedIds.size === visible.length && visible.length > 0
                        ? 'bg-polar/20 border-polar text-polar'
                        : selectedIds.size > 0
                          ? 'bg-polar/10 border-polar/50 text-polar/50'
                          : 'border-dim hover:border-steel text-transparent hover:text-dim'
                    }`}
                    style={{ borderRadius: '2px' }}
                  >
                    {selectedIds.size > 0 && (
                      <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        {selectedIds.size === visible.length
                          ? <polyline points="2 6 5 9 10 3" />
                          : <line x1="3" y1="6" x2="9" y2="6" />
                        }
                      </svg>
                    )}
                  </button>
                </th>
                <th className="label px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('name')} aria-sort={sortField === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>Name <SortIcon col="name" /></th>
                <th className="label px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('role')} aria-sort={sortField === 'role' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>Role <SortIcon col="role" /></th>
                <th className="label px-4 py-3">Client</th>
                <th className="label px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('email')} aria-sort={sortField === 'email' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>Email <SortIcon col="email" /></th>
                <th className="label px-4 py-3">Phone</th>
                <th className="label px-4 py-3">Last Contacted</th>
                <th className="label px-4 py-3">Primary</th>
                <th className="label px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <tr
                  key={c.id}
                  className={`table-row cursor-pointer group ${selectedIds.has(c.id) ? 'row-selected' : ''}`}
                  onClick={() => setDetailContact(c)}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelect(c.id) }}
                      className={`flex-shrink-0 w-3.5 h-3.5 border cursor-pointer transition-colors duration-100 flex items-center justify-center ${
                        selectedIds.has(c.id)
                          ? 'bg-polar/20 border-polar text-polar'
                          : 'border-dim/50 hover:border-steel text-transparent hover:text-dim'
                      }`}
                      style={{ borderRadius: '2px' }}
                    >
                      {selectedIds.has(c.id) && (
                        <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-polar font-semibold">{c.name}</td>
                  <td className="px-4 py-3 text-steel">{c.role || '-'}</td>
                  <td className="px-4 py-3 text-steel">
                    {c.client_name ? (
                      <div className="flex items-center gap-2">
                        <ClientAvatar name={c.client_name} size="sm" />
                        {c.client_name}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-dim mono">{c.email || '-'}</td>
                  <td className="px-4 py-3 text-dim mono">{c.phone || '-'}</td>
                  <td className="px-4 py-3 text-dim">{relativeDate(c.last_contacted)}</td>
                  <td className="px-4 py-3">
                    {c.is_primary === 1 && <span className="badge badge-ok" style={{ cursor: 'default' }}>Primary</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {c.email && (
                          <button
                            onClick={(e) => { e.stopPropagation(); window.open(`mailto:${c.email}`, '_self') }}
                            className="p-1 text-dim hover:text-polar transition-colors"
                            title="Send email"
                            aria-label={`Send email to ${c.name}`}
                          >
                            <Mail size={13} />
                          </button>
                        )}
                        {c.phone && (
                          <button
                            onClick={(e) => { e.stopPropagation(); window.open(`tel:${c.phone}`, '_self') }}
                            className="p-1 text-dim hover:text-polar transition-colors"
                            title="Call"
                            aria-label={`Call ${c.name}`}
                          >
                            <Phone size={13} />
                          </button>
                        )}
                        {c.email && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigator.clipboard.writeText(c.email!)
                              showToast('Email copied', 'success')
                            }}
                            className="p-1 text-dim hover:text-polar transition-colors"
                            title="Copy email"
                            aria-label={`Copy email for ${c.name}`}
                          >
                            <Copy size={13} />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleDelete(c, e)}
                        className="text-dim hover:text-err transition-colors p-1"
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer */}
      {detailContact && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] modal-backdrop" onClick={() => setDetailContact(null)}>
          <div className="modal-container bg-surface w-[95vw] max-w-[420px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-[800]" style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>{detailContact.name}</h3>
              <button onClick={() => setDetailContact(null)} className="modal-close-btn cursor-pointer">
                <X size={15} />
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-3" style={{ fontSize: '13px' }}>
              {detailContact.role && (
                <div><span className="label">Role</span><p className="text-steel mt-0.5">{detailContact.role}</p></div>
              )}
              {detailContact.client_name && (
                <div><span className="label">Client</span><p className="text-steel mt-0.5">{detailContact.client_name}</p></div>
              )}
              {detailContact.email && (
                <div>
                  <span className="label">Email</span>
                  <p className="mt-0.5">
                    <button onClick={() => shell.openExternal(`mailto:${detailContact.email}`)} className="text-polar hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0" style={{ fontSize: 'inherit' }}>
                      <Mail size={11} /> {detailContact.email}
                    </button>
                  </p>
                </div>
              )}
              {detailContact.phone && (
                <div><span className="label">Phone</span><p className="text-steel mono mt-0.5">{detailContact.phone}</p></div>
              )}
              {detailContact.notes && (
                <div><span className="label">Notes</span><p className="text-steel mt-0.5 whitespace-pre-wrap">{detailContact.notes}</p></div>
              )}
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => { setDetailContact(null); openEdit(detailContact) }}
                  className="btn-primary"
                >
                  Edit
                </button>
                <button onClick={() => setDetailContact(null)} className="btn-ghost">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Contact' : 'Add Contact'}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="label mb-1">Name *</p>
            <input
              className="input w-full"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Full name"
            />
            {nameDupWarning && (
              <p className="text-warn mt-1 font-sans" style={{ fontSize: '11px' }}>{nameDupWarning}</p>
            )}
          </div>
          <div>
            <p className="label mb-1">Role</p>
            <input
              className="input w-full"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="e.g. Marketing Director"
            />
          </div>
          <div>
            <p className="label mb-1">Client</p>
            <select
              className="input w-full"
              value={form.client_id}
              onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
            >
              <option value="">Select client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="label mb-1">Email</p>
              <input
                type="email"
                className="input w-full"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
              />
              {emailDupWarning && (
                <p className="text-err mt-1 font-sans" style={{ fontSize: '11px' }}>{emailDupWarning}</p>
              )}
            </div>
            <div>
              <p className="label mb-1">Phone</p>
              <input
                className="input w-full"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
              className="accent-polar"
            />
            <span className="text-steel" style={{ fontSize: '13px' }}>Primary contact</span>
          </label>
          <div>
            <p className="label mb-1">Notes</p>
            <VoiceTextarea
              className="input w-full"
              rows={3}
              value={form.notes}
              onChange={(val) => setForm(f => ({ ...f, notes: val }))}
              placeholder="Notes..."
            />
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <button onClick={() => setModalOpen(false)} className="btn-ghost">Cancel</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving || !form.name.trim()} style={{ opacity: (saving || !form.name.trim()) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk Action Bar */}
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
              {selectedIds.size} contact{selectedIds.size !== 1 ? 's' : ''} selected
            </span>

            <div className="flex-1" />

            <button
              onClick={handleBulkExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-colors"
              style={{
                fontSize: '12px',
                fontWeight: 600,
                background: 'var(--polar, #e8e8e8)',
                color: 'var(--obsidian, #0d0d0d)',
              }}
            >
              <Download size={12} />
              Export
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
