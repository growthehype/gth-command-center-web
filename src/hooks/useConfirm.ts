import { useState, useCallback, useRef, createElement } from 'react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface ConfirmOptions {
  confirmLabel?: string
  confirmDanger?: boolean
}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    confirmDanger: boolean
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Delete',
    confirmDanger: true,
  })

  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback(
    (title: string, message: string, options?: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        resolveRef.current = resolve
        setState({
          open: true,
          title,
          message,
          confirmLabel: options?.confirmLabel ?? 'Delete',
          confirmDanger: options?.confirmDanger ?? true,
        })
      })
    },
    [],
  )

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, open: false }))
    resolveRef.current?.(true)
    resolveRef.current = null
  }, [])

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, open: false }))
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  const ConfirmDialogElement = createElement(ConfirmDialog, {
    open: state.open,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
    title: state.title,
    message: state.message,
    confirmLabel: state.confirmLabel,
    confirmDanger: state.confirmDanger,
  })

  return { confirm, ConfirmDialog: ConfirmDialogElement } as const
}
