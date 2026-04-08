import { useState, useCallback } from 'react'
import { Mail, Plus, Trash2, Copy, Edit3, X, Check } from 'lucide-react'
import { useAppStore, type EmailTemplate } from '@/lib/store'
import { templates as templatesApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import PageHint from '@/components/ui/PageHint'

const CATEGORIES = ['Invoice', 'Outreach', 'Follow-up', 'Onboarding', 'General'] as const

const TOKEN_HELP = [
  { token: '{client_name}', desc: 'Client company name' },
  { token: '{contact_name}', desc: 'Client contact person' },
  { token: '{invoice_num}', desc: 'Invoice number' },
  { token: '{amount}', desc: 'Invoice total amount' },
  { token: '{due_date}', desc: 'Payment due date' },
  { token: '{company_name}', desc: 'Your company name' },
]

export default function EmailTemplates() {
  const { templates, refreshTemplates } = useAppStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('General')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [filterCat, setFilterCat] = useState<string>('All')

  const filtered = filterCat === 'All'
    ? templates
    : templates.filter(t => t.category === filterCat)

  const openNew = () => {
    setEditId(null)
    setName('')
    setCategory('General')
    setSubject('')
    setBody('')
    setModalOpen(true)
  }

  const openEdit = (t: EmailTemplate) => {
    setEditId(t.id)
    setName(t.name)
    setCategory(t.category || 'General')
    setSubject(t.subject || '')
    setBody(t.body || '')
    setModalOpen(true)
  }

  const handleSave = useCallback(async () => {
    if (!name.trim()) { showToast('Template name is required', 'warn'); return }
    setSaving(true)
    try {
      if (editId) {
        await templatesApi.update(editId, { name, category, subject, body })
        showToast('Template updated', 'success')
      } else {
        await templatesApi.create({ name, category, subject, body, use_count: 0 })
        showToast('Template created', 'success')
      }
      await refreshTemplates()
      setModalOpen(false)
    } catch {
      showToast('Failed to save template', 'error')
    }
    setSaving(false)
  }, [editId, name, category, subject, body, refreshTemplates])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await templatesApi.delete(id)
      await refreshTemplates()
      showToast('Template deleted', 'success')
    } catch {
      showToast('Failed to delete', 'error')
    }
  }, [refreshTemplates])

  const handleDuplicate = useCallback(async (t: EmailTemplate) => {
    try {
      await templatesApi.create({
        name: `${t.name} (Copy)`,
        category: t.category,
        subject: t.subject,
        body: t.body,
        use_count: 0,
      })
      await refreshTemplates()
      showToast('Template duplicated', 'success')
    } catch {
      showToast('Failed to duplicate', 'error')
    }
  }, [refreshTemplates])

  const inputClass = 'w-full bg-cell border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors'

  return (
    <div className="space-y-5">
      <PageHint
        id="email-templates"
        title="Email Templates"
        tips={[
          'Create reusable email templates for invoices, outreach, follow-ups, etc.',
          'Use tokens like {client_name} and {amount} — they auto-fill when you use the template.',
          'Pick a template when sending invoices to save time.',
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1>Email Templates</h1>
            <Mail size={14} className="text-dim" />
          </div>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus size={12} /> New Template
        </button>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {['All', ...CATEGORIES].map(c => (
          <button
            key={c}
            onClick={() => setFilterCat(c)}
            className={`px-3 py-1.5 border transition-colors cursor-pointer ${
              filterCat === c ? 'border-polar text-polar bg-surface' : 'border-border text-dim hover:text-steel'
            }`}
            style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Templates grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No email templates"
          description="Create templates to speed up your invoice and outreach emails."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(t => (
            <div key={t.id} className="card">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-polar font-[700] truncate" style={{ fontSize: '14px' }}>{t.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="badge badge-neutral">{t.category || 'General'}</span>
                    {t.use_count > 0 && (
                      <span className="text-dim" style={{ fontSize: '10px' }}>Used {t.use_count}x</span>
                    )}
                  </div>
                </div>
              </div>
              {t.subject && (
                <p className="text-steel truncate mt-1" style={{ fontSize: '12px' }}>
                  Subject: {t.subject}
                </p>
              )}
              <p className="text-dim mt-1 line-clamp-2" style={{ fontSize: '11px', lineHeight: '1.5' }}>
                {t.body || 'No body content'}
              </p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                <button onClick={() => openEdit(t)} className="btn-ghost flex items-center gap-1 flex-1 justify-center">
                  <Edit3 size={11} /> Edit
                </button>
                <button onClick={() => handleDuplicate(t)} className="btn-ghost flex items-center gap-1 flex-1 justify-center">
                  <Copy size={11} /> Duplicate
                </button>
                <button onClick={() => handleDelete(t.id)} className="btn-ghost flex items-center gap-1 text-err hover:text-err">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Template' : 'New Email Template'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-steel block mb-1.5">Template Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="Monthly Retainer Invoice" autoFocus />
            </div>
            <div>
              <label className="label text-steel block mb-1.5">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass} style={{ fontSize: '13px' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label text-steel block mb-1.5">Subject Line</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="Invoice {invoice_num} from {company_name}" />
          </div>
          <div>
            <label className="label text-steel block mb-1.5">Email Body</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              className={inputClass}
              style={{ fontSize: '12px', minHeight: '160px', lineHeight: '1.6' }}
              placeholder={`Hi {contact_name},\n\nPlease find attached invoice {invoice_num} for {amount}.\n\nPayment is due by {due_date}.\n\nThank you for your continued partnership.\n\nBest regards`}
            />
          </div>
          {/* Token reference */}
          <div className="bg-surface border border-border px-3 py-2">
            <span className="label text-dim block mb-1.5" style={{ fontSize: '10px' }}>AVAILABLE TOKENS</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {TOKEN_HELP.map(t => (
                <button
                  key={t.token}
                  onClick={() => setBody(prev => prev + t.token)}
                  className="text-steel hover:text-polar transition-colors cursor-pointer"
                  style={{ fontSize: '11px' }}
                  title={`Insert ${t.token} — ${t.desc}`}
                >
                  <code className="mono">{t.token}</code>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-ghost">Cancel</button>
            <button onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary" style={{ opacity: name.trim() ? 1 : 0.4 }}>
              {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
