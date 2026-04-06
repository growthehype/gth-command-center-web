import { useState, useEffect, useRef, useCallback } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: React.ComponentType<any>
  action: () => void
  danger?: boolean
  divider?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  children: React.ReactNode
}

export default function ContextMenu({ items, children }: ContextMenuProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Calculate position, keeping menu within viewport
    const x = Math.min(e.clientX, window.innerWidth - 200)
    const y = Math.min(e.clientY, window.innerHeight - items.length * 36 - 16)
    setPosition({ x, y })
    setVisible(true)
  }, [items.length])

  useEffect(() => {
    if (!visible) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false)
      }
    }
    const closeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', closeKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', closeKey)
    }
  }, [visible])

  return (
    <>
      <div onContextMenu={handleContextMenu}>
        {children}
      </div>
      {visible && (
        <div
          ref={menuRef}
          className="fixed bg-surface border border-border-hard shadow-lg z-[300]"
          style={{ left: position.x, top: position.y, minWidth: 180 }}
        >
          {items.map((item, idx) => {
            if (item.divider) {
              return <div key={idx} className="border-t border-border my-1" />
            }
            const Icon = item.icon
            return (
              <button
                key={idx}
                onClick={() => { item.action(); setVisible(false) }}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2 ${
                  item.danger ? 'text-err hover:text-err' : 'text-steel hover:text-polar'
                }`}
                style={{ fontSize: '13px' }}
              >
                {Icon && <Icon size={13} className={item.danger ? 'text-err' : 'text-dim'} />}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
