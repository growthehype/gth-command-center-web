import { useEffect, useRef, useCallback } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const hasAutoFocused = useRef(false)

  // Keep onClose ref up to date without triggering effect re-runs
  onCloseRef.current = onClose

  // Focus trap: keep Tab key within the modal
  useEffect(() => {
    if (!open) {
      hasAutoFocused.current = false
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return }

      if (e.key === 'Tab' && containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    // Auto-focus first input ONLY once when the modal first opens
    if (!hasAutoFocused.current) {
      hasAutoFocused.current = true
      requestAnimationFrame(() => {
        const el = containerRef.current?.querySelector<HTMLElement>(
          'input, select, textarea, button:not(.modal-close-btn)'
        )
        el?.focus()
      })
    }

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-center z-[100] modal-backdrop"
      onClick={(e) => { if (e.target === overlayRef.current) onCloseRef.current() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={containerRef}
        className="modal-container bg-surface overflow-hidden w-[95vw]"
        style={{ maxWidth: width, maxHeight: '85vh' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-[800]" style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>{title}</h3>
          <button onClick={() => onCloseRef.current()} className="modal-close-btn cursor-pointer" aria-label="Close modal">
            <X size={15} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 60px)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
