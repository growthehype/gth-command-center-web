import { useState, useEffect, useRef } from 'react'
import { X, CheckSquare, User, FileText } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { tasks as tasksApi, contacts as contactsApi, notes as notesApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'

type Tab = 'task' | 'contact' | 'note'

interface QuickAddModalProps {
  open: boolean
  onClose: () => void
}

export default function QuickAddModal({ open, onClose }: QuickAddModalProps) {
  const [tab, setTab] = useState<Tab>('task')
  const [loading, setLoading] = useState(false)
  const { clients, refreshTasks, refreshContacts } = useAppStore()

  // Task fields
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskClientId, setTaskClientId] = useState('')

  // Contact fields
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  // Note fields
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')

  const firstInputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Auto-focus first input when tab changes or modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => firstInputRef.current?.focus(), 50)
    }
  }, [open, tab])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [open, onClose])

  // Reset fields on close
  useEffect(() => {
    if (!open) {
      setTaskTitle(''); setTaskDueDate(''); setTaskClientId('')
      setContactName(''); setContactEmail(''); setContactPhone('')
      setNoteTitle(''); setNoteContent('')
    }
  }, [open])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose()
  }

  const handleSubmitTask = async () => {
    if (!taskTitle.trim()) return
    setLoading(true)
    try {
      await tasksApi.create({
        text: taskTitle.trim(),
        due_date: taskDueDate || null,
        client_id: taskClientId || null,
        priority: 'medium',
        done: 0,
      })
      await refreshTasks()
      showToast('Task added', 'success')
      onClose()
    } catch (err: any) {
      console.error('Quick add task failed:', err)
      showToast(err?.message || 'Failed to add task', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitContact = async () => {
    if (!contactName.trim()) return
    setLoading(true)
    try {
      await contactsApi.create({
        name: contactName.trim(),
        email: contactEmail.trim() || null,
        phone: contactPhone.trim() || null,
        is_primary: 0,
      })
      await refreshContacts()
      showToast('Contact added', 'success')
      onClose()
    } catch (err: any) {
      console.error('Quick add contact failed:', err)
      showToast(err?.message || 'Failed to add contact', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitNote = async () => {
    if (!noteTitle.trim()) return
    setLoading(true)
    try {
      // Load existing notes, append new one, save back
      const raw = await notesApi.get()
      let allNotes: any[] = []
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) allNotes = parsed
        } catch { /* legacy format, start fresh array */ }
      }
      const newNote = {
        id: crypto.randomUUID(),
        title: noteTitle.trim(),
        content: noteContent.trim(),
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      allNotes.unshift(newNote)
      await notesApi.save(JSON.stringify(allNotes))
      showToast('Note saved', 'success')
      onClose()
    } catch (err: any) {
      console.error('Quick add note failed:', err)
      showToast(err?.message || 'Failed to save note', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (tab === 'task') handleSubmitTask()
    else if (tab === 'contact') handleSubmitContact()
    else handleSubmitNote()
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'task', label: 'Task', icon: <CheckSquare size={14} /> },
    { key: 'contact', label: 'Contact', icon: <User size={14} /> },
    { key: 'note', label: 'Note', icon: <FileText size={14} /> },
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 13,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    borderRadius: 4,
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
    display: 'block',
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>Quick Add</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-dim)', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab selector */}
        <div style={{ display: 'flex', gap: 0, padding: '12px 16px 0', borderBottom: '1px solid var(--color-border)' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 0 10px',
                fontSize: 12,
                fontWeight: 600,
                color: tab === t.key ? 'var(--color-polar)' : 'var(--color-dim)',
                background: 'none',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--color-polar)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 16px 16px' }}>
          {tab === 'task' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input
                  ref={firstInputRef}
                  type="text"
                  placeholder="What needs to be done?"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--color-polar)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Due Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={e => setTaskDueDate(e.target.value)}
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--color-polar)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Client</label>
                  <select
                    value={taskClientId}
                    onChange={e => setTaskClientId(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">None</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {tab === 'contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  ref={firstInputRef}
                  type="text"
                  placeholder="Contact name"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--color-polar)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--color-polar)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  type="tel"
                  placeholder="(optional)"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--color-polar)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                />
              </div>
            </div>
          )}

          {tab === 'note' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input
                  ref={firstInputRef}
                  type="text"
                  placeholder="Note title"
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--color-polar)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                />
              </div>
              <div>
                <label style={labelStyle}>Content</label>
                <textarea
                  placeholder="Write your note..."
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--color-polar)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                />
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: '100%',
              marginTop: 18,
              padding: '10px 0',
              fontSize: 12,
              fontWeight: 700,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading
              ? 'Saving...'
              : tab === 'task'
                ? 'Add Task'
                : tab === 'contact'
                  ? 'Add Contact'
                  : 'Save Note'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--color-dim)' }}>
              Ctrl+N to toggle &middot; Esc to close
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
