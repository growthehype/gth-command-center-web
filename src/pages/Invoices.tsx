import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Receipt, Upload, Trash2, ExternalLink, FolderOpen, Pencil, Search, FileText, FileSpreadsheet, Image, Archive, File, Download, DollarSign, Eye } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import type { Invoice } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'
import { exportToCSV } from '@/lib/export-csv'
import ContextMenu, { ContextMenuItem } from '@/components/ui/ContextMenu'
import { invoiceFiles } from '@/lib/api'
import { SkeletonTable } from '@/components/ui/Skeleton'
import FilePreview from '@/components/ui/FilePreview'

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
  const base = 'w-7 h-7 flex items-center justify-center rounded-full'
  if (ext === 'pdf')
    return <span className={`${base} bg-err/10`}><FileText size={14} className="text-err" /></span>
  if (['doc', 'docx'].includes(ext || ''))
    return <span className={`${base} bg-blue-500/10`}><FileText size={14} className="text-blue-400" /></span>
  if (['xls', 'xlsx', 'csv'].includes(ext || ''))
    return <span className={`${base} bg-ok/10`}><FileSpreadsheet size={14} className="text-ok" /></span>
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || ''))
    return <span className={`${base} bg-purple-500/10`}><Image size={14} className="text-purple-400" /></span>
  if (['zip', 'rar', '7z'].includes(ext || ''))
    return <span className={`${base} bg-warn/10`}><Archive size={14} className="text-warn" /></span>
  return <span className={`${base} bg-dim/10`}><File size={14} className="text-dim" /></span>
}

function getInvoiceStatus(inv: Invoice): { label: string; badgeClass: string } {
  if (inv.status === 'paid') return { label: 'Paid', badgeClass: 'badge badge-ok' }
  if (inv.due_date && new Date(inv.due_date) < new Date()) return { label: 'Overdue', badgeClass: 'badge badge-err' }
  return { label: 'Pending', badgeClass: 'badge badge-warn' }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

export default function Invoices() {
  const { clients, invoices, selectedInvoiceId, setSelectedInvoiceId } = useAppStore()

  const [files, setFiles] = useState<InvoiceFile[]>([])
  const [activeClient, setActiveClient] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewName, setPreviewName] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
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

  /* ── Cross-page deep-link: scroll to and highlight invoice ── */
  useEffect(() => {
    if (selectedInvoiceId) {
      const el = document.querySelector(`[data-invoice-id="${selectedInvoiceId}"]`) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.style.transition = 'background-color 0.3s'
        el.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
        setTimeout(() => {
          el.style.backgroundColor = ''
        }, 1500)
      }
      setSelectedInvoiceId(null)
    }
  }, [selectedInvoiceId, setSelectedInvoiceId, invoices])

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

  /* ── Open file — in-app preview (works on all devices) ── */
  const openFile = async (doc: InvoiceFile) => {
    try {
      const signedUrl = await invoiceFiles.getFileUrl(doc.id)
      if (signedUrl) {
        setPreviewUrl(signedUrl)
        setPreviewName(doc.name)
        setPreviewOpen(true)
      }
    } catch (err: any) {
      console.error('Invoice file open failed:', err)
      showToast(err?.message || 'Could not open file', 'error')
    }
  }

  /* ── Delete ── */
  const deleteFile = async (id: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return
    try {
      await invoiceFiles.delete(id)
      showToast(`Deleted ${fileName}`, 'info')
      await loadFiles()
    } catch (err: any) {
      console.error('Invoice file delete failed:', err)
      showToast(err?.message || 'Delete failed', 'error')
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
    } catch (err: any) {
      console.error('Invoice file rename failed:', err)
      showToast(err?.message || 'Rename failed', 'error')
    }
    setRenamingId(null)
    setRenameValue('')
  }

  /* ── Invoice records (from store) ── */
  const filteredInvoices = useMemo(() => {
    let list = invoices
    if (activeClient !== 'all') list = list.filter(i => i.client_id === activeClient)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        (i.num || '').toLowerCase().includes(q) ||
        (i.client_name || '').toLowerCase().includes(q) ||
        String(i.amount).includes(q)
      )
    }
    return list
  }, [invoices, activeClient, search])

  const totalOutstanding = useMemo(() =>
    invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + (i.amount || 0), 0),
  [invoices])

  const totalOverdue = useMemo(() =>
    invoices.filter(i => i.status !== 'paid' && i.due_date && new Date(i.due_date) < new Date()).reduce((sum, i) => sum + (i.amount || 0), 0),
  [invoices])

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
          <div className="flex items-center gap-3">
            <h1>Invoices</h1>
            <Receipt size={14} className="text-dim" />
          </div>
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
              className="bg-cell border border-border text-polar pl-8 pr-3 py-1.5 font-sans outline-none focus:border-dim transition-colors w-full md:w-[200px]"
              style={{ fontSize: '12px' }}
            />
          </div>
          <button
            onClick={() => exportToCSV(
              visible.map(f => ({
                name: f.name || '',
                client: f.client_name || '',
                size: formatFileSize(f.size),
                uploaded_date: f.uploaded_at || '',
              })),
              'invoices-export'
            )}
            className="btn-ghost flex items-center gap-2"
          >
            <Download size={12} /> Export CSV
          </button>
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

      {/* Invoice Records */}
      {filteredInvoices.length > 0 && (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="flex items-center gap-6 px-4 py-3 border border-border bg-surface">
            <div className="flex items-center gap-2">
              <DollarSign size={13} className="text-dim" />
              <span className="text-steel" style={{ fontSize: '12px' }}>Total Outstanding:</span>
              <span className="text-polar font-[700] mono" style={{ fontSize: '13px' }}>{formatCurrency(totalOutstanding)}</span>
            </div>
            {totalOverdue > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-steel" style={{ fontSize: '12px' }}>Overdue:</span>
                <span className="text-err font-[700] mono" style={{ fontSize: '13px' }}>{formatCurrency(totalOverdue)}</span>
              </div>
            )}
            <span className="text-dim" style={{ fontSize: '11px' }}>{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Invoice table */}
          <div className="border border-border overflow-x-auto">
            <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-border bg-surface min-w-[600px]">
              <span className="label text-dim col-span-2">INVOICE #</span>
              <span className="label text-dim col-span-3">CLIENT</span>
              <span className="label text-dim col-span-2 text-right">AMOUNT</span>
              <span className="label text-dim col-span-2 text-center">STATUS</span>
              <span className="label text-dim col-span-3">DUE DATE</span>
            </div>
            {filteredInvoices.map(inv => {
              const st = getInvoiceStatus(inv)
              return (
                <div key={inv.id} data-invoice-id={inv.id} className="table-row grid grid-cols-12 gap-4 px-4 py-3 items-center min-w-[600px]">
                  <span className="col-span-2 text-polar font-[600] mono" style={{ fontSize: '13px' }}>
                    {inv.num || '---'}
                  </span>
                  <span className="col-span-3 text-steel truncate" style={{ fontSize: '12px' }}>
                    {inv.client_name || '---'}
                  </span>
                  <span className="col-span-2 text-polar font-[600] mono text-right" style={{ fontSize: '13px' }}>
                    {formatCurrency(inv.amount || 0)}
                  </span>
                  <div className="col-span-2 flex justify-center">
                    <span className={st.badgeClass}>
                      {st.label}
                    </span>
                  </div>
                  <span className="col-span-3 mono text-dim" style={{ fontSize: '12px' }}>
                    {inv.due_date ? formatDate(inv.due_date, 'MMM d, yyyy') : '---'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Uploaded Files ── */}
      <div className="flex items-center gap-2 pt-2">
        <FolderOpen size={13} className="text-dim" />
        <span className="label text-dim">UPLOADED FILES</span>
      </div>

      {/* File list */}
      {loading ? (
        <SkeletonTable rows={6} columns={5} />
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
        <div className="border border-border overflow-x-auto">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-border bg-surface min-w-[700px]">
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
                  className="table-row grid grid-cols-12 gap-4 px-4 py-3 items-center cursor-pointer min-w-[700px]"
                  onClick={() => { if (!isRenaming) openFile(doc) }}
                >
                  <div className="col-span-1 flex items-center justify-center">
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
