import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Receipt, Upload, Trash2, ExternalLink, FolderOpen, Pencil, Search } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'
import ContextMenu, { ContextMenuItem } from '@/components/ui/ContextMenu'
import { invoiceFiles } from '@/lib/api'

interface InvoiceFile {
  id: string
  client_id: string
  client_name?: string
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

export default function Invoices() {
  const { clients } = useAppStore()

  const [files, setFiles] = useState<InvoiceFile[]>([])
  const [activeClient, setActiveClient] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Load files ── */
  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const all = await invoiceFiles.getAll()
      setFiles(all || [])
    } catch {
      setFiles([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadFiles() }, [loadFiles])

  /* ── Derived data ── */
  // Clients that have at least one invoice file
  const clientsWithFiles = useMemo(() => {
    const ids = new Set(files.map(f => f.client_id))
    return clients.filter(c => ids.has(c.id))
  }, [clients, files])

  // Count per client
  const countByClient = useMemo(() => {
    const map: Record<string, number> = {}
    files.forEach(f => { map[f.client_id] = (map[f.client_id] || 0) + 1 })
    return map
  }, [files])

  // Visible files
  const visible = useMemo(() => {
    let list = files
    if (activeClient !== 'all') list = list.filter(f => f.client_id === activeClient)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(f => f.name.toLowerCase().includes(q) || (f.client_name || '').toLowerCase().includes(q))
    }
    return list
  }, [files, activeClient, search])

  /* ── Upload ── */
  const uploadFiles = async (fileList: FileList | File[]) => {
    // Must have a client selected (not "All")
    if (activeClient === 'all') {
      showToast('Select a client tab first to upload invoices', 'warn')
      return
    }
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      try {
        await invoiceFiles.upload(activeClient, file.name, file)
        showToast(`Uploaded ${file.name}`, 'success')
      } catch (err: any) {
        console.error('Upload error:', err)
        showToast(`Failed to upload ${file.name}`, 'error')
      }
    }
    await loadFiles()
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files
    if (!f || f.length === 0) return
    await uploadFiles(f)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files
    if (f.length > 0) await uploadFiles(f)
  }

  /* ── Open file ── */
  const openFile = async (doc: InvoiceFile) => {
    try {
      const signedUrl = await invoiceFiles.getFileUrl(doc.id)
      if (signedUrl) window.open(signedUrl, '_blank')
    } catch {
      showToast('Could not open file', 'error')
    }
  }

  /* ── Delete ── */
  const deleteFile = async (id: string, fileName: string) => {
    try {
      await invoiceFiles.delete(id)
      showToast(`Deleted ${fileName}`, 'info')
      await loadFiles()
    } catch {
      showToast('Delete failed', 'error')
    }
  }

  /* ── Rename ── */
  const startRename = (doc: InvoiceFile) => {
    setRenamingId(doc.id)
    setRenameValue(doc.name)
  }

  const submitRename = async () => {
    if (!renamingId || !renameValue.trim()) return
    try {
      await invoiceFiles.rename(renamingId, renameValue.trim())
      showToast('File renamed', 'success')
      await loadFiles()
    } catch {
      showToast('Rename failed', 'error')
    }
    setRenamingId(null)
    setRenameValue('')
  }

  const activeClientName = activeClient === 'all'
    ? 'All Clients'
    : clients.find(c => c.id === activeClient)?.name || 'Client'

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
          <h1>Invoices</h1>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {files.length} invoice{files.length !== 1 ? 's' : ''} across {clientsWithFiles.length} client{clientsWithFiles.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoices..."
              className="bg-cell border border-border text-polar pl-8 pr-3 py-1.5 font-sans outline-none focus:border-dim transition-colors"
              style={{ fontSize: '12px', width: '200px' }}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.txt,.csv"
            onChange={handleUpload}
            className="hidden"
            id="invoice-upload"
          />
          <button
            onClick={() => {
              if (activeClient === 'all') {
                showToast('Select a client tab first to upload invoices', 'warn')
                return
              }
              fileInputRef.current?.click()
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Upload size={12} /> Upload
          </button>
        </div>
      </div>

      {/* Client Tabs */}
      <div className="flex items-center gap-0 border-b border-border overflow-x-auto">
        {/* All tab */}
        <button
          onClick={() => setActiveClient('all')}
          className={`px-4 py-2.5 font-sans transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
            activeClient === 'all'
              ? 'text-polar border-polar'
              : 'text-dim border-transparent hover:text-steel'
          }`}
          style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          All
          <span className="ml-1.5 mono" style={{ fontSize: '10px', opacity: 0.5 }}>
            {files.length}
          </span>
        </button>

        {/* Clients with files come first, then remaining clients */}
        {[...clientsWithFiles, ...clients.filter(c => !clientsWithFiles.some(cw => cw.id === c.id))].map(client => (
          <button
            key={client.id}
            onClick={() => setActiveClient(client.id)}
            className={`px-4 py-2.5 font-sans transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              activeClient === client.id
                ? 'text-polar border-polar'
                : 'text-dim border-transparent hover:text-steel'
            }`}
            style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            {client.name}
            {(countByClient[client.id] ?? 0) > 0 && (
              <span className="ml-1.5 mono" style={{ fontSize: '10px', opacity: 0.5 }}>
                {countByClient[client.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* File list */}
      {loading ? (
        <p className="text-dim text-center py-12" style={{ fontSize: '13px' }}>Loading...</p>
      ) : visible.length === 0 ? (
        <div
          onClick={() => {
            if (activeClient === 'all') {
              showToast('Select a client tab first to upload invoices', 'warn')
              return
            }
            fileInputRef.current?.click()
          }}
          className={`border-2 border-dashed py-16 flex flex-col items-center justify-center cursor-pointer transition-all ${
            dragOver ? 'border-polar bg-surface' : 'border-border-hard hover:border-dim'
          }`}
        >
          <FolderOpen size={32} className="text-dim mb-3" />
          <p className="text-polar font-[700]" style={{ fontSize: '14px' }}>
            {activeClient === 'all' ? 'No invoices uploaded yet' : `No invoices for ${activeClientName}`}
          </p>
          <p className="text-dim mt-1" style={{ fontSize: '12px' }}>
            {activeClient === 'all'
              ? 'Select a client tab, then upload invoice files'
              : 'Click to upload or drag files here'}
          </p>
        </div>
      ) : (
        <div className="border border-border">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-border bg-surface">
            <span className="label text-dim col-span-1"></span>
            <span className="label text-dim col-span-4">FILE NAME</span>
            {activeClient === 'all' && <span className="label text-dim col-span-2">CLIENT</span>}
            <span className={`label text-dim ${activeClient === 'all' ? 'col-span-1' : 'col-span-2'}`}>SIZE</span>
            <span className={`label text-dim ${activeClient === 'all' ? 'col-span-3' : 'col-span-4'}`}>UPLOADED</span>
            <span className="label text-dim col-span-1 text-right">ACTIONS</span>
          </div>
          {visible.map(doc => {
            const ctxItems: ContextMenuItem[] = [
              { label: 'Open', icon: ExternalLink, action: () => openFile(doc) },
              { label: 'Rename', icon: Pencil, action: () => startRename(doc) },
              { label: '', action: () => {}, divider: true },
              { label: 'Delete', icon: Trash2, action: () => deleteFile(doc.id, doc.name), danger: true },
            ]

            const isRenaming = renamingId === doc.id

            return (
              <ContextMenu key={doc.id} items={ctxItems}>
                <div
                  className="table-row grid grid-cols-12 gap-4 px-4 py-3 items-center cursor-pointer"
                  onClick={() => { if (!isRenaming) openFile(doc) }}
                >
                  <div className="col-span-1 text-center" style={{ fontSize: '16px' }}>
                    {fileIcon(doc.name)}
                  </div>
                  <div className="col-span-4 flex items-center gap-2">
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
                      <span className="text-polar font-[600] truncate" style={{ fontSize: '13px' }}>{doc.name}</span>
                    )}
                  </div>
                  {activeClient === 'all' && (
                    <span className="col-span-2 text-steel truncate" style={{ fontSize: '12px' }}>
                      {doc.client_name || '—'}
                    </span>
                  )}
                  <span className={`mono text-dim ${activeClient === 'all' ? 'col-span-1' : 'col-span-2'}`}>
                    {formatFileSize(doc.size)}
                  </span>
                  <span className={`mono text-dim ${activeClient === 'all' ? 'col-span-3' : 'col-span-4'}`}>
                    {formatDate(doc.uploaded_at, 'MMM d, yyyy h:mm a')}
                  </span>
                  <div className="col-span-1 flex justify-end gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); deleteFile(doc.id, doc.name) }}
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
      {dragOver && visible.length > 0 && (
        <div className="border-2 border-dashed border-polar bg-surface py-6 flex flex-col items-center justify-center transition-all">
          <Upload size={20} className="text-polar mb-2" />
          <p className="text-polar font-[600]" style={{ fontSize: '12px' }}>
            Drop files to upload to {activeClientName}
          </p>
        </div>
      )}
    </div>
  )
}
