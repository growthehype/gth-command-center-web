import { useState, useEffect, useRef, useCallback } from 'react'
import { FileText, Plus, Trash2, Check, ChevronLeft } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'
import { notes as notesApi } from '@/lib/api'
import EmptyState from '@/components/ui/EmptyState'

interface NoteItem {
  id: string
  title: string
  content: string
  status: 'active' | 'done'
  created_at: string
  updated_at: string
}

type SaveStatus = 'saved' | 'saving' | 'unsaved'

export default function Notes() {
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [loaded, setLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Load all notes on mount ── */
  useEffect(() => {
    loadNotes()
  }, [])

  const loadNotes = async () => {
    try {
      const raw = await notesApi.get()
      // Parse notes from JSON. Legacy: single string becomes one note.
      if (!raw) {
        setNotes([])
      } else {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            setNotes(parsed)
          } else {
            // Legacy single-string note
            const legacy: NoteItem = {
              id: crypto.randomUUID(),
              title: 'Untitled Note',
              content: raw,
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            setNotes([legacy])
          }
        } catch {
          const legacy: NoteItem = {
            id: crypto.randomUUID(),
            title: 'Untitled Note',
            content: raw,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          setNotes([legacy])
        }
      }
      setLoaded(true)
    } catch {
      showToast('Failed to load notes', 'error')
      setLoaded(true)
    }
  }

  /* ── Save all notes ── */
  const saveAll = useCallback(async (allNotes: NoteItem[]) => {
    setStatus('saving')
    try {
      await notesApi.save(JSON.stringify(allNotes))
      setStatus('saved')
    } catch {
      setStatus('unsaved')
      showToast('Failed to save notes', 'error')
    }
  }, [])

  /* ── Select a note ── */
  const selectNote = (note: NoteItem) => {
    setActiveNoteId(note.id)
    setTitle(note.title)
    setContent(note.content)
    setStatus('saved')
  }

  /* ── Create new note ── */
  const createNote = () => {
    const newNote: NoteItem = {
      id: crypto.randomUUID(),
      title: 'Untitled Note',
      content: '',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const updated = [newNote, ...notes]
    setNotes(updated)
    selectNote(newNote)
    saveAll(updated)
  }

  /* ── Handle typing with debounce ── */
  const handleContentChange = (val: string) => {
    setContent(val)
    setStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const updated = notes.map(n =>
        n.id === activeNoteId ? { ...n, content: val, updated_at: new Date().toISOString() } : n
      )
      setNotes(updated)
      saveAll(updated)
    }, 500)
  }

  const handleTitleChange = (val: string) => {
    setTitle(val)
    setStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const updated = notes.map(n =>
        n.id === activeNoteId ? { ...n, title: val, updated_at: new Date().toISOString() } : n
      )
      setNotes(updated)
      saveAll(updated)
    }, 500)
  }

  /* ── Mark done ── */
  const markDone = (id: string) => {
    const updated = notes.map(n =>
      n.id === id ? { ...n, status: 'done' as const, updated_at: new Date().toISOString() } : n
    )
    setNotes(updated)
    if (activeNoteId === id) setActiveNoteId(null)
    saveAll(updated)
    showToast('Note marked as done', 'success')
  }

  /* ── Delete note ── */
  const deleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id)
    setNotes(updated)
    if (activeNoteId === id) setActiveNoteId(null)
    saveAll(updated)
    showToast('Note deleted', 'info')
  }

  /* ── Cleanup debounce on unmount ── */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const activeNotes = notes.filter(n => n.status === 'active')
  const doneNotes = notes.filter(n => n.status === 'done')
  const activeNote = notes.find(n => n.id === activeNoteId)

  const statusConfig: Record<SaveStatus, { label: string; color: string }> = {
    saved: { label: 'Saved', color: 'text-ok' },
    saving: { label: 'Saving...', color: 'text-warn' },
    unsaved: { label: 'Unsaved changes', color: 'text-err' },
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeNote && (
            <button onClick={() => setActiveNoteId(null)} className="text-dim hover:text-polar transition-colors">
              <ChevronLeft size={18} />
            </button>
          )}
          <h1>Notes</h1>
          <FileText size={14} className="text-dim" />
        </div>
        <div className="flex items-center gap-3">
          {activeNote && (
            <span
              className={`${statusConfig[status].color} font-sans uppercase font-bold`}
              style={{ fontSize: '12px', letterSpacing: '0.14em' }}
            >
              {statusConfig[status].label}
            </span>
          )}
          <button onClick={createNote} className="btn-primary flex items-center gap-2">
            <Plus size={12} /> New Note
          </button>
        </div>
      </div>

      {!loaded ? null : activeNote ? (
        /* ── Editor view ── */
        <div className="space-y-3">
          <input
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Note title..."
            className="w-full bg-transparent text-polar font-[800] outline-none border-b border-border pb-2"
            style={{ fontSize: '18px' }}
          />
          <textarea
            value={content}
            onChange={e => handleContentChange(e.target.value)}
            placeholder="Start writing..."
            className="w-full bg-cell border border-border text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors px-4 py-3 font-mono"
            style={{ fontSize: '15px', lineHeight: '1.8', minHeight: '400px', resize: 'vertical' }}
          />
          <div className="flex items-center gap-3">
            <button onClick={() => markDone(activeNote.id)} className="btn-ghost flex items-center gap-2">
              <Check size={12} /> Mark Done
            </button>
            <button
              onClick={() => deleteNote(activeNote.id)}
              className="text-err hover:underline cursor-pointer font-sans"
              style={{ fontSize: '13px' }}
            >
              Delete Note
            </button>
          </div>
        </div>
      ) : (
        /* ── List view ── */
        <div className="space-y-6">
          {activeNotes.length === 0 && doneNotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No notes yet"
              description="Create a note to capture ideas, reminders, and quick thoughts."
              actionLabel="New Note"
              onAction={createNote}
            />
          ) : (
            <>
              {/* Active notes */}
              {activeNotes.length > 0 && (
                <div className="space-y-2">
                  <span className="label text-dim">ACTIVE</span>
                  {activeNotes.map(note => (
                    <div
                      key={note.id}
                      className="card cursor-pointer flex items-start justify-between gap-4"
                      onClick={() => selectNote(note)}
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="text-polar font-[700] truncate" style={{ fontSize: '15px' }}>{note.title}</h3>
                        <p className="text-dim mt-1 truncate" style={{ fontSize: '13px' }}>
                          {note.content.slice(0, 100) || 'Empty note'}
                        </p>
                        <span className="mono text-dim mt-1 block" style={{ fontSize: '12px' }}>
                          {new Date(note.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); markDone(note.id) }}
                          className="text-dim hover:text-ok transition-colors"
                          title="Mark done"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteNote(note.id) }}
                          className="text-dim hover:text-err transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Done notes */}
              {doneNotes.length > 0 && (
                <div className="space-y-2">
                  <span className="label text-dim">DONE</span>
                  {doneNotes.map(note => (
                    <div
                      key={note.id}
                      className="card opacity-50 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="text-steel font-[700] truncate line-through" style={{ fontSize: '15px' }}>{note.title}</h3>
                        <p className="text-dim mt-1 truncate" style={{ fontSize: '13px' }}>
                          {note.content.slice(0, 100) || 'Empty note'}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="text-dim hover:text-err transition-colors flex-shrink-0"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
