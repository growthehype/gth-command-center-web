import { useState, useMemo, useEffect, useCallback } from 'react'
import { FileText, Plus, Upload, Trash2, ExternalLink, FolderOpen, Search } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import ContextMenu, { type ContextMenuItem } from '@/components/ui/ContextMenu'
import FilterChips from '@/components/ui/FilterChips'
import { formatDate } from '@/lib/utils'
import { documents } from '@/lib/api'
import { SkeletonCard } from '@/components/ui/Skeleton'

// Template categories — stored as "template-<slug>" in the documents table
const CATEGORIES = ['All', 'Letterhead', 'Proposals', 'Invoices', 'Contracts', 'Reports', 'Other'] as const
type Category = (typeof CATEGORIES)[number]

const CATEGORY_PREFIX = 'template-'
const categoryToDb = (cat: Category) => `${CATEGORY_PREFIX}${cat.toLowerCase()}`
const dbToLabel = (dbCat: string) => {
  const slug = dbCat.replace(CATEGORY_PREFIX, '')
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

const BADGE_COLORS: Record<string, string> = {
  letterhead: 'badge badge-ok',
  proposals: 'badge badge-warn',
  invoices: 'badge badge-err',
  contracts: 'badge badge-neutral',
  reports: 'badge badge-ok',
  other: 'badge badge-neutral',
}

interface TemplateDoc {
  id: string
  category: string
  name: string
  size: number
  mime_type: string | null
  file_path: string | null
  uploaded_at: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Templates() {
  const [templates, setTemplates] = useState<TemplateDoc[]>([])
  const [filter, setFilter] = useState<Category>('All')
  const [search, setSearch] = useState('')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadCategory, setUploadCategory] = useState<Category>('Letterhead')
  const [loading, setLoading] = useState(true)

  // Load all documents with template- prefix
  const loadTemplates = useCallback(async () => {
    try {
      const all: TemplateDoc[] = await documents.getAll()
      const filtered = all.filter(d => d.category?.startsWith(CATEGORY_PREFIX))
      setTemplates(filtered)
    } catch {
      showToast('Failed to load templates', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  // Filtered + searched list
  const visible = useMemo(() => {
    let list = filter === 'All'
      ? [...templates]
      : templates.filter(t => t.category === categoryToDb(filter))

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t => (t.name || '').toLowerCase().includes(q))
    }

    list.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
    return list
  }, [templates, filter, search])

  // Category counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { All: templates.length }
    CATEGORIES.forEach(cat => {
      if (cat !== 'All') c[cat] = templates.filter(t => t.category === categoryToDb(cat)).length
    })
    return c
  }, [templates])

  // Upload flow: open file picker via hidden input, then send to IPC
  const handleUpload = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.svg,.txt'
    input.multiple = true
    input.onchange = async () => {
      if (!input.files?.length) return
      const dbCategory = categoryToDb(uploadCategory)

      for (const file of Array.from(input.files)) {
        try {
          await documents.upload(dbCategory, file.name, file)
        } catch {
          showToast(`Failed to upload ${file.name}`, 'error')
        }
      }
      showToast(`Uploaded ${input.files.length} file${input.files.length > 1 ? 's' : ''}`, 'success')
      setUploadModalOpen(false)
      await loadTemplates()
    }
    input.click()
  }

  const deleteTemplate = async (doc: TemplateDoc) => {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return
    try {
      await documents.delete(doc.id)
      showToast(`Deleted "${doc.name}"`, 'info')
      await loadTemplates()
    } catch {
      showToast('Delete failed', 'error')
    }
  }

  const openFile = async (doc: TemplateDoc) => {
    try {
      const signedUrl = await documents.getFileUrl(doc.id)
      if (signedUrl) window.open(signedUrl, '_blank')
    } catch {
      showToast('Could not open file', 'error')
    }
  }

  const contextItems = (doc: TemplateDoc): ContextMenuItem[] => [
    { label: 'Open File', icon: ExternalLink, action: () => openFile(doc) },
    { label: '', action: () => {}, divider: true },
    { label: 'Delete', icon: Trash2, action: () => deleteTemplate(doc), danger: true },
  ]

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'text-red-400'
    if (['doc', 'docx'].includes(ext || '')) return 'text-blue-400'
    if (['xls', 'xlsx'].includes(ext || '')) return 'text-green-400'
    if (['ppt', 'pptx'].includes(ext || '')) return 'text-orange-400'
    if (['png', 'jpg', 'jpeg', 'svg'].includes(ext || '')) return 'text-purple-400'
    return 'text-dim'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3"><h1>File Templates</h1><FileText size={14} className="text-dim" /></div>
            <p className="text-steel mt-1" style={{ fontSize: '13px' }}>Loading templates...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3"><h1>File Templates</h1><FileText size={14} className="text-dim" /></div>
          <p className="text-steel mt-1" style={{ fontSize: '13px' }}>
            {templates.length} template{templates.length !== 1 ? 's' : ''} uploaded
          </p>
        </div>
        <button onClick={() => setUploadModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Upload size={12} /> Upload Template
        </button>
      </div>

      {/* Filter chips + search */}
      <div className="flex items-center gap-3">
        <FilterChips
          options={CATEGORIES.map(cat => ({
            value: cat,
            label: cat,
            count: counts[cat] ?? 0,
          }))}
          value={filter}
          onChange={(v) => setFilter(v as Category)}
        />
        <div className="ml-auto relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="bg-cell border border-border text-polar pl-8 pr-3 py-1.5 font-sans outline-none focus:border-dim transition-colors"
            style={{ fontSize: '12px', width: '200px' }}
          />
        </div>
      </div>

      {/* Grid / Empty */}
      {templates.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No templates uploaded"
          description="Upload your letterhead, proposals, contracts, and other reusable files."
          actionLabel="Upload Template"
          onAction={() => setUploadModalOpen(true)}
        />
      ) : visible.length === 0 ? (
        <p className="text-dim text-center py-12" style={{ fontSize: '13px' }}>No templates match your filter.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map(doc => {
            const catSlug = doc.category?.replace(CATEGORY_PREFIX, '') || 'other'
            return (
              <ContextMenu key={doc.id} items={contextItems(doc)}>
                <div className="bg-cell border border-border hover:border-dim transition-colors p-4 flex flex-col gap-3 group cursor-default">
                  {/* Icon + actions row */}
                  <div className="flex items-start justify-between">
                    <div className={`p-2 bg-surface border border-border ${getFileIcon(doc.name)}`}>
                      <FileText size={20} />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openFile(doc)}
                        className="p-1.5 text-dim hover:text-polar transition-colors"
                        title="Open file"
                      >
                        <ExternalLink size={13} />
                      </button>
                      <button
                        onClick={() => deleteTemplate(doc)}
                        className="p-1.5 text-dim hover:text-err transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* File name */}
                  <div className="min-w-0">
                    <p className="text-polar font-[600] truncate" style={{ fontSize: '13px' }} title={doc.name}>
                      {doc.name}
                    </p>
                  </div>

                  {/* Meta row: badge + size + date */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={BADGE_COLORS[catSlug] || 'badge badge-neutral'}>
                      {dbToLabel(doc.category)}
                    </span>
                    <span className="mono text-dim" style={{ fontSize: '10px' }}>
                      {formatSize(doc.size || 0)}
                    </span>
                  </div>

                  {/* Upload date */}
                  <p className="mono text-dim" style={{ fontSize: '10px' }}>
                    Uploaded {formatDate(doc.uploaded_at, 'MMM d, yyyy')}
                  </p>
                </div>
              </ContextMenu>
            )
          })}
        </div>
      )}

      {/* Upload Modal — pick category then file */}
      <Modal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} title="Upload Template" width="400px">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="label text-dim">CATEGORY</label>
            <select
              value={uploadCategory}
              onChange={e => setUploadCategory(e.target.value as Category)}
              className="w-full bg-surface border border-border px-3 py-2 text-polar font-sans outline-none focus:border-dim"
              style={{ fontSize: '12px' }}
            >
              {CATEGORIES.filter(c => c !== 'All').map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <p className="text-dim" style={{ fontSize: '11px' }}>
            Supported: PDF, Word, Excel, PowerPoint, images, text files.
          </p>

          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleUpload} className="btn-primary flex items-center gap-2">
              <Plus size={12} /> Choose Files
            </button>
            <button onClick={() => setUploadModalOpen(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
