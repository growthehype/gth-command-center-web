import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export type StatusTone = 'ok' | 'warn' | 'err' | 'info' | 'neutral'

export interface StatusOption {
  value: string
  label: string
  tone: StatusTone
  hint?: string
}

interface StatusMenuProps {
  value: string | null | undefined
  options: StatusOption[]
  onChange: (value: string) => void | Promise<void>
  disabled?: boolean
  /** Accessible name, e.g. "Client status" */
  label?: string
}

/**
 * A status pill that opens a dropdown of statuses.
 * Shared across Clients, Invoices, Leads, Projects and Tasks.
 * Renders its menu in a portal so table overflow never clips it.
 */
export default function StatusMenu({ value, options, onChange, disabled, label = 'Status' }: StatusMenuProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const current = options.find((o) => o.value === value) ?? {
    value: value ?? '',
    label: value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Set status',
    tone: 'neutral' as StatusTone,
  }

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const menuH = options.length * 36 + 12
    const up = r.bottom + menuH + 8 > window.innerHeight && r.top > menuH + 8
    setPos({ top: up ? r.top - menuH - 6 : r.bottom + 6, left: Math.min(r.left, window.innerWidth - 220), up })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScroll = () => setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const choose = async (v: string) => {
    setOpen(false)
    if (v !== value) await onChange(v)
    btnRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active].value) }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`status-pill status-pill--${current.tone} ${open ? 'status-pill--open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}. Change`}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        onKeyDown={onKeyDown}
      >
        <span className="status-dot" aria-hidden="true" />
        {current.label}
        <ChevronDown size={12} className="status-chev" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={`status-menu ${pos.up ? 'status-menu--up' : ''}`}
            role="listbox"
            aria-label={label}
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`status-option status-option--${o.tone} ${i === active ? 'status-option--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                <span className="status-dot" aria-hidden="true" />
                <span className="status-option-label">
                  {o.label}
                  {o.hint && <span className="status-option-hint">{o.hint}</span>}
                </span>
                {o.value === value && <Check size={13} className="status-check" aria-hidden="true" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
