import { useEffect, useState, useCallback } from 'react'
import { HardDrive, Search, RefreshCw, Folder, FileText, Image, Film, FileSpreadsheet, Presentation, File, ArrowLeft, ExternalLink, ChevronRight } from 'lucide-react'
import { isGmailConnected, connectGmail, listDriveFiles, type DriveFile } from '@/lib/gmail'
import { showToast } from '@/components/ui/Toast'
import { format } from 'date-fns'

// ── File type icons ──

function fileIcon(mimeType: string) {
  if (mimeType === 'application/vnd.google-apps.folder') return <Folder size={18} className="text-amber-400" />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet size={18} className="text-emerald-400" />
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return <Presentation size={18} className="text-orange-400" />
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType === 'application/vnd.google-apps.document') return <FileText size={18} className="text-blue-400" />
  if (mimeType.startsWith('image/')) return <Image size={18} className="text-purple-400" />
  if (mimeType.startsWith('video/')) return <Film size={18} className="text-pink-400" />
  if (mimeType === 'application/pdf') return <FileText size={18} className="text-red-400" />
  return <File size={18} className="text-dim" />
}

function fileTypeName(mimeType: string): string {
  if (mimeType === 'application/vnd.google-apps.folder') return 'Folder'
  if (mimeType === 'application/vnd.google-apps.document') return 'Google Doc'
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheet'
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Google Slides'
  if (mimeType === 'application/vnd.google-apps.form') return 'Google Form'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.startsWith('image/')) return 'Image'
  if (mimeType.startsWith('video/')) return 'Video'
  const ext = mimeType.split('/').pop()?.toUpperCase()
  return ext || 'File'
}

function formatFileSize(bytes?: string): string {
  if (!bytes) return ''
  const n = parseInt(bytes, 10)
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(1)} GB`
}

// ── Breadcrumb ──

interface BreadcrumbItem {
  id: string | null
  name: string
}

// ── Main Component ──

export default function GoogleDrive() {
  const [connected, setConnected] = useState(isGmailConnected())
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: 'My Drive' }])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [view, setView] = useState<'grid' | 'list'>('list')

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
        setFiles(prev => [...prev, ...result.files])
      } else {
        setFiles(result.files)
      }
      setNextPageToken(result.nextPageToken)
    } catch (err: any) {
      if (err.message?.includes('expired') || err.message?.includes('not connected')) {
        setConnected(false)
      }
      showToast(err.message || 'Failed to load files', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (connected && !isSearching) {
      loadFiles(currentFolder)
    }
  }, [connected, currentFolder]) // eslint-disable-line

  useEffect(() => {
    setConnected(isGmailConnected())
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setIsSearching(false)
      loadFiles(currentFolder)
      return
    }
    setIsSearching(true)
    setNextPageToken(undefined)
    loadFiles(null, searchQuery)
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setIsSearching(false)
    loadFiles(currentFolder)
  }

  const navigateToFolder = (file: DriveFile) => {
    setCurrentFolder(file.id)
    setBreadcrumbs(prev => [...prev, { id: file.id, name: file.name }])
    setIsSearching(false)
    setSearchQuery('')
    setNextPageToken(undefined)
  }

  const navigateToBreadcrumb = (index: number) => {
    const item = breadcrumbs[index]
    setCurrentFolder(item.id)
    setBreadcrumbs(prev => prev.slice(0, index + 1))
    setIsSearching(false)
    setSearchQuery('')
    setNextPageToken(undefined)
  }

  const handleFileClick = (file: DriveFile) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      navigateToFolder(file)
    } else if (file.webViewLink) {
      window.open(file.webViewLink, '_blank')
    }
  }

  // Separate folders and files
  const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
  const regularFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')

  // ── Not connected ──
  if (!connected) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
          <HardDrive size={28} className="text-emerald-400" />
        </div>
        <h1 className="text-polar font-[800] mb-2" style={{ fontSize: '22px' }}>Connect Google Drive</h1>
        <p className="text-dim mb-6" style={{ fontSize: '13px', maxWidth: 360, margin: '0 auto' }}>
          Browse and access your Google Drive files directly from your CRM. Read-only access — we never modify your files.
        </p>
        <button onClick={() => connectGmail()} className="btn-primary" style={{ fontSize: '13px', padding: '10px 28px' }}>
          Connect with Google
        </button>
        <p className="text-dim mt-4" style={{ fontSize: '10.5px' }}>
          Uses the same Google connection as Gmail. Drive access is read-only.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-polar font-[800] flex items-center gap-2" style={{ fontSize: '22px', letterSpacing: '-0.02em' }}>
          <HardDrive size={22} /> Google Drive
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
            className="btn-ghost"
            style={{ fontSize: '11px', padding: '6px 12px' }}
          >
            {view === 'grid' ? 'List' : 'Grid'} View
          </button>
          <button onClick={() => loadFiles(currentFolder)} disabled={loading} className="btn-ghost flex items-center gap-1.5" style={{ fontSize: '11px', padding: '6px 12px' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      {!isSearching && (
        <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: '12px' }}>
          {breadcrumbs.map((bc, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-dim" />}
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={`hover:text-polar transition-colors ${i === breadcrumbs.length - 1 ? 'text-polar font-[600]' : 'text-dim'}`}
              >
                {bc.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search files..."
          className="w-full bg-cell border border-border rounded-lg pl-9 pr-20 py-2 text-polar"
          style={{ fontSize: '12px' }}
        />
        {isSearching && (
          <button type="button" onClick={handleClearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-polar text-xs">
            Clear
          </button>
        )}
      </form>

      {isSearching && (
        <p className="text-dim" style={{ fontSize: '11.5px' }}>
          Search results for "{searchQuery}" · {files.length} files found
        </p>
      )}

      {/* Loading */}
      {loading && files.length === 0 ? (
        <div className="text-dim text-center py-16" style={{ fontSize: '12.5px' }}>
          <RefreshCw size={16} className="animate-spin mx-auto mb-2" /> Loading files...
        </div>
      ) : files.length === 0 ? (
        <div className="text-dim text-center py-16" style={{ fontSize: '12.5px' }}>
          {isSearching ? 'No files matching your search' : 'This folder is empty'}
        </div>
      ) : view === 'grid' ? (
        /* Grid view */
        <>
          {folders.length > 0 && (
            <div>
              <p className="text-dim mb-2" style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Folders</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
                {folders.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleFileClick(f)}
                    className="card p-3 text-left hover:bg-surface-2/50 transition-colors group"
                  >
                    <Folder size={24} className="text-amber-400 mb-2" />
                    <p className="text-polar font-[600] truncate group-hover:text-accent" style={{ fontSize: '11.5px' }}>{f.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {regularFiles.length > 0 && (
            <div>
              <p className="text-dim mb-2" style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Files</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
                {regularFiles.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleFileClick(f)}
                    className="card p-3 text-left hover:bg-surface-2/50 transition-colors group"
                  >
                    {f.thumbnailLink ? (
                      <img src={f.thumbnailLink} alt="" className="w-full h-20 object-cover rounded mb-2 bg-surface-2" />
                    ) : (
                      <div className="mb-2">{fileIcon(f.mimeType)}</div>
                    )}
                    <p className="text-polar font-[600] truncate group-hover:text-accent" style={{ fontSize: '11.5px' }}>{f.name}</p>
                    <p className="text-dim" style={{ fontSize: '10px' }}>{fileTypeName(f.mimeType)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* List view */
        <div className="card overflow-hidden divide-y divide-border">
          {files.map(f => {
            const isFolder = f.mimeType === 'application/vnd.google-apps.folder'
            return (
              <div
                key={f.id}
                onClick={() => handleFileClick(f)}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-surface-2/50 group"
              >
                <div className="flex-shrink-0">{fileIcon(f.mimeType)}</div>
                <div className="flex-1 min-w-0">
                  <p className={`truncate ${isFolder ? 'text-polar font-[600]' : 'text-steel'}`} style={{ fontSize: '12.5px' }}>
                    {f.name}
                  </p>
                </div>
                <span className="text-dim hidden sm:block flex-shrink-0" style={{ fontSize: '10.5px', width: 90 }}>
                  {fileTypeName(f.mimeType)}
                </span>
                <span className="text-dim hidden md:block flex-shrink-0" style={{ fontSize: '10.5px', width: 60, textAlign: 'right' }}>
                  {formatFileSize(f.size)}
                </span>
                <span className="text-dim flex-shrink-0" style={{ fontSize: '10.5px', width: 80, textAlign: 'right' }}>
                  {f.modifiedTime ? format(new Date(f.modifiedTime), 'MMM d, yyyy') : ''}
                </span>
                {!isFolder && f.webViewLink && (
                  <ExternalLink size={12} className="text-dim group-hover:text-accent flex-shrink-0 ml-1" />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Load more */}
      {nextPageToken && (
        <div className="text-center pt-2">
          <button
            onClick={() => loadFiles(isSearching ? null : currentFolder, isSearching ? searchQuery : undefined, nextPageToken)}
            disabled={loading}
            className="btn-ghost"
            style={{ fontSize: '11px', padding: '6px 16px' }}
          >
            {loading ? 'Loading...' : 'Load more files'}
          </button>
        </div>
      )}
    </div>
  )
}
