import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
}

export default function Modal({ open, onClose, title, children, width = '480px' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-center z-[100]" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-surface border border-border overflow-hidden w-[95vw]" style={{ maxWidth: width, maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-[800]" style={{ fontSize: '14px' }}>{title}</h3>
          <button onClick={onClose} className="text-dim hover:text-steel transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 60px)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
