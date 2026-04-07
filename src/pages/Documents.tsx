import { useState, useEffect, useRef, useCallback } from 'react'
import { FileText, Upload, Trash2, ExternalLink, FolderOpen, Pencil, Eye } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'
import ContextMenu, { ContextMenuItem } from '@/components/ui/ContextMenu'
import { documents } from '@/lib/api'
import FilePreview from '@/components/ui/FilePreview'

/* ── Category mapping ── */
const CATEGORIES = [
  { key: 'corporate', label: 'Corporate' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'tax-docs', label: 'Tax Docs' },
  { key: 'proposals', label: 'Proposals' },
  { key: 'audits', label: 'Audits' },
  { key: 'other', label: 'Other' },
] as const

type CatKey = typeof CATEGORIES[number]['key']

const catLabel = (key: string) => CATEGORIES.find(c => c.key === key)?.label || key

interface DocFile {
  id: string
  category: string
  name: string
  size: number
  file_path: string
  uploaded_at: string
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return '📄'
  if (['doc', 'docx'].includes(ext || '')) return '📝'
  if (['xls', 'xlsx'].includes(ext || '')) return '📊'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return '🖼'
  if (['zip', 'rar', '7z'].includes(ext || '')) return '📦'
  return '📎'
}

export default function Documents() {
  const [activeKey, setActiveKey] = useState<CatKey>('corporate')
  const [docs, setDocs] = useState<DocFile[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewName, setPreviewName] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async (catKey: string) => {
    setLoading(true)
    try {
      const files = await documents.getByCategory(catKey)
      setDocs(files || [])
    } catch {
      setDocs([])
    }
    setLoading(false)
  }, [])

  const loadCounts = useCallback(async () => {
    const c: Record<string, number> = {}
    for (const cat of CATEGORIES) {
      try {
        const files = await documents.getByCategory(cat.key)
        c[cat.key] = files?.length || 0
      } catch {
        c[cat.key] = 0
      }
    }
    setCounts(c)
  }, [])

  useEffect(() => { loadDocs(activeKey) }, [activeKey, loadDocs])
  useEffect(() => { loadCounts() }, [loadCounts])

  /* ── Upload ── */
  const uploadFiles = async (files: FileList | File[]) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        await documents.upload(activeKey, file.name, file)
        showToast(`Uploaded ${file.name}`, 'success')
      } catch (err: any) {
        console.error('Upload error:', err)
        showToast(`Failed to upload ${file.name}`, 'error')
      }
    }
    await loadDocs(activeKey)
    await loadCounts()
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await uploadFiles(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) await uploadFiles(files)
  }

  /* ── Open file — in-app preview (works on all devices including mobile) ── */
  const openFile = async (doc: DocFile) => {
    try {
      const signedUrl = await documents.getFileUrl(doc.id)
      if (signedUrl) {
        setPreviewUrl(signedUrl)
        setPreviewName(doc.name)
        setPreviewOpen(true)
      }
    } catch (err: any) {
      console.error('Document open failed:', err)
      showToast(err?.message || 'Could not open file', 'error')
    }
  }


  /* ── Delete ── */
  const deleteDoc = async (id: string, fileName: string) => {
    try {
      await documents.delete(id)
      showToast(`Deleted ${fileName}`, 'info')
      await loadDocs(activeKey)
      await loadCounts()
    } catch (err: any) {
      console.error('Document delete failed:', err)
      showToast(err?.message || 'Delete failed', 'error')
    }
  }

  /* ── Rename ── */
  const startRename = (doc: DocFile) => {
    setRenamingId(doc.id)
    setRenameValue(doc.name)
  }

  const submitRename = async () => {
    if (!renamingId || !renameValue.trim()) return
    try {
      await documents.rename(renamingId, renameValue.trim())
      showToast('File renamed', 'success')
      await loadDocs(activeKey)
    } catch (err: any) {
      console.error('Document rename failed:', err)
      showToast(err?.message || 'Rename failed', 'error')
    }
    setRenamingId(null)
    setRenameValue('')
  }

  const totalDocs = Object.values(counts).reduce((a, b) => a + b, 0)
  const activeLabel = catLabel(activeKey)

  return (
    <div
      className="space-y-5"
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Documents</h1>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {totalDocs} document{totalDocs !== 1 ? 's' : ''} across {CATEGORIES.length} categories
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.txt,.csv"
            onChange={handleUpload}
            className="hidden"
            id="doc-upload"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary flex items-center gap-2"
          >
            <Upload size={12} /> Upload
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveKey(cat.key)}
            className={`px-4 py-2.5 font-sans transition-colors cursor-pointer border-b-2 ${
              activeKey === cat.key
                ? 'text-polar border-polar'
                : 'text-dim border-transparent hover:text-steel'
            }`}
            style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            {cat.label}
            {(counts[cat.key] ?? 0) > 0 && (
              <span className="ml-1.5 mono" style={{ fontSize: '10px', opacity: 0.5 }}>
                {counts[cat.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* File list */}
      {loading ? (
        <p className="text-dim text-center py-12" style={{ fontSize: '13px' }}>Loading...</p>
      ) : docs.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed py-16 flex flex-col items-center justify-center cursor-pointer transition-all ${
            dragOver ? 'border-polar bg-surface' : 'border-border-hard hover:border-dim'
          }`}
        >
          <FolderOpen size={32} className="text-dim mb-3" />
          <p className="text-polar font-[700]" style={{ fontSize: '14px' }}>
            No {activeLabel.toLowerCase()} documents
          </p>
          <p className="text-dim mt-1" style={{ fontSize: '12px' }}>
            Click to upload or drag files here
          </p>
        </div>
      ) : (
        <div className="border border-border overflow-x-auto">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-border bg-surface min-w-[700px]">
            <span className="label text-dim col-span-1"></span>
            <span className="label text-dim col-span-5">FILE NAME</span>
            <span className="label text-dim col-span-2">SIZE</span>
            <span className="label text-dim col-span-3">UPLOADED</span>
            <span className="label text-dim col-span-1 text-right">ACTIONS</span>
          </div>
          {docs.map(doc => {

            const ctxItems: ContextMenuItem[] = [
              { label: 'Preview', icon: Eye, action: () => openFile(doc) },
              { label: 'Rename', icon: Pencil, action: () => startRename(doc) },
              { label: '', action: () => {}, divider: true },
              { label: 'Delete', icon: Trash2, action: () => deleteDoc(doc.id, doc.name), danger: true },
            ]

            const isRenaming = renamingId === doc.id

            return (
              <ContextMenu key={doc.id} items={ctxItems}>
                <div
                  className="table-row grid grid-cols-12 gap-4 px-4 py-3 items-center cursor-pointer min-w-[700px]"
                  onClick={() => { if (!isRenaming) openFile(doc) }}
                >
                  <div className="col-span-1 text-center" style={{ fontSize: '16px' }}>
                    {fileIcon(doc.name)}
                  </div>
                  <div className="col-span-5 flex items-center gap-2">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') submitRename()
                          if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                        }}
                        onBlur={submitRename}
                        onClick={e => e.stopPropagation()}
                        className="w-full bg-surface border border-border px-2 py-1 text-polar focus:outline-none focus:border-dim"
                        style={{ fontSize: '13px' }}
                      />
                    ) : (
                      <>
                        <span className="text-polar font-[600] truncate" style={{ fontSize: '13px' }}>{doc.name}</span>
                      </>
                    )}
                  </div>
                  <span className="col-span-2 mono text-dim">{formatFileSize(doc.size)}</span>
                  <span className="col-span-3 mono text-dim">{formatDate(doc.uploaded_at, 'MMM d, yyyy h:mm a')}</span>
                  <div className="col-span-1 flex justify-end gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); deleteDoc(doc.id, doc.name) }}
                      className="text-dim hover:text-err transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </ContextMenu>
            )
          })}
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && docs.length > 0 && (
        <div className="border-2 border-dashed border-polar bg-surface py-6 flex flex-col items-center justify-center transition-all">
          <Upload size={20} className="text-polar mb-2" />
          <p className="text-polar font-[600]" style={{ fontSize: '12px' }}>Drop files to upload to {activeLabel}</p>
        </div>
      )}

      {/* In-app file preview (works on mobile, laptop, desktop) */}
      <FilePreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        url={previewUrl}
        fileName={previewName}
      />
    </div>
  )
}
