import { useState, useMemo } from 'react'
import { Users, Plus, Trash2, Search, Mail, X, Download, ChevronUp, ChevronDown } from 'lucide-react'
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
    } catch { showToast('Failed to save contact', 'error') }
  }

  const handleDelete = async (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await contactsApi.delete(contact.id)
      await refreshContacts()
      showToast(`Deleted ${contact.name}`, 'success')
    } catch { showToast('Failed to delete', 'error') }
  }

  return (
    <div>
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
                <th className="label px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
                <th className="label px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('role')}>Role <SortIcon col="role" /></th>
                <th className="label px-4 py-3">Client</th>
                <th className="label px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('email')}>Email <SortIcon col="email" /></th>
                <th className="label px-4 py-3">Phone</th>
                <th className="label px-4 py-3">Last Contacted</th>
                <th className="label px-4 py-3">Primary</th>
                <th className="label px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <tr
                  key={c.id}
                  className="table-row cursor-pointer"
                  onClick={() => setDetailContact(c)}
                >
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
                    <button
                      onClick={(e) => handleDelete(c, e)}
                      className="text-dim hover:text-err transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
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
            <button onClick={handleSave} className="btn-primary">
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
