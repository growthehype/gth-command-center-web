import { useEffect, useRef, useCallback } from 'react'

interface ConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  message: string
  confirmLabel?: string
  confirmDanger?: boolean
  loading?: boolean
}

export default function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Delete',
  confirmDanger = true,
  loading = false,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
    },
    [onConfirm, onCancel],
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKeyDown)
    // Focus the confirm button so Enter works immediately
    requestAnimationFrame(() => confirmBtnRef.current?.focus())
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-center z-[110] modal-backdrop"
      onClick={(e) => { if (e.target === overlayRef.current) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="modal-container bg-surface w-[95vw]"
        style={{ maxWidth: '400px' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-[800]" style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>{title}</h3>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-steel" style={{ fontSize: '13px', lineHeight: '1.6' }}>{message}</p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={onCancel}
            className="btn-ghost"
            style={{ fontSize: '12px', padding: '6px 16px' }}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            disabled={loading}
            className={
              confirmDanger
                ? 'btn-ghost text-err border-err/30 hover:border-err'
                : 'btn-ghost text-polar border-border hover:border-steel'
            }
            style={{ fontSize: '12px', padding: '6px 16px' }}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
