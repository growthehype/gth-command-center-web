import { useEffect, useState, useCallback } from 'react'
import { HardDrive, Search, RefreshCw, Folder, FileText, Image, Film, FileSpreadsheet, Presentation, File, ExternalLink, ChevronRight, Grid3X3, List, FolderOpen, X, Clock, Home } from 'lucide-react'
import { isGmailConnected, connectGmail, listDriveFiles, type DriveFile } from '@/lib/gmail'
import { showToast } from '@/components/ui/Toast'
import { format, formatDistanceToNow, isToday, isYesterday, isThisYear } from 'date-fns'

// ── File icon with colored background ──

function FileIcon({ mimeType, size = 'md' }: { mimeType: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'lg' ? 24 : size === 'md' ? 18 : 14
  const pad = size === 'lg' ? 'w-12 h-12' : size === 'md' ? 'w-9 h-9' : 'w-7 h-7'

  const configs: Record<string, { icon: React.ComponentType<any>; color: string; bg: string }> = {
    folder: { icon: Folder, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    doc: { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    sheet: { icon: FileSpreadsheet, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    slides: { icon: Presentation, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    pdf: { icon: FileText, color: 'text-red-400', bg: 'bg-red-500/10' },
    image: { icon: Image, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    video: { icon: Film, color: 'text-pink-400', bg: 'bg-pink-500/10' },
    default: { icon: File, color: 'text-dim', bg: 'bg-surface-2' },
  }

  let key = 'default'
  if (mimeType.includes('folder')) key = 'folder'
  else if (mimeType.includes('document') || mimeType.includes('word')) key = 'doc'
  else if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) key = 'sheet'
  else if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) key = 'slides'
  else if (mimeType === 'application/pdf') key = 'pdf'
  else if (mimeType.startsWith('image/')) key = 'image'
  else if (mimeType.startsWith('video/')) key = 'video'

  const cfg = configs[key]
  const Icon = cfg.icon

  return (
    <div className={`${pad} rounded-lg ${cfg.bg} flex items-center justify-center ${cfg.color} flex-shrink-0`}>
      <Icon size={s} />
    </div>
  )
}

function fileTypeName(mimeType: string): string {
  if (mimeType.includes('folder')) return 'Folder'
  if (mimeType === 'application/vnd.google-apps.document') return 'Google Doc'
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheet'
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Google Slides'
  if (mimeType === 'application/vnd.google-apps.form') return 'Google Form'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.startsWith('image/')) return 'Image'
  if (mimeType.startsWith('video/')) return 'Video'
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'Archive'
  const ext = mimeType.split('/').pop()?.toUpperCase()
  return ext || 'File'
}

function formatFileSize(bytes?: string): string {
  if (!bytes) return '—'
  const n = parseInt(bytes, 10)
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(1)} GB`
}

function smartDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isToday(d)) return `Today, ${format(d, 'h:mm a')}`
    if (isYesterday(d)) return 'Yesterday'
    if (isThisYear(d)) return format(d, 'MMM d')
    return format(d, 'MMM d, yyyy')
  } catch { return '' }
}

interface BreadcrumbItem { id: string | null; name: string }

// ── Quick access chips ──

const QUICK_FILTERS = [
  { label: 'Recent', query: '', icon: Clock },
  { label: 'Documents', query: "mimeType='application/vnd.google-apps.document'", icon: FileText },
  { label: 'Spreadsheets', query: "mimeType='application/vnd.google-apps.spreadsheet'", icon: FileSpreadsheet },
  { label: 'PDFs', query: "mimeType='application/pdf'", icon: FileText },
  { label: 'Images', query: "mimeType contains 'image/'", icon: Image },
]

// ── Main Component ──

export default function GoogleDrive() {
  const [connected, setConnected] = useState(isGmailConnected())
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: 'My Drive' }])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [errorType, setErrorType] = useState<'none' | 'not_connected' | 'api_not_enabled' | 'access_denied'>('none')
  const [fileCount, setFileCount] = useState(0)

  const loadFiles = useCallback(async (folderId?: string | null, query?: string, token?: string) => {
    setLoading(true)
    try {
      const result = await listDriveFiles({
        folderId: folderId || undefined,
        query: query || undefined,
        pageSize: 30,
        pageToken: token,
      })
      if (token) {
        setFiles(prev => { const next = [...prev, ...result.files]; setFileCount(next.length); return next })
      } else {
        setFiles(result.files)
        setFileCount(result.files.length)
      }
      setNextPageToken(result.nextPageToken)
      setErrorType('none')
    } catch (err: any) {
      const msg = err.message || ''
      if (msg === 'NOT_CONNECTED') { setConnected(false); setErrorType('not_connected') }
      else if (msg === 'API_NOT_ENABLED') { setErrorType('api_not_enabled') }
      else if (msg === 'ACCESS_DENIED') { setErrorType('access_denied') }
      else { showToast(msg || 'Failed to load files', 'error') }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (connected && !isSearching && !activeFilter) loadFiles(currentFolder)
  }, [connected, currentFolder]) // eslint-disable-line

  // Re-check connection on mount (catches OAuth callback redirect) and on focus
  useEffect(() => {
    const check = () => {
      const nowConnected = isGmailConnected()
      setConnected(prev => (prev !== nowConnected) ? nowConnected : prev)
    }
    check()
    const t = setTimeout(check, 500)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', check)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
    return () => {
      clearTimeout(t)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', check)
    }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) { clearSearch(); return }
    setIsSearching(true)
    setActiveFilter(null)
    setNextPageToken(undefined)
    loadFiles(null, searchQuery)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setIsSearching(false)
    setActiveFilter(null)
    loadFiles(currentFolder)
  }

  const handleFilter = (filter: typeof QUICK_FILTERS[0]) => {
    if (activeFilter === filter.label) {
      setActiveFilter(null)
      setIsSearching(false)
      loadFiles(currentFolder)
      return
    }
    setActiveFilter(filter.label)
    setIsSearching(true)
    setSearchQuery('')
    setNextPageToken(undefined)
    loadFiles(null, filter.query || undefined)
  }

  const navigateToFolder = (file: DriveFile) => {
    setCurrentFolder(file.id)
    setBreadcrumbs(prev => [...prev, { id: file.id, name: file.name }])
    setIsSearching(false)
    setSearchQuery('')
    setActiveFilter(null)
    setNextPageToken(undefined)
  }

  const navigateToBreadcrumb = (index: number) => {
    const item = breadcrumbs[index]
    setCurrentFolder(item.id)
    setBreadcrumbs(prev => prev.slice(0, index + 1))
    setIsSearching(false)
    setSearchQuery('')
    setActiveFilter(null)
    setNextPageToken(undefined)
  }

  const handleFileClick = (file: DriveFile) => {
    if (file.mimeType.includes('folder')) navigateToFolder(file)
    else if (file.webViewLink) window.open(file.webViewLink, '_blank')
  }

  const folders = files.filter(f => f.mimeType.includes('folder'))
  const regularFiles = files.filter(f => !f.mimeType.includes('folder'))

  // ── Error states ──
  if (errorType === 'api_not_enabled') {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <HardDrive size={28} className="text-amber-400" />
        </div>
        <h1 className="text-polar font-[800] mb-2" style={{ fontSize: '22px' }}>Enable Google Drive API</h1>
        <p className="text-dim mb-6" style={{ fontSize: '13px', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
          Your Google account is connected, but the Google Drive API needs to be enabled in your Google Cloud Console. One-time setup.
        </p>
        <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer"
          className="btn-primary inline-flex items-center gap-2" style={{ fontSize: '13px', padding: '10px 28px' }}>
          <ExternalLink size={14} /> Enable Drive API
        </a>
        <p className="text-dim mt-3" style={{ fontSize: '11px' }}>Click "Enable" in Google Cloud, then come back and retry.</p>
        <button onClick={() => { setErrorType('none'); loadFiles(currentFolder) }} className="btn-ghost mt-2" style={{ fontSize: '12px', padding: '8px 20px' }}>
          Retry
        </button>
      </div>
    )
  }
  if (errorType === 'access_denied') {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4"><HardDrive size={28} className="text-red-400" /></div>
        <h1 className="text-polar font-[800] mb-2" style={{ fontSize: '22px' }}>Drive Access Denied</h1>
        <p className="text-dim mb-6" style={{ fontSize: '13px', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
          Make sure to check the Google Drive checkbox when granting permissions.
        </p>
        <button onClick={() => connectGmail()} className="btn-primary" style={{ fontSize: '13px', padding: '10px 28px' }}>Reconnect with Google</button>
      </div>
    )
  }
  if (!connected) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4"><HardDrive size={28} className="text-emerald-400" /></div>
        <h1 className="text-polar font-[800] mb-2" style={{ fontSize: '22px' }}>Connect Google Drive</h1>
        <p className="text-dim mb-6" style={{ fontSize: '13px', maxWidth: 380, margin: '0 auto' }}>
          Browse your Google Drive files directly from your CRM. Read-only — we never modify your files.
        </p>
        <button onClick={() => connectGmail()} className="btn-primary" style={{ fontSize: '13px', padding: '10px 28px' }}>Connect with Google</button>
      </div>
    )
  }

  // ── Connected: Main UI ──
  return (
    <div className="max-w-6xl mx-auto space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-polar font-[800] flex items-center gap-2.5" style={{ fontSize: '22px', letterSpacing: '-0.02em' }}>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <HardDrive size={17} className="text-emerald-400" />
            </div>
            Google Drive
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-surface-2 rounded-lg p-0.5">
            <button
              onClick={() => setView('grid')}
              className={`p-1.5 rounded-md transition-all ${view === 'grid' ? 'bg-surface text-polar shadow-sm' : 'text-dim hover:text-steel'}`}
              title="Grid view"
            >
              <Grid3X3 size={14} />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded-md transition-all ${view === 'list' ? 'bg-surface text-polar shadow-sm' : 'text-dim hover:text-steel'}`}
              title="List view"
            >
              <List size={14} />
            </button>
          </div>
          <button onClick={() => loadFiles(currentFolder)} disabled={loading} className="btn-ghost flex items-center gap-1.5" style={{ fontSize: '11px', padding: '6px 12px' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="space-y-3 mb-5">
        <form onSubmit={handleSearch} className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search your Drive..."
            className="w-full bg-cell border border-border rounded-xl pl-10 pr-10 py-2.5 text-polar focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
            style={{ fontSize: '12.5px' }}
          />
          {(isSearching || searchQuery) && (
            <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-polar transition-colors">
              <X size={14} />
            </button>
          )}
        </form>

        {/* Quick filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {QUICK_FILTERS.map(f => {
            const Icon = f.icon
            const active = activeFilter === f.label
            return (
              <button
                key={f.label}
                onClick={() => handleFilter(f)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap transition-all border ${
                  active
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-surface-2/50 border-transparent text-dim hover:text-steel hover:bg-surface-2'
                }`}
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                <Icon size={12} /> {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Breadcrumbs */}
      {!isSearching && !activeFilter && breadcrumbs.length > 1 && (
        <div className="flex items-center gap-1.5 mb-4 px-1 flex-wrap">
          <button onClick={() => navigateToBreadcrumb(0)} className="text-dim hover:text-polar transition-colors">
            <Home size={13} />
          </button>
          {breadcrumbs.slice(1).map((bc, i) => (
            <span key={i + 1} className="flex items-center gap-1.5">
              <ChevronRight size={11} className="text-dim/50" />
              <button
                onClick={() => navigateToBreadcrumb(i + 1)}
                className={`transition-colors rounded-md px-1.5 py-0.5 ${i + 1 === breadcrumbs.length - 1 ? 'text-polar font-[600] bg-surface-2/50' : 'text-dim hover:text-steel'}`}
                style={{ fontSize: '12px' }}
              >
                {bc.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search/filter info bar */}
      {(isSearching || activeFilter) && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <span className="text-dim" style={{ fontSize: '11.5px' }}>
            {activeFilter ? `Showing: ${activeFilter}` : `Results for "${searchQuery}"`} · {fileCount} item{fileCount !== 1 ? 's' : ''}
          </span>
          <button onClick={clearSearch} className="text-accent hover:text-accent/80 transition-colors" style={{ fontSize: '11px', fontWeight: 600 }}>
            Clear
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && files.length === 0 ? (
        <div className="text-center py-20">
          <RefreshCw size={20} className="animate-spin mx-auto mb-3 text-accent" />
          <p className="text-dim" style={{ fontSize: '12.5px' }}>Loading your files...</p>
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
            <FolderOpen size={24} className="text-dim" />
          </div>
          <p className="text-steel font-[600] mb-1" style={{ fontSize: '14px' }}>
            {isSearching ? 'No results found' : 'This folder is empty'}
          </p>
          <p className="text-dim" style={{ fontSize: '12px' }}>
            {isSearching ? 'Try a different search term' : 'Navigate to a folder with files'}
          </p>
        </div>
      ) : view === 'grid' ? (
        // ── Grid View ──
        <div className="space-y-6">
          {folders.length > 0 && (
            <section>
              <p className="text-dim mb-2.5 px-1 flex items-center gap-2" style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <Folder size={11} /> Folders · {folders.length}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
                {folders.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleFileClick(f)}
                    className="group flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-surface/30 hover:bg-amber-500/[0.04] hover:border-amber-500/20 transition-all text-left"
                  >
                    <Folder size={20} className="text-amber-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-polar font-[600] truncate group-hover:text-amber-300 transition-colors" style={{ fontSize: '12px' }}>{f.name}</p>
                      <p className="text-dim" style={{ fontSize: '10px' }}>{smartDate(f.modifiedTime)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {regularFiles.length > 0 && (
            <section>
              <p className="text-dim mb-2.5 px-1 flex items-center gap-2" style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <File size={11} /> Files · {regularFiles.length}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
                {regularFiles.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleFileClick(f)}
                    className="group card p-0 overflow-hidden hover:ring-1 hover:ring-accent/30 transition-all text-left"
                  >
                    {/* Thumbnail or icon area */}
                    <div className="h-28 bg-surface-2/60 flex items-center justify-center overflow-hidden">
                      {f.thumbnailLink ? (
                        <img src={f.thumbnailLink} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <FileIcon mimeType={f.mimeType} size="lg" />
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <p className="text-polar font-[600] truncate group-hover:text-accent transition-colors" style={{ fontSize: '11.5px' }}>{f.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-dim" style={{ fontSize: '10px' }}>{fileTypeName(f.mimeType)}</span>
                        {f.size && <span className="text-dim" style={{ fontSize: '10px' }}>· {formatFileSize(f.size)}</span>}
                      </div>
                      <p className="text-dim mt-0.5" style={{ fontSize: '10px' }}>{smartDate(f.modifiedTime)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        // ── List View ──
        <div className="card overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface-2/30" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-dim)' }}>
            <span className="w-9" />
            <span className="flex-1">Name</span>
            <span className="hidden sm:block w-24">Type</span>
            <span className="hidden md:block w-16 text-right">Size</span>
            <span className="w-24 text-right">Modified</span>
            <span className="w-5" />
          </div>
          <div className="divide-y divide-border/50">
            {files.map(f => {
              const isFolder = f.mimeType.includes('folder')
              return (
                <div
                  key={f.id}
                  onClick={() => handleFileClick(f)}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all group ${isFolder ? 'hover:bg-amber-500/[0.03]' : 'hover:bg-surface-2/40'}`}
                >
                  <FileIcon mimeType={f.mimeType} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className={`truncate transition-colors ${isFolder ? 'text-polar font-[600] group-hover:text-amber-300' : 'text-steel group-hover:text-polar'}`} style={{ fontSize: '12.5px' }}>
                      {f.name}
                    </p>
                  </div>
                  <span className="text-dim hidden sm:block flex-shrink-0 w-24" style={{ fontSize: '11px' }}>
                    {fileTypeName(f.mimeType)}
                  </span>
                  <span className="text-dim hidden md:block flex-shrink-0 w-16 text-right font-mono" style={{ fontSize: '10.5px' }}>
                    {isFolder ? '—' : formatFileSize(f.size)}
                  </span>
                  <span className="text-dim flex-shrink-0 w-24 text-right" style={{ fontSize: '10.5px' }}>
                    {smartDate(f.modifiedTime)}
                  </span>
                  <div className="w-5 flex-shrink-0">
                    {!isFolder && f.webViewLink && (
                      <ExternalLink size={12} className="text-dim/0 group-hover:text-accent transition-all" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Load more */}
      {nextPageToken && (
        <div className="text-center pt-4">
          <button
            onClick={() => loadFiles(isSearching ? null : currentFolder, isSearching ? searchQuery : undefined, nextPageToken)}
            disabled={loading}
            className="btn-ghost inline-flex items-center gap-2"
            style={{ fontSize: '11px', padding: '8px 20px' }}
          >
            {loading ? <><RefreshCw size={12} className="animate-spin" /> Loading...</> : 'Load more files'}
          </button>
        </div>
      )}
    </div>
  )
}
