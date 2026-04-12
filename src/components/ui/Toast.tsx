import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warn'
  undoAction?: () => void
}

const toastListeners = new Set<(toast: ToastItem) => void>()

export function showToast(message: string, type: ToastItem['type'] = 'info', undoAction?: () => void) {
  const toast: ToastItem = { id: Date.now().toString(), message, type, undoAction }
  toastListeners.forEach(fn => fn(toast))
}

const borderColors = {
  success: 'border-l-ok',
  error: 'border-l-err',
  info: 'border-l-polar',
  warn: 'border-l-warn',
}

const textColors = {
  success: 'text-ok',
  error: 'text-err',
  info: 'text-polar',
  warn: 'text-warn',
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handler = (toast: ToastItem) => {
      setToasts(prev => [...prev, toast])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id))
      }, toast.undoAction ? 5000 : 3000)
    }
    toastListeners.add(handler)
    return () => {
      toastListeners.delete(handler)
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`bg-surface border border-border border-l-[3px] ${borderColors[toast.type]} px-5 py-3 flex items-center gap-4 shadow-lg`}
          style={{ minWidth: '280px' }}
        >
          <span className={`${textColors[toast.type]} font-semibold`} style={{ fontSize: '11px' }}>
            {toast.message}
          </span>
          {toast.undoAction && (
            <button
              onClick={() => { toast.undoAction?.(); dismiss(toast.id) }}
              className="text-polar bg-border-hard px-3 py-1 font-sans uppercase font-bold rounded-sm hover:bg-dim transition-colors"
              style={{ fontSize: '8px', letterSpacing: '0.14em' }}
            >
              Undo
            </button>
          )}
          <button onClick={() => dismiss(toast.id)} className="text-dim hover:text-steel ml-auto">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
