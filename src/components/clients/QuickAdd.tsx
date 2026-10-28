import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore, Client } from '@/lib/store'
import {
  projects as projectsApi, tasks as tasksApi, invoices as invoicesApi,
  meetings as meetingsApi, contacts as contactsApi,
} from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import { isValidEmail } from '@/lib/utils'

/**
 * Add a project, task, invoice, meeting note or contact that is
 * already linked to a client. Used in the client window and on the
 * client profile page.
 *
 * Uncontrolled: renders its own "Add …" button.
 * Controlled: pass `open` + `onOpenChange` and trigger it from elsewhere.
 */

export type QuickKind = 'project' | 'task' | 'invoice' | 'meeting' | 'contact'

export const QUICK_LABEL: Record<QuickKind, string> = {
  project: 'project',
  task: 'task',
  invoice: 'invoice',
  meeting: 'meeting note',
  contact: 'contact',
}

interface QuickAddProps {
  kind: QuickKind
  client: Client
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function QuickAdd({ kind, client, open: openProp, onOpenChange }: QuickAddProps) {
  const store = useAppStore()
  const controlled = openProp !== undefined
  const [openState, setOpenState] = useState(false)
  const open = controlled ? !!openProp : openState
  const setOpen = (v: boolean) => { if (controlled) onOpenChange?.(v); else setOpenState(v) }

  const [saving, setSaving] = useState(false)
  const [f, setF] = useState<Record<string, string>>({})
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }))
  const label = QUICK_LABEL[kind]

  // Fresh form every time it opens
  useEffect(() => {
    if (!open) return
    const todayIso = new Date().toISOString().slice(0, 10)
    const plus30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    const base: Record<string, string> = {
      project: { title: '', status: 'backlog', priority: 'medium', due_date: '' },
      task: { text: '', priority: 'medium', due_date: '' },
      invoice: { num: '', amount: '', due_date: plus30, status: 'draft', notes: '' },
      meeting: { title: '', date: todayIso, type: 'check-in', notes: '' },
      contact: { name: '', role: '', email: '', phone: '' },
    }[kind] as Record<string, string>
    setF(base)
    let live = true
    if (kind === 'invoice') {
      invoicesApi.getNextNum().then(n => { if (live) setF(prev => ({ ...prev, num: prev.num || n })) }).catch(() => {})
    }
    return () => { live = false }
  }, [open, kind])

  const save = async () => {
    if (saving) return
    try {
      setSaving(true)
      if (kind === 'project') {
        if (!f.title?.trim()) { showToast('Give the project a title', 'warn'); return }
        await projectsApi.create({ title: f.title.trim(), client_id: client.id, status: f.status, priority: f.priority, due_date: f.due_date || null })
        await store.refreshProjects()
      } else if (kind === 'task') {
        if (!f.text?.trim()) { showToast('Describe the task', 'warn'); return }
        await tasksApi.create({ text: f.text.trim(), client_id: client.id, priority: f.priority, due_date: f.due_date || null, done: 0 })
        await store.refreshTasks()
      } else if (kind === 'invoice') {
        const amount = Number(String(f.amount).replace(/[$,\s]/g, ''))
        if (!amount) { showToast('Enter the invoice amount', 'warn'); return }
        await invoicesApi.create({ num: f.num || null, client_id: client.id, amount, due_date: f.due_date || null, status: f.status, notes: f.notes || null })
        await store.refreshInvoices()
      } else if (kind === 'meeting') {
        if (!f.title?.trim()) { showToast('Give the meeting a title', 'warn'); return }
        await meetingsApi.create({ title: f.title.trim(), client_id: client.id, date: f.date, type: f.type, notes: f.notes || null })
        await store.refreshMeetings()
      } else {
        if (!f.name?.trim()) { showToast('Add the contact’s name', 'warn'); return }
        if (f.email && !isValidEmail(f.email)) { showToast('That email doesn’t look right', 'warn'); return }
        const hasPrimary = store.contacts.some(c => c.client_id === client.id && c.is_primary)
        await contactsApi.create({
          client_id: client.id,
          name: f.name.trim(),
          role: f.role || null,
          email: f.email || null,
          phone: f.phone || null,
          is_primary: hasPrimary ? 0 : 1,
          notes: null,
          last_contacted: null,
        })
        await store.refreshContacts()
      }
      showToast(`${label.charAt(0).toUpperCase() + label.slice(1)} added to ${client.name}`, 'success')
      setOpen(false)
    } catch (err: any) {
      showToast(err?.message || `Could not add the ${label}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    if (controlled) return null
    return (
      <div className="qa-bar">
        <button className="btn-ghost" onClick={() => setOpen(true)}><Plus size={13} /> Add {label}</button>
      </div>
    )
  }

  const input = (k: string, ph: string, type = 'text', autoFocus = false) => (
    <input
      className="cw-input"
      type={type}
      placeholder={ph}
      value={f[k] ?? ''}
      autoFocus={autoFocus}
      onChange={e => set(k, e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') save() }}
    />
  )
  const select = (k: string, opts: [string, string][]) => (
    <select className="cw-input" value={f[k] ?? ''} onChange={e => set(k, e.target.value)}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
  const priorities: [string, string][] = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]

  return (
    <div className="qa-form">
      <p className="qa-title">New {label} for {client.name}</p>
      {kind === 'project' && (
        <div className="qa-grid">
          <label className="qa-wide"><span>Title</span>{input('title', 'e.g. Website rebuild', 'text', true)}</label>
          <label><span>Stage</span>{select('status', [['backlog', 'Backlog'], ['progress', 'In progress'], ['review', 'Review'], ['done', 'Done']])}</label>
          <label><span>Priority</span>{select('priority', priorities)}</label>
          <label><span>Due</span>{input('due_date', '', 'date')}</label>
        </div>
      )}
      {kind === 'task' && (
        <div className="qa-grid">
          <label className="qa-wide"><span>Task</span>{input('text', 'What needs doing?', 'text', true)}</label>
          <label><span>Priority</span>{select('priority', priorities)}</label>
          <label><span>Due</span>{input('due_date', '', 'date')}</label>
        </div>
      )}
      {kind === 'invoice' && (
        <div className="qa-grid">
          <label><span>Invoice #</span>{input('num', 'INV-001')}</label>
          <label><span>Amount</span>{input('amount', '$0', 'text', true)}</label>
          <label><span>Due</span>{input('due_date', '', 'date')}</label>
          <label><span>Status</span>{select('status', [['draft', 'Draft'], ['sent', 'Sent, unpaid'], ['paid', 'Paid']])}</label>
          <label className="qa-wide"><span>Notes</span>{input('notes', 'What is this invoice for?')}</label>
        </div>
      )}
      {kind === 'meeting' && (
        <div className="qa-grid">
          <label className="qa-wide"><span>Title</span>{input('title', 'e.g. Monthly check-in', 'text', true)}</label>
          <label><span>Date</span>{input('date', '', 'date')}</label>
          <label><span>Type</span>{select('type', [['check-in', 'Check-in'], ['discovery', 'Discovery'], ['strategy', 'Strategy'], ['review', 'Review'], ['other', 'Other']])}</label>
          <label className="qa-wide"><span>Notes</span>{input('notes', 'Key points')}</label>
        </div>
      )}
      {kind === 'contact' && (
        <div className="qa-grid">
          <label><span>Name</span>{input('name', 'Full name', 'text', true)}</label>
          <label><span>Role</span>{input('role', 'e.g. Owner')}</label>
          <label><span>Phone</span>{input('phone', '(780) 555-0100', 'tel')}</label>
          <label className="qa-wide"><span>Email</span>{input('email', 'name@company.com', 'email')}</label>
        </div>
      )}
      <div className="qa-actions">
        <button className="btn-ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : `Save ${label}`}</button>
      </div>
    </div>
  )
}
