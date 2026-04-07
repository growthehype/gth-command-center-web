import { useState } from 'react'
import { X, Download, ExternalLink, FileText } from 'lucide-react'

interface FilePreviewProps {
  open: boolean
  onClose: () => void
  url: string
  fileName: string
}

function getFileType(name: string): 'pdf' | 'image' | 'other' {
  const ext = (name || '').split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image'
  return 'other'
}

export default function FilePreview({ open, onClose, url, fileName }: FilePreviewProps) {
  const [iframeError, setIframeError] = useState(false)
  if (!open || !url) return null

  const fileType = getFileType(fileName)

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleOpenExternal = () => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <FileText size={16} className="text-white/60 flex-shrink-0" />
          <span className="text-white font-semibold truncate" style={{ fontSize: '14px' }}>
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            style={{ fontSize: '12px', fontWeight: 600 }}
            title="Download file"
            aria-label="Download file"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            onClick={handleOpenExternal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            style={{ fontSize: '12px', fontWeight: 600 }}
            title="Open in new tab"
            aria-label="Open in new tab"
          >
            <ExternalLink size={14} />
            <span className="hidden sm:inline">New Tab</span>
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Close preview"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
        {fileType === 'image' ? (
          <img
            src={url}
            alt={fileName}
            className="max-w-full max-h-full object-contain"
            style={{ borderRadius: '4px' }}
          />
        ) : fileType === 'pdf' && !iframeError ? (
          <iframe
            src={url}
            title={fileName}
            className="w-full h-full bg-white rounded"
            style={{ border: 'none', maxWidth: '900px' }}
            onError={() => setIframeError(true)}
          />
        ) : (
          /* Fallback for non-previewable files or failed iframe */
          <div className="flex flex-col items-center gap-4 text-center">
            <FileText size={48} className="text-white/30" />
            <p className="text-white font-semibold" style={{ fontSize: '16px' }}>{fileName}</p>
            <p className="text-white/50" style={{ fontSize: '13px' }}>
              {fileType === 'pdf' ? 'PDF preview not supported on this device.' : 'This file type cannot be previewed in the browser.'}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button onClick={handleDownload} className="btn-primary flex items-center gap-2">
                <Download size={14} /> Download
              </button>
              <button onClick={handleOpenExternal} className="btn-ghost flex items-center gap-2" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
                <ExternalLink size={14} /> Open in Browser
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Click backdrop to close */}
      <div
        className="absolute inset-0 -z-10"
        onClick={onClose}
      />
    </div>
  )
}
