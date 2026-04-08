import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Receipt, Upload, Trash2, ExternalLink, FolderOpen, Pencil, Search, FileText, FileSpreadsheet, Image, Archive, File, Download, DollarSign, Eye, Plus, Send, X, Mail } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import type { Invoice } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'
import { exportToCSV } from '@/lib/export-csv'
import ContextMenu, { ContextMenuItem } from '@/components/ui/ContextMenu'
import { invoiceFiles, invoices as invoicesApi } from '@/lib/api'
import { SkeletonTable } from '@/components/ui/Skeleton'
import FilePreview from '@/components/ui/FilePreview'
import Modal from '@/components/ui/Modal'
import { generateInvoicePDF, type LineItem, type InvoiceData } from '@/lib/invoice-pdf'
import { isGmailConnected, connectGmail, sendEmailWithAttachment } from '@/lib/gmail'
import { format, addDays } from 'date-fns'

interface InvoiceFile {
  id: string
  client_id: string
  client_name?: string
  name: string
  size: number
  file_path: string
  uploaded_at: string
}

interface InvoiceNotes {
  line_items: LineItem[]
  tax_rate: number
  payment_terms: string
  memo: string
  from_name: string
  from_email: string
}

function parseInvoiceNotes(notes: string | null): InvoiceNotes | null {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes)
    if (parsed && Array.isArray(parsed.line_items)) return parsed as InvoiceNotes
    return null
  } catch {
    return null
  }
}

function displayMemo(notes: string | null): string {
  if (!notes) return ''
  const parsed = parseInvoiceNotes(notes)
  return parsed ? (parsed.memo || '') : notes
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
  if (inv.status === 'sent') return { label: 'Sent', badgeClass: 'badge badge-warn' }
  if (inv.status === 'draft') return { label: 'Draft', badgeClass: 'badge' }
  if (inv.due_date && new Date(inv.due_date) < new Date()) return { label: 'Overdue', badgeClass: 'badge badge-err' }
  return { label: 'Pending', badgeClass: 'badge badge-warn' }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd')
const defaultDueStr = () => format(addDays(new Date(), 30), 'yyyy-MM-dd')

export default function Invoices() {
  const { clients, invoices, selectedInvoiceId, setSelectedInvoiceId, refreshInvoices } = useAppStore()

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

  // Builder modal state
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [builderFromName, setBuilderFromName] = useState('Grow The Hype')
  const [builderFromEmail, setBuilderFromEmail] = useState('omar@growthehype.ca')
  const [builderClientId, setBuilderClientId] = useState<string>('')
  const [builderClientEmail, setBuilderClientEmail] = useState('')
  const [builderNum, setBuilderNum] = useState('')
  const [builderDate, setBuilderDate] = useState(todayStr())
  const [builderDueDate, setBuilderDueDate] = useState(defaultDueStr())
  const [builderLineItems, setBuilderLineItems] = useState<LineItem[]>([{ description: '', qty: 1, rate: 0 }])
  const [builderTaxRate, setBuilderTaxRate] = useState(5)
  const [builderTerms, setBuilderTerms] = useState('Net 30')
  const [builderMemo, setBuilderMemo] = useState('')
  const [builderSaving, setBuilderSaving] = useState(false)

  // Email send modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [pendingSendInvoiceId, setPendingSendInvoiceId] = useState<string | null>(null)

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
  const clientsWithFiles = useMemo(() => {
    const ids = new Set(files.map(f => f.client_id))
    return clients.filter(c => ids.has(c.id))
  }, [clients, files])

  const countByClient = useMemo(() => {
    const map: Record<string, number> = {}
    files.forEach(f => { map[f.client_id] = (map[f.client_id] || 0) + 1 })
    return map
  }, [files])

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

  /* ── Builder helpers ── */
  const resetBuilder = () => {
    setEditingInvoiceId(null)
    setBuilderFromName('Grow The Hype')
    setBuilderFromEmail('omar@growthehype.ca')
    setBuilderClientId('')
    setBuilderClientEmail('')
    setBuilderNum('')
    setBuilderDate(todayStr())
    setBuilderDueDate(defaultDueStr())
    setBuilderLineItems([{ description: '', qty: 1, rate: 0 }])
    setBuilderTaxRate(5)
    setBuilderTerms('Net 30')
    setBuilderMemo('')
  }

  const openNewInvoice = async () => {
    resetBuilder()
    try {
      const nextNum = await invoicesApi.getNextNum()
      setBuilderNum(nextNum)
    } catch {
      setBuilderNum('GTH-001')
    }
    if (activeClient !== 'all') {
      setBuilderClientId(activeClient)
      const cl = clients.find(c => c.id === activeClient)
      if (cl?.email) setBuilderClientEmail(cl.email)
    }
    setBuilderOpen(true)
  }

  const openEditInvoice = (inv: Invoice) => {
    resetBuilder()
    setEditingInvoiceId(inv.id)
    setBuilderNum(inv.num || '')
    setBuilderDate(inv.sent_date || inv.created_at?.split('T')[0] || todayStr())
    setBuilderDueDate(inv.due_date || defaultDueStr())
    setBuilderClientId(inv.client_id || '')

    const cl = clients.find(c => c.id === inv.client_id)
    setBuilderClientEmail(cl?.email || '')

    const parsed = parseInvoiceNotes(inv.notes)
    if (parsed) {
      setBuilderFromName(parsed.from_name || 'Grow The Hype')
      setBuilderFromEmail(parsed.from_email || 'omar@growthehype.ca')
      setBuilderLineItems(parsed.line_items.length > 0 ? parsed.line_items : [{ description: '', qty: 1, rate: 0 }])
      setBuilderTaxRate(parsed.tax_rate ?? 5)
      setBuilderTerms(parsed.payment_terms || 'Net 30')
      setBuilderMemo(parsed.memo || '')
    } else {
      // Legacy invoice — prefill with single line item
      setBuilderLineItems([{ description: 'Services', qty: 1, rate: inv.amount || 0 }])
      setBuilderMemo(inv.notes || '')
    }

    setBuilderOpen(true)
  }

  const builderSubtotal = builderLineItems.reduce((sum, li) => sum + li.qty * li.rate, 0)
  const builderTaxAmount = builderSubtotal * (builderTaxRate / 100)
  const builderTotal = builderSubtotal + builderTaxAmount

  const getBuilderClientName = () => {
    if (!builderClientId) return ''
    return clients.find(c => c.id === builderClientId)?.name || ''
  }

  const buildNotesJSON = (): string => {
    const notes: InvoiceNotes = {
      line_items: builderLineItems,
      tax_rate: builderTaxRate,
      payment_terms: builderTerms,
      memo: builderMemo,
      from_name: builderFromName,
      from_email: builderFromEmail,
    }
    return JSON.stringify(notes)
  }

  const buildInvoiceData = (): InvoiceData => ({
    invoiceNum: builderNum,
    date: builderDate,
    dueDate: builderDueDate,
    fromName: builderFromName,
    fromEmail: builderFromEmail,
    clientName: getBuilderClientName(),
    clientEmail: builderClientEmail,
    lineItems: builderLineItems,
    taxRate: builderTaxRate,
    paymentTerms: builderTerms,
    memo: builderMemo,
  })

  const handlePreviewPDF = () => {
    try {
      const doc = generateInvoicePDF(buildInvoiceData())
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err: any) {
      showToast('Failed to generate PDF preview', 'error')
      console.error(err)
    }
  }

  const handleSaveDraft = async () => {
    if (!builderClientId) {
      showToast('Please select a client', 'warn')
      return
    }
    setBuilderSaving(true)
    try {
      const payload = {
        num: builderNum,
        client_id: builderClientId,
        amount: Math.round(builderTotal),
        sent_date: builderDate,
        due_date: builderDueDate,
        status: 'draft',
        notes: buildNotesJSON(),
      }
      if (editingInvoiceId) {
        await invoicesApi.update(editingInvoiceId, payload)
        showToast('Invoice updated', 'success')
      } else {
        await invoicesApi.create(payload)
        showToast('Invoice saved as draft', 'success')
      }
      await refreshInvoices()
      setBuilderOpen(false)
    } catch (err: any) {
      showToast(err?.message || 'Failed to save invoice', 'error')
      console.error(err)
    }
    setBuilderSaving(false)
  }

  const handleSendInvoice = async () => {
    if (!builderClientId) {
      showToast('Please select a client', 'warn')
      return
    }

    // Save first
    setBuilderSaving(true)
    try {
      const payload = {
        num: builderNum,
        client_id: builderClientId,
        amount: Math.round(builderTotal),
        sent_date: builderDate,
        due_date: builderDueDate,
        status: 'draft',
        notes: buildNotesJSON(),
      }
      let invoiceId = editingInvoiceId
      if (editingInvoiceId) {
        await invoicesApi.update(editingInvoiceId, payload)
      } else {
        const created = await invoicesApi.create(payload)
        invoiceId = created.id
      }
      await refreshInvoices()
      setBuilderSaving(false)
      setBuilderOpen(false)

      // Open email modal
      setPendingSendInvoiceId(invoiceId)
      setEmailTo(builderClientEmail)
      setEmailSubject(`Invoice ${builderNum} from Grow The Hype`)
      setEmailBody(`Hi ${getBuilderClientName()},\n\nPlease find attached invoice ${builderNum} for ${formatCurrency(Math.round(builderTotal))}.\n\nDue date: ${builderDueDate}\n\nThank you for your business!\n\nBest regards,\n${builderFromName}`)
      setEmailModalOpen(true)
    } catch (err: any) {
      showToast(err?.message || 'Failed to save invoice', 'error')
      console.error(err)
      setBuilderSaving(false)
    }
  }

  const handleSendEmail = async () => {
    if (!isGmailConnected()) {
      connectGmail()
      return
    }
    setEmailSending(true)
    try {
      const doc = generateInvoicePDF(buildInvoiceData())
      // Get base64 without the data URI prefix
      const pdfBase64 = doc.output('datauristring').split(',')[1]

      await sendEmailWithAttachment({
        to: emailTo,
        subject: emailSubject,
        body: emailBody,
        attachmentBase64: pdfBase64,
        attachmentName: `Invoice-${builderNum}.pdf`,
      })

      // Update invoice status to sent
      if (pendingSendInvoiceId) {
        await invoicesApi.update(pendingSendInvoiceId, {
          status: 'sent',
          sent_date: todayStr(),
        })
        await refreshInvoices()
      }

      showToast('Invoice sent successfully!', 'success')
      setEmailModalOpen(false)
    } catch (err: any) {
      showToast(err?.message || 'Failed to send email', 'error')
      console.error(err)
    }
    setEmailSending(false)
  }

  const handleSendExistingInvoice = (inv: Invoice) => {
    // Open builder pre-filled, then send
    openEditInvoice(inv)
    // We'll let user review and click Send from builder
  }

  const handleDownloadPDF = (inv: Invoice) => {
    const parsed = parseInvoiceNotes(inv.notes)
    const cl = clients.find(c => c.id === inv.client_id)
    const data: InvoiceData = {
      invoiceNum: inv.num || '',
      date: inv.sent_date || inv.created_at?.split('T')[0] || '',
      dueDate: inv.due_date || '',
      fromName: parsed?.from_name || 'Grow The Hype',
      fromEmail: parsed?.from_email || 'omar@growthehype.ca',
      clientName: inv.client_name || cl?.name || '',
      clientEmail: cl?.email || '',
      lineItems: parsed?.line_items || [{ description: 'Services', qty: 1, rate: inv.amount || 0 }],
      taxRate: parsed?.tax_rate ?? 0,
      paymentTerms: parsed?.payment_terms || '',
      memo: parsed?.memo || '',
    }
    try {
      const doc = generateInvoicePDF(data)
      doc.save(`Invoice-${inv.num || 'draft'}.pdf`)
    } catch (err: any) {
      showToast('Failed to generate PDF', 'error')
      console.error(err)
    }
  }

  // Update line item helper
  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setBuilderLineItems(prev => prev.map((li, i) => i === index ? { ...li, [field]: value } : li))
  }

  const addLineItem = () => {
    setBuilderLineItems(prev => [...prev, { description: '', qty: 1, rate: 0 }])
  }

  const removeLineItem = (index: number) => {
    setBuilderLineItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index))
  }

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
          <button
            onClick={openNewInvoice}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={12} /> New Invoice
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
            className="btn-ghost flex items-center gap-2"
          >
            <Upload size={12} /> Upload
          </button>
        </div>
      </div>

      {/* Client Tabs */}
      <div className="flex items-center gap-0 border-b border-border overflow-x-auto">
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
            <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-border bg-surface min-w-[700px]">
              <span className="label text-dim col-span-2">INVOICE #</span>
              <span className="label text-dim col-span-2">CLIENT</span>
              <span className="label text-dim col-span-2 text-right">AMOUNT</span>
              <span className="label text-dim col-span-1 text-center">STATUS</span>
              <span className="label text-dim col-span-2">DUE DATE</span>
              <span className="label text-dim col-span-1">NOTES</span>
              <span className="label text-dim col-span-2 text-right">ACTIONS</span>
            </div>
            {filteredInvoices.map(inv => {
              const st = getInvoiceStatus(inv)
              return (
                <div
                  key={inv.id}
                  data-invoice-id={inv.id}
                  className="table-row grid grid-cols-12 gap-4 px-4 py-3 items-center min-w-[700px] cursor-pointer"
                  onClick={() => openEditInvoice(inv)}
                >
                  <span className="col-span-2 text-polar font-[600] mono" style={{ fontSize: '13px' }}>
                    {inv.num || '---'}
                  </span>
                  <span className="col-span-2 text-steel truncate" style={{ fontSize: '12px' }}>
                    {inv.client_name || '---'}
                  </span>
                  <span className="col-span-2 text-polar font-[600] mono text-right" style={{ fontSize: '13px' }}>
                    {formatCurrency(inv.amount || 0)}
                  </span>
                  <div className="col-span-1 flex justify-center">
                    <span className={st.badgeClass}>
                      {st.label}
                    </span>
                  </div>
                  <span className="col-span-2 mono text-dim" style={{ fontSize: '12px' }}>
                    {inv.due_date ? formatDate(inv.due_date, 'MMM d, yyyy') : '---'}
                  </span>
                  <span className="col-span-1 text-dim truncate" style={{ fontSize: '11px' }}>
                    {displayMemo(inv.notes)}
                  </span>
                  <div className="col-span-2 flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleDownloadPDF(inv)}
                      className="text-dim hover:text-polar transition-colors"
                      title="Download PDF"
                    >
                      <Download size={13} />
                    </button>
                    {inv.status !== 'sent' && inv.status !== 'paid' && (
                      <button
                        onClick={() => handleSendExistingInvoice(inv)}
                        className="text-dim hover:text-polar transition-colors"
                        title="Send Invoice"
                      >
                        <Send size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => openEditInvoice(inv)}
                      className="text-dim hover:text-polar transition-colors"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
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
                      {doc.client_name || '---'}
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

      {/* In-app file preview */}
      <FilePreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        url={previewUrl}
        fileName={previewName}
      />

      {/* ── Invoice Builder Modal ── */}
      <Modal open={builderOpen} onClose={() => setBuilderOpen(false)} title={editingInvoiceId ? 'Edit Invoice' : 'Create Invoice'} width="700px">
        <div className="space-y-5">
          {/* From / To */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <span className="label text-dim">FROM</span>
              <input
                value={builderFromName}
                onChange={e => setBuilderFromName(e.target.value)}
                placeholder="Company name"
                className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
              <input
                value={builderFromEmail}
                onChange={e => setBuilderFromEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
            <div className="space-y-3">
              <span className="label text-dim">TO</span>
              <select
                value={builderClientId}
                onChange={e => {
                  const cid = e.target.value
                  setBuilderClientId(cid)
                  const cl = clients.find(c => c.id === cid)
                  if (cl?.email) setBuilderClientEmail(cl.email)
                  else setBuilderClientEmail('')
                }}
                className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              >
                <option value="">Select client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                value={builderClientEmail}
                onChange={e => setBuilderClientEmail(e.target.value)}
                placeholder="Client email"
                className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
          </div>

          {/* Invoice details row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <span className="label text-dim">INVOICE #</span>
              <input
                value={builderNum}
                onChange={e => setBuilderNum(e.target.value)}
                className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors mono"
                style={{ fontSize: '12px' }}
              />
            </div>
            <div className="space-y-1">
              <span className="label text-dim">DATE</span>
              <input
                type="date"
                value={builderDate}
                onChange={e => setBuilderDate(e.target.value)}
                className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
            <div className="space-y-1">
              <span className="label text-dim">DUE DATE</span>
              <input
                type="date"
                value={builderDueDate}
                onChange={e => setBuilderDueDate(e.target.value)}
                className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <span className="label text-dim">LINE ITEMS</span>
            <div className="border border-border">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-surface border-b border-border">
                <span className="label text-dim col-span-5" style={{ fontSize: '10px' }}>DESCRIPTION</span>
                <span className="label text-dim col-span-2 text-center" style={{ fontSize: '10px' }}>QTY</span>
                <span className="label text-dim col-span-2 text-center" style={{ fontSize: '10px' }}>RATE</span>
                <span className="label text-dim col-span-2 text-right" style={{ fontSize: '10px' }}>AMOUNT</span>
                <span className="col-span-1"></span>
              </div>
              {builderLineItems.map((li, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-border last:border-b-0">
                  <input
                    value={li.description}
                    onChange={e => updateLineItem(i, 'description', e.target.value)}
                    placeholder="Description"
                    className="col-span-5 bg-cell border border-border text-polar px-2 py-1.5 font-sans outline-none focus:border-dim transition-colors"
                    style={{ fontSize: '12px' }}
                  />
                  <input
                    type="number"
                    min={0}
                    value={li.qty}
                    onChange={e => updateLineItem(i, 'qty', parseFloat(e.target.value) || 0)}
                    className="col-span-2 bg-cell border border-border text-polar px-2 py-1.5 font-sans outline-none focus:border-dim transition-colors text-center mono"
                    style={{ fontSize: '12px' }}
                  />
                  <input
                    type="number"
                    min={0}
                    value={li.rate}
                    onChange={e => updateLineItem(i, 'rate', parseFloat(e.target.value) || 0)}
                    className="col-span-2 bg-cell border border-border text-polar px-2 py-1.5 font-sans outline-none focus:border-dim transition-colors text-center mono"
                    style={{ fontSize: '12px' }}
                  />
                  <span className="col-span-2 text-polar font-[600] mono text-right" style={{ fontSize: '12px' }}>
                    ${(li.qty * li.rate).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={() => removeLineItem(i)}
                      className="text-dim hover:text-err transition-colors"
                      title="Remove"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={addLineItem}
              className="btn-ghost flex items-center gap-1.5"
              style={{ fontSize: '11px' }}
            >
              <Plus size={11} /> Add Line Item
            </button>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="space-y-2 w-[260px]">
              <div className="flex justify-between items-center">
                <span className="text-steel" style={{ fontSize: '12px' }}>Subtotal</span>
                <span className="text-polar mono font-[600]" style={{ fontSize: '13px' }}>
                  ${builderSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-steel" style={{ fontSize: '12px' }}>Tax</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={builderTaxRate}
                    onChange={e => setBuilderTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-14 bg-cell border border-border text-polar px-2 py-1 font-sans outline-none focus:border-dim transition-colors text-center mono"
                    style={{ fontSize: '11px' }}
                  />
                  <span className="text-dim" style={{ fontSize: '11px' }}>%</span>
                </div>
                <span className="text-polar mono" style={{ fontSize: '12px' }}>
                  ${builderTaxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between items-center">
                <span className="text-polar font-[700]" style={{ fontSize: '14px' }}>Total</span>
                <span className="text-polar mono font-[700]" style={{ fontSize: '16px' }}>
                  ${builderTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Footer fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="label text-dim">PAYMENT TERMS</span>
              <input
                value={builderTerms}
                onChange={e => setBuilderTerms(e.target.value)}
                placeholder="e.g., Net 30"
                className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
            <div className="space-y-1">
              <span className="label text-dim">NOTES / MEMO</span>
              <textarea
                value={builderMemo}
                onChange={e => setBuilderMemo(e.target.value)}
                placeholder="Thank you for your business"
                rows={2}
                className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors resize-none"
                style={{ fontSize: '12px' }}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <button
              onClick={handlePreviewPDF}
              className="btn-ghost flex items-center gap-2"
            >
              <Eye size={12} /> Preview PDF
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveDraft}
                disabled={builderSaving}
                className="btn-ghost flex items-center gap-2"
              >
                {builderSaving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                onClick={handleSendInvoice}
                disabled={builderSaving}
                className="btn-primary flex items-center gap-2"
              >
                <Send size={12} /> {builderSaving ? 'Saving...' : 'Send Invoice'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Email Send Modal ── */}
      <Modal open={emailModalOpen} onClose={() => setEmailModalOpen(false)} title="Send Invoice via Email" width="520px">
        <div className="space-y-4">
          {!isGmailConnected() ? (
            <div className="text-center py-6 space-y-4">
              <Mail size={32} className="text-dim mx-auto" />
              <p className="text-steel" style={{ fontSize: '13px' }}>Connect your Gmail account to send invoices directly.</p>
              <button
                onClick={() => connectGmail()}
                className="btn-primary flex items-center gap-2 mx-auto"
              >
                <Mail size={12} /> Connect Gmail
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <span className="label text-dim">TO</span>
                <input
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors"
                  style={{ fontSize: '12px' }}
                />
              </div>
              <div className="space-y-1">
                <span className="label text-dim">SUBJECT</span>
                <input
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors"
                  style={{ fontSize: '12px' }}
                />
              </div>
              <div className="space-y-1">
                <span className="label text-dim">MESSAGE</span>
                <textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  rows={6}
                  className="w-full bg-cell border border-border text-polar px-3 py-2 font-sans outline-none focus:border-dim transition-colors resize-none"
                  style={{ fontSize: '12px' }}
                />
              </div>
              <div className="bg-surface border border-border px-3 py-2 flex items-center gap-2">
                <FileText size={14} className="text-err" />
                <span className="text-steel" style={{ fontSize: '12px' }}>Invoice-{builderNum}.pdf will be attached</span>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setEmailModalOpen(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={emailSending}
                  className="btn-primary flex items-center gap-2"
                >
                  <Send size={12} /> {emailSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
