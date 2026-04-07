import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Building2, Plus, Search, ChevronUp, ChevronDown, ExternalLink, Globe, Edit3, Trash2, Eye, RefreshCw, Download } from 'lucide-react'
import { useAppStore, Client } from '@/lib/store'
import { clients as clientsApi, contacts as contactsApi, shell } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import ContextMenu, { ContextMenuItem } from '@/components/ui/ContextMenu'
import VoiceTextarea from '@/components/ui/VoiceTextarea'
import { daysSince, clientHealth, formatCurrency, relativeDate, safeParseJSON } from '@/lib/utils'
import ClientAvatar from '@/components/ui/ClientAvatar'
import { exportToCSV } from '@/lib/export-csv'

/* ========================================
   CONSTANTS
   ======================================== */

const STATUSES = ['active', 'prospect', 'paused', 'done'] as const
type ClientStatus = (typeof STATUSES)[number]

const STATUS_BADGE: Record<string, string> = {
  active: 'badge badge-ok',
  prospect: 'badge badge-warn',
  paused: 'badge badge-neutral',
  done: 'badge badge-err',
}

const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  active: 'Active',
  prospect: 'Prospects',
  paused: 'Paused',
  done: 'Done',
}

const DRAWER_TABS = [
  'Overview', 'Contacts', 'Projects', 'Tasks', 'Invoices',
  'Time', 'Credentials', 'Links', 'Meetings', 'Files', 'Notes',
] as const
type DrawerTab = (typeof DRAWER_TABS)[number]

const EMPTY_FORM: Omit<Client, 'id' | 'created_at' | 'updated_at'> = {
  name: '', service: '', retainer: '', mrr: 0, status: 'prospect',
  platform: '', contact: '', email: '', phone: '', website: '',
  colors: '', logo_path: '', last_activity: null, notes: '', tags: '',
}

/* ========================================
   MAIN COMPONENT
   ======================================== */

export default function Clients() {
  const {
    clients, tasks, projects, invoices, contacts, credentials, meetings, timeEntries,
    refreshClients, refreshActivity, refreshContacts,
    setSelectedClientId, setCurrentPage,
  } = useAppStore()

  // UI state
  const [filter, setFilter] = useState<'all' | ClientStatus>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'mrr' | 'status'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('Overview')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)

  // Counts per status
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: clients.length }
    STATUSES.forEach(s => { c[s] = clients.filter(cl => cl.status === s).length })
    return c
  }, [clients])

  // Filter + search + sort
  const visible = useMemo(() => {
    let list = filter === 'all' ? [...clients] : clients.filter(c => c.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.service || '').toLowerCase().includes(q) ||
        (c.platform || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortKey === 'mrr') cmp = (a.mrr || 0) - (b.mrr || 0)
      else if (sortKey === 'status') cmp = (a.status || '').localeCompare(b.status || '')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [clients, filter, search, sortKey, sortDir])

  const selectedClient = useMemo(() => clients.find(c => c.id === selectedId) ?? null, [clients, selectedId])

  // Sort handler
  const handleSort = (key: 'name' | 'mrr' | 'status') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ChevronUp size={10} className="text-dim ml-1 inline" />
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-polar ml-1 inline" />
      : <ChevronDown size={10} className="text-polar ml-1 inline" />
  }

  // Status cycle
  const cycleStatus = async (client: Client, e: React.MouseEvent) => {
    e.stopPropagation()
    const idx = STATUSES.indexOf(client.status as ClientStatus)
    const next = STATUSES[(idx + 1) % STATUSES.length]
    try {
      await clientsApi.update(client.id, { status: next })
      await refreshClients()
      showToast(`${client.name} → ${next}`, 'success')
    } catch { showToast('Failed to update status', 'error') }
  }

  // Create / Edit
  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }

  const openEdit = (c: Client) => {
    setEditingId(c.id)
    setForm({
      name: c.name, service: c.service || '', retainer: c.retainer || '',
      mrr: c.mrr, status: c.status, platform: c.platform || '',
      contact: c.contact || '', email: c.email || '', phone: c.phone || '',
      website: c.website || '', colors: c.colors || '', logo_path: c.logo_path || '',
      last_activity: c.last_activity, notes: c.notes || '', tags: c.tags || '',
    })
    setModalOpen(true)
  }

  const saveClient = async () => {
    if (!form.name.trim()) { showToast('Name is required', 'warn'); return }
    try {
      const payload = {
        ...form,
        mrr: Number(form.mrr) || 0,
        service: form.service || null,
        retainer: form.retainer || null,
        platform: form.platform || null,
        contact: form.contact || null,
        email: form.email || null,
        phone: form.phone || null,
        website: form.website || null,
        colors: form.colors || null,
        logo_path: form.logo_path || null,
        notes: form.notes || null,
        tags: form.tags || null,
      }
      if (editingId) {
        await clientsApi.update(editingId, payload)
        showToast('Client updated', 'success')
      } else {
        await clientsApi.create(payload)
        showToast('Client created', 'success')
      }
      await Promise.all([refreshClients(), refreshActivity()])
      setModalOpen(false)
    } catch { showToast('Save failed', 'error') }
  }

  // Delete
  const deleteClient = async (id: string) => {
    if (!confirm('Delete this client? This cannot be undone.')) return
    try {
      await clientsApi.delete(id)
      if (selectedId === id) setSelectedId(null)
      await Promise.all([refreshClients(), refreshActivity()])
      showToast('Client deleted', 'info')
    } catch { showToast('Delete failed', 'error') }
  }

  // Row click => open drawer
  const openDrawer = (id: string) => {
    setSelectedId(prev => prev === id ? null : id)
    setDrawerTab('Overview')
  }

  /* ========================================
     RENDER
     ======================================== */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3"><h1>Clients</h1><Building2 size={14} className="text-dim" /></div>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {clients.length} total &middot; {counts.active || 0} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToCSV(
              visible.map(c => ({
                name: c.name || '',
                email: c.email || '',
                phone: c.phone || '',
                status: c.status || '',
                created_at: c.created_at || '',
              })),
              'clients-export'
            )}
            className="btn-ghost flex items-center gap-2"
          >
            <Download size={12} /> Export CSV
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={12} /> Add Client
          </button>
        </div>
      </div>

      {/* Filter chips + search */}
      <div className="flex items-center gap-3 flex-wrap">
        {Object.entries(FILTER_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            className={`label-md px-3 py-1.5 border transition-colors cursor-pointer ${
              filter === key
                ? 'bg-polar text-obsidian border-polar'
                : 'bg-transparent text-steel border-border-hard hover:border-dim'
            }`}
          >
            {label} <span className="ml-1 mono" style={{ fontSize: '10px' }}>({counts[key] ?? 0})</span>
          </button>
        ))}
        <div className="ml-auto relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="bg-cell border border-border text-polar pl-8 pr-3 py-1.5 font-sans outline-none focus:border-dim transition-colors w-full md:w-[200px]"
            style={{ fontSize: '12px' }}
          />
        </div>
      </div>

      {/* Table or Empty */}
      {clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Add your first client to start tracking projects, invoices, and more."
          actionLabel="+ Add Client"
          onAction={openCreate}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description="Try adjusting your search or filter."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: '12px' }}>
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label py-2 px-3 cursor-pointer select-none" onClick={() => handleSort('name')}>
                    Name <SortIcon col="name" />
                  </th>
                  <th className="label py-2 px-3">Service</th>
                  <th className="label py-2 px-3 cursor-pointer select-none" onClick={() => handleSort('mrr')}>
                    MRR <SortIcon col="mrr" />
                  </th>
                  <th className="label py-2 px-3 cursor-pointer select-none" onClick={() => handleSort('status')}>
                    Status <SortIcon col="status" />
                  </th>
                  <th className="label py-2 px-3">Platform</th>
                  <th className="label py-2 px-3">Health</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(c => {
                  const days = daysSince(c.last_activity)
                  const health = clientHealth(days)
                  const openClientDetail = () => {
                    setSelectedClientId(c.id)
                    setCurrentPage('client-detail')
                  }
                  const ctxItems: ContextMenuItem[] = [
                    { label: 'View Details', icon: Eye, action: openClientDetail },
                    { label: 'Edit Client', icon: Edit3, action: () => openEdit(c) },
                    { label: 'Cycle Status', icon: RefreshCw, action: () => cycleStatus(c, {} as any) },
                    { label: '', action: () => {}, divider: true },
                    { label: 'Delete Client', icon: Trash2, action: () => deleteClient(c.id), danger: true },
                  ]
                  return (
                    <ContextMenu key={c.id} items={ctxItems}>
                    <tr
                      className={`table-row cursor-pointer ${selectedId === c.id ? 'row-selected' : ''}`}
                      onClick={() => openDrawer(c.id)}
                    >
                      <td className="py-2.5 px-3 font-[700] text-polar">
                        <div className="flex items-center gap-2">
                          <ClientAvatar name={c.name} size="sm" />
                          <button
                            onClick={(e) => { e.stopPropagation(); openClientDetail() }}
                            className="hover:underline cursor-pointer text-left text-polar"
                          >
                            {c.name}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-steel">{c.service || '\u2014'}</td>
                      <td className="py-2.5 px-3 mono">{c.retainer || formatCurrency(c.mrr)}</td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={(e) => cycleStatus(c, e)}
                          className={STATUS_BADGE[c.status] || 'badge badge-neutral'}
                        >
                          {c.status}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-steel">{c.platform || '\u2014'}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: health.color }}
                          title={`${health.label} (${days === Infinity ? 'no activity' : days + 'd ago'})`}
                        />
                      </td>
                    </tr>
                    </ContextMenu>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Client Detail Drawer */}
          {selectedClient && (
            <ClientDrawer
              client={selectedClient}
              tab={drawerTab}
              setTab={setDrawerTab}
              tasks={tasks}
              projects={projects}
              invoices={invoices}
              contacts={contacts}
              credentials={credentials}
              meetings={meetings}
              timeEntries={timeEntries}
              onEdit={() => openEdit(selectedClient)}
              onDelete={() => deleteClient(selectedClient.id)}
              onClose={() => setSelectedId(null)}
              refreshClients={refreshClients}
              refreshContacts={refreshContacts}
              refreshActivity={refreshActivity}
            />
          )}
        </>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Client' : 'New Client'} width="560px">
        <ClientForm form={form} setForm={setForm} onSave={saveClient} />
      </Modal>
    </div>
  )
}

/* ========================================
   FORM FIELD (extracted to prevent remounting)
   ======================================== */

function FormField({ label, field, type = 'text', placeholder = '', value, onChange }: {
  label: string; field: string; type?: string; placeholder?: string
  value: any; onChange: (field: string, val: any) => void
}) {
  return (
    <div className="space-y-1">
      <label className="label text-dim">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(field, type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim transition-colors"
        style={{ fontSize: '12px' }}
      />
    </div>
  )
}

/* ========================================
   CLIENT FORM (inside modal)
   ======================================== */

function ClientForm({
  form, setForm, onSave,
}: {
  form: Record<string, any>
  setForm: (fn: any) => void
  onSave: () => void
}) {
  const set = useCallback((key: string, val: any) => setForm((prev: any) => ({ ...prev, [key]: val })), [setForm])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Name" field="name" placeholder="Client name" value={form.name} onChange={set} />
        <div className="space-y-1">
          <label className="label text-dim">Status</label>
          <select
            value={form.status}
            onChange={e => set('status', e.target.value)}
            className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim"
            style={{ fontSize: '12px' }}
          >
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Service" field="service" placeholder="e.g. PPC Management" value={form.service} onChange={set} />
        <FormField label="Retainer" field="retainer" placeholder="e.g. $2,500/mo" value={form.retainer} onChange={set} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="MRR ($)" field="mrr" type="number" placeholder="0" value={form.mrr} onChange={set} />
        <FormField label="Platform" field="platform" placeholder="e.g. Google Ads" value={form.platform} onChange={set} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Primary Contact" field="contact" placeholder="Name" value={form.contact} onChange={set} />
        <FormField label="Email" field="email" type="email" placeholder="email@example.com" value={form.email} onChange={set} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Phone" field="phone" placeholder="+1..." value={form.phone} onChange={set} />
        <FormField label="Website" field="website" placeholder="https://..." value={form.website} onChange={set} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Brand Colors (JSON)" field="colors" placeholder='["#FF0000","#00FF00"]' value={form.colors} onChange={set} />
        <FormField label="Tags (comma sep)" field="tags" placeholder="automotive, google" value={form.tags} onChange={set} />
      </div>
      <div className="space-y-1">
        <label className="label text-dim">Notes</label>
        <VoiceTextarea
          value={form.notes ?? ''}
          onChange={(val) => set('notes', val)}
          rows={3}
          className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim resize-none"
          style={{ fontSize: '12px' }}
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onSave} className="btn-primary">Save Client</button>
      </div>
    </div>
  )
}

/* ========================================
   CLIENT DETAIL DRAWER
   ======================================== */

function ClientDrawer({
  client, tab, setTab,
  tasks, projects, invoices, contacts, credentials, meetings, timeEntries,
  onEdit, onDelete, onClose,
  refreshClients, refreshContacts, refreshActivity,
}: {
  client: Client
  tab: DrawerTab
  setTab: (t: DrawerTab) => void
  tasks: any[]
  projects: any[]
  invoices: any[]
  contacts: any[]
  credentials: any[]
  meetings: any[]
  timeEntries: any[]
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
  refreshClients: () => Promise<void>
  refreshContacts: () => Promise<void>
  refreshActivity: () => Promise<void>
}) {
  const days = daysSince(client.last_activity)
  const health = clientHealth(days)

  return (
    <div className="card mt-0 border-t-2" style={{ borderTopColor: health.color }}>
      {/* Drawer header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Building2 size={16} className="text-steel" />
          <h2 className="text-polar" style={{ fontSize: '16px' }}>{client.name}</h2>
          <span className={STATUS_BADGE[client.status] || 'badge badge-neutral'}>{client.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="btn-ghost" style={{ fontSize: '10px', padding: '4px 10px' }}>Edit</button>
          <button
            onClick={() => { if (confirm(`Delete ${client.name}?`)) onDelete() }}
            className="btn-ghost text-err border-err/30 hover:border-err"
            style={{ fontSize: '10px', padding: '4px 10px' }}
          >
            Delete
          </button>
          <button onClick={onClose} className="text-dim hover:text-steel ml-2 cursor-pointer" style={{ fontSize: '12px' }}>
            Close
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-4 overflow-x-auto">
        {DRAWER_TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`cd-tab px-4 py-2 label-md cursor-pointer transition-colors whitespace-nowrap ${
              tab === t
                ? 'text-polar border-b-2 border-polar'
                : 'text-dim hover:text-steel border-b-2 border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ minHeight: '200px' }}>
        {tab === 'Overview' && (
          <OverviewTab
            client={client}
            invoices={invoices}
            timeEntries={timeEntries}
            health={health}
            days={days}
          />
        )}
        {tab === 'Contacts' && (
          <ContactsTab
            client={client}
            contacts={contacts}
            refreshContacts={refreshContacts}
          />
        )}
        {tab === 'Projects' && <ProjectsTab client={client} projects={projects} />}
        {tab === 'Tasks' && <TasksTab client={client} tasks={tasks} />}
        {tab === 'Invoices' && <InvoicesTab client={client} invoices={invoices} />}
        {tab === 'Time' && <TimeTab client={client} timeEntries={timeEntries} />}
        {tab === 'Credentials' && <CredentialsTab client={client} credentials={credentials} />}
        {tab === 'Links' && <LinksTab client={client} projects={projects} />}
        {tab === 'Meetings' && <MeetingsTab client={client} meetings={meetings} />}
        {tab === 'Files' && <FilesTab client={client} invoices={invoices} />}
        {tab === 'Notes' && (
          <NotesTab
            client={client}
            refreshClients={refreshClients}
          />
        )}
      </div>
    </div>
  )
}

/* ========================================
   TAB: OVERVIEW
   ======================================== */

function OverviewTab({
  client, invoices, timeEntries, health, days,
}: {
  client: Client; invoices: any[]; timeEntries: any[]; health: { color: string; label: string }; days: number
}) {
  const colors = safeParseJSON<string[]>(client.colors, [])
  const lifetimeRevenue = useMemo(() =>
    invoices
      .filter(inv => inv.client_id === client.id && inv.status === 'paid')
      .reduce((sum, inv) => sum + (inv.amount || 0), 0),
    [invoices, client.id]
  )
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const hoursThisMonth = useMemo(() =>
    timeEntries
      .filter(te => te.client_id === client.id && te.started_at >= monthStart)
      .reduce((sum, te) => sum + (te.duration_minutes || 0), 0) / 60,
    [timeEntries, client.id, monthStart]
  )

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-4 py-2 border-b border-border">
      <span className="label text-dim w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-polar" style={{ fontSize: '12px' }}>{value || '\u2014'}</span>
    </div>
  )

  return (
    <div className="space-y-1">
      <Row label="Service" value={client.service} />
      <Row label="Retainer" value={client.retainer} />
      <Row label="Platform" value={client.platform} />
      <Row label="Primary Contact" value={client.contact} />
      <Row
        label="Website"
        value={
          client.website ? (
            <button onClick={() => shell.openExternal(client.website!)} className="text-polar hover:text-steel flex items-center gap-1 cursor-pointer bg-transparent border-none p-0" style={{ fontSize: 'inherit' }}>
              {client.website} <ExternalLink size={10} />
            </button>
          ) : null
        }
      />
      <Row
        label="Brand Colors"
        value={
          colors.length > 0 ? (
            <div className="flex gap-1">
              {colors.map((c, i) => (
                <span
                  key={i}
                  className="inline-block w-5 h-5 border border-border"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          ) : null
        }
      />
      <Row label="Notes" value={client.notes} />
      <Row
        label="Health"
        value={
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: health.color }} />
            <span>{health.label}</span>
            <span className="text-dim mono">({days === Infinity ? 'no activity' : `${days}d ago`})</span>
          </span>
        }
      />
      <Row label="Lifetime Revenue" value={formatCurrency(lifetimeRevenue)} />
      <Row label="Hours This Month" value={`${hoursThisMonth.toFixed(1)}h`} />
    </div>
  )
}

/* ========================================
   TAB: CONTACTS
   ======================================== */

function ContactsTab({
  client, contacts, refreshContacts,
}: {
  client: Client; contacts: any[]; refreshContacts: () => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const clientContacts = useMemo(() => contacts.filter(c => c.client_id === client.id), [contacts, client.id])

  const addContact = async () => {
    if (!name.trim()) { showToast('Name required', 'warn'); return }
    try {
      await contactsApi.create({
        client_id: client.id,
        name: name.trim(),
        role: role || null,
        email: email || null,
        phone: phone || null,
        is_primary: clientContacts.length === 0 ? 1 : 0,
        notes: null,
        last_contacted: null,
      })
      await refreshContacts()
      showToast('Contact added', 'success')
      setAdding(false)
      setName(''); setRole(''); setEmail(''); setPhone('')
    } catch { showToast('Failed to add contact', 'error') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="label text-dim">{clientContacts.length} Contact{clientContacts.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setAdding(!adding)} className="btn-ghost" style={{ fontSize: '10px', padding: '4px 10px' }}>
          <Plus size={10} className="inline mr-1" /> Add
        </button>
      </div>

      {adding && (
        <div className="bg-surface border border-border p-3 mb-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="bg-cell border border-border px-2 py-1 text-polar font-sans outline-none" style={{ fontSize: '12px' }} />
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role" className="bg-cell border border-border px-2 py-1 text-polar font-sans outline-none" style={{ fontSize: '12px' }} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="bg-cell border border-border px-2 py-1 text-polar font-sans outline-none" style={{ fontSize: '12px' }} />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className="bg-cell border border-border px-2 py-1 text-polar font-sans outline-none" style={{ fontSize: '12px' }} />
          </div>
          <div className="flex gap-2">
            <button onClick={addContact} className="btn-primary" style={{ fontSize: '10px', padding: '3px 10px' }}>Save</button>
            <button onClick={() => setAdding(false)} className="btn-ghost" style={{ fontSize: '10px', padding: '3px 10px' }}>Cancel</button>
          </div>
        </div>
      )}

      {clientContacts.length === 0 ? (
        <p className="text-dim" style={{ fontSize: '12px' }}>No contacts for this client.</p>
      ) : (
        <div className="space-y-2">
          {clientContacts.map(c => (
            <div key={c.id} className="flex items-center gap-4 py-2 border-b border-border" style={{ fontSize: '12px' }}>
              <span className="font-[700] text-polar">{c.name}</span>
              {c.is_primary === 1 && <span className="badge badge-ok" style={{ fontSize: '9px' }}>Primary</span>}
              <span className="text-steel">{c.role || ''}</span>
              <span className="text-dim mono ml-auto">{c.email || ''}</span>
              <span className="text-dim mono">{c.phone || ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ========================================
   TAB: PROJECTS
   ======================================== */

function ProjectsTab({ client, projects }: { client: Client; projects: any[] }) {
  const clientProjects = useMemo(() => projects.filter(p => p.client_id === client.id), [projects, client.id])

  if (clientProjects.length === 0) return <p className="text-dim" style={{ fontSize: '12px' }}>No projects for this client.</p>

  const statusBadge = (s: string) => {
    if (s === 'active' || s === 'in_progress') return 'badge badge-ok'
    if (s === 'completed' || s === 'done') return 'badge badge-neutral'
    if (s === 'on_hold') return 'badge badge-warn'
    return 'badge badge-neutral'
  }

  return (
    <table className="w-full" style={{ fontSize: '12px' }}>
      <thead>
        <tr className="border-b border-border text-left">
          <th className="label py-2 px-2">Title</th>
          <th className="label py-2 px-2">Status</th>
          <th className="label py-2 px-2">Priority</th>
          <th className="label py-2 px-2">Hours</th>
          <th className="label py-2 px-2">Due</th>
        </tr>
      </thead>
      <tbody>
        {clientProjects.map(p => (
          <tr key={p.id} className="table-row">
            <td className="py-2 px-2 font-[600] text-polar">{p.title}</td>
            <td className="py-2 px-2"><span className={statusBadge(p.status)}>{p.status}</span></td>
            <td className="py-2 px-2 text-steel">{p.priority || '\u2014'}</td>
            <td className="py-2 px-2 mono">{p.hours || 0}h</td>
            <td className="py-2 px-2 text-dim mono">{p.due_date ? relativeDate(p.due_date) : '\u2014'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ========================================
   TAB: TASKS
   ======================================== */

function TasksTab({ client, tasks }: { client: Client; tasks: any[] }) {
  const clientTasks = useMemo(() => tasks.filter(t => t.client_id === client.id), [tasks, client.id])

  if (clientTasks.length === 0) return <p className="text-dim" style={{ fontSize: '12px' }}>No tasks for this client.</p>

  return (
    <div className="space-y-1">
      {clientTasks.map(t => (
        <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border" style={{ fontSize: '12px' }}>
          <span className={`inline-block w-2 h-2 rounded-full ${t.done ? 'bg-ok' : t.priority === 'high' ? 'bg-err' : t.priority === 'medium' ? 'bg-warn' : 'bg-dim'}`} />
          <span className={`flex-1 ${t.done ? 'line-through text-dim' : 'text-polar'}`}>{t.text}</span>
          {t.due_date && <span className="text-dim mono">{relativeDate(t.due_date)}</span>}
          <span className="label text-dim">{t.priority}</span>
        </div>
      ))}
    </div>
  )
}

/* ========================================
   TAB: INVOICES
   ======================================== */

function InvoicesTab({ client, invoices }: { client: Client; invoices: any[] }) {
  const clientInvoices = useMemo(() => invoices.filter(inv => inv.client_id === client.id), [invoices, client.id])

  if (clientInvoices.length === 0) return <p className="text-dim" style={{ fontSize: '12px' }}>No invoices for this client.</p>

  const statusBadge = (s: string) => {
    if (s === 'paid') return 'badge badge-ok'
    if (s === 'sent' || s === 'pending') return 'badge badge-warn'
    if (s === 'overdue') return 'badge badge-err'
    return 'badge badge-neutral'
  }

  return (
    <table className="w-full" style={{ fontSize: '12px' }}>
      <thead>
        <tr className="border-b border-border text-left">
          <th className="label py-2 px-2">Invoice #</th>
          <th className="label py-2 px-2">Amount</th>
          <th className="label py-2 px-2">Status</th>
          <th className="label py-2 px-2">Sent</th>
          <th className="label py-2 px-2">Due</th>
        </tr>
      </thead>
      <tbody>
        {clientInvoices.map(inv => (
          <tr key={inv.id} className="table-row">
            <td className="py-2 px-2 mono font-[700]">{inv.num}</td>
            <td className="py-2 px-2 mono">{formatCurrency(inv.amount)}</td>
            <td className="py-2 px-2"><span className={statusBadge(inv.status)}>{inv.status}</span></td>
            <td className="py-2 px-2 text-dim mono">{inv.sent_date ? relativeDate(inv.sent_date) : '\u2014'}</td>
            <td className="py-2 px-2 text-dim mono">{inv.due_date ? relativeDate(inv.due_date) : '\u2014'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ========================================
   TAB: TIME
   ======================================== */

function TimeTab({ client, timeEntries }: { client: Client; timeEntries: any[] }) {
  const clientTime = useMemo(() => timeEntries.filter(te => te.client_id === client.id), [timeEntries, client.id])

  if (clientTime.length === 0) return <p className="text-dim" style={{ fontSize: '12px' }}>No time entries for this client.</p>

  const totalMinutes = clientTime.reduce((s, te) => s + (te.duration_minutes || 0), 0)

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <span className="label text-dim">{clientTime.length} entries</span>
        <span className="mono text-steel">{(totalMinutes / 60).toFixed(1)}h total</span>
      </div>
      <table className="w-full" style={{ fontSize: '12px' }}>
        <thead>
          <tr className="border-b border-border text-left">
            <th className="label py-2 px-2">Date</th>
            <th className="label py-2 px-2">Project</th>
            <th className="label py-2 px-2">Duration</th>
            <th className="label py-2 px-2">Billable</th>
            <th className="label py-2 px-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {clientTime.map(te => (
            <tr key={te.id} className="table-row">
              <td className="py-2 px-2 mono text-dim">{relativeDate(te.started_at)}</td>
              <td className="py-2 px-2 text-steel">{te.project_title || '\u2014'}</td>
              <td className="py-2 px-2 mono">{te.duration_minutes ? `${(te.duration_minutes / 60).toFixed(1)}h` : 'running'}</td>
              <td className="py-2 px-2">{te.billable ? <span className="badge badge-ok">Yes</span> : <span className="badge badge-neutral">No</span>}</td>
              <td className="py-2 px-2 text-dim truncate" style={{ maxWidth: '200px' }}>{te.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ========================================
   TAB: CREDENTIALS
   ======================================== */

function CredentialsTab({ client, credentials }: { client: Client; credentials: any[] }) {
  const clientCreds = useMemo(
    () => credentials.filter(cr => cr.client_id === client.id),
    [credentials, client.id]
  )

  if (clientCreds.length === 0) return <p className="text-dim" style={{ fontSize: '12px' }}>No credentials stored for this client.</p>

  return (
    <div className="space-y-3">
      {clientCreds.map(cr => {
        const fields = safeParseJSON<Record<string, string>>(cr.fields, {})
        return (
          <div key={cr.id} className="bg-surface border border-border p-3">
            <div className="label text-steel mb-2">{cr.platform}</div>
            <div className="space-y-1">
              {Object.entries(fields).map(([key, val]) => (
                <div key={key} className="flex gap-3" style={{ fontSize: '12px' }}>
                  <span className="text-dim w-28 shrink-0">{key}</span>
                  <span className="mono text-polar">{val}</span>
                </div>
              ))}
              {Object.keys(fields).length === 0 && (
                <span className="text-dim" style={{ fontSize: '12px' }}>No fields</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ========================================
   TAB: LINKS
   ======================================== */

function LinksTab({ client, projects }: { client: Client; projects: any[] }) {
  const allLinks = useMemo(() => {
    const links: { label: string; url: string; source: string }[] = []
    // Client website
    if (client.website) links.push({ label: client.name + ' website', url: client.website, source: 'Client' })
    // Project links
    projects.filter(p => p.client_id === client.id).forEach(p => {
      const parsed = safeParseJSON<string[]>(p.links, [])
      parsed.forEach((url: string) => {
        links.push({ label: p.title, url, source: 'Project' })
      })
    })
    return links
  }, [client, projects])

  if (allLinks.length === 0) return <p className="text-dim" style={{ fontSize: '12px' }}>No links for this client.</p>

  return (
    <div className="space-y-2">
      {allLinks.map((link, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-b border-border" style={{ fontSize: '12px' }}>
          <Globe size={12} className="text-dim shrink-0" />
          <button onClick={() => shell.openExternal(link.url)} className="text-polar hover:text-steel flex items-center gap-1 truncate cursor-pointer bg-transparent border-none p-0" style={{ fontSize: 'inherit' }}>
            {link.url} <ExternalLink size={10} />
          </button>
          <span className="text-dim ml-auto shrink-0">{link.source}: {link.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ========================================
   TAB: MEETINGS
   ======================================== */

function MeetingsTab({ client, meetings }: { client: Client; meetings: any[] }) {
  const clientMeetings = useMemo(() => meetings.filter(m => m.client_id === client.id), [meetings, client.id])

  if (clientMeetings.length === 0) return <p className="text-dim" style={{ fontSize: '12px' }}>No meetings for this client.</p>

  return (
    <div className="space-y-3">
      {clientMeetings.map(m => (
        <div key={m.id} className="bg-surface border border-border p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-[700] text-polar" style={{ fontSize: '13px' }}>{m.title}</span>
            <span className="mono text-dim" style={{ fontSize: '11px' }}>{relativeDate(m.date)}</span>
          </div>
          <div className="flex gap-3 mb-2" style={{ fontSize: '11px' }}>
            <span className="badge badge-neutral">{m.type}</span>
            {m.attendees && <span className="text-dim">{m.attendees}</span>}
          </div>
          {m.notes && <p className="text-steel" style={{ fontSize: '12px' }}>{m.notes}</p>}
          {m.action_items && (
            <div className="mt-2">
              <span className="label text-dim">Action Items</span>
              <p className="text-steel mt-1" style={{ fontSize: '12px' }}>{m.action_items}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ========================================
   TAB: FILES
   ======================================== */

function FilesTab({ client, invoices }: { client: Client; invoices: any[] }) {
  const files = useMemo(() => {
    const list: { name: string; path: string; type: string }[] = []
    // Client logo
    if (client.logo_path) list.push({ name: 'Logo', path: client.logo_path, type: 'Image' })
    // Invoice files
    invoices.filter(inv => inv.client_id === client.id && inv.file_path).forEach(inv => {
      list.push({ name: `Invoice ${inv.num}`, path: inv.file_path!, type: 'Invoice PDF' })
    })
    return list
  }, [client, invoices])

  if (files.length === 0) return <p className="text-dim" style={{ fontSize: '12px' }}>No files for this client.</p>

  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-b border-border" style={{ fontSize: '12px' }}>
          <span className="font-[600] text-polar">{f.name}</span>
          <span className="badge badge-neutral">{f.type}</span>
          <span className="text-dim mono ml-auto truncate" style={{ maxWidth: '300px' }}>{f.path}</span>
        </div>
      ))}
    </div>
  )
}

/* ========================================
   TAB: NOTES
   ======================================== */

function NotesTab({
  client, refreshClients,
}: {
  client: Client; refreshClients: () => Promise<void>
}) {
  const [notes, setNotes] = useState(client.notes || '')

  // Sync when client changes
  useEffect(() => {
    setNotes(client.notes || '')
  }, [client.id, client.notes])

  const saveNotes = useCallback(async () => {
    if (notes === (client.notes || '')) return
    try {
      await clientsApi.update(client.id, { notes })
      await refreshClients()
      showToast('Notes saved', 'success')
    } catch { showToast('Failed to save notes', 'error') }
  }, [notes, client.id, client.notes, refreshClients])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="label text-dim">Client Notes</span>
        <span className="text-dim" style={{ fontSize: '11px' }}>Auto-saves on blur</span>
      </div>
      <VoiceTextarea
        value={notes}
        onChange={(val) => setNotes(val)}
        onBlur={saveNotes}
        rows={10}
        className="w-full bg-surface border border-border px-4 py-3 text-polar font-sans outline-none focus:border-dim resize-y transition-colors"
        style={{ fontSize: '13px', lineHeight: '1.6' }}
        placeholder="Add notes about this client..."
      />
    </div>
  )
}
