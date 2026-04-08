import { useState, useEffect } from 'react'
import { X, Lightbulb } from 'lucide-react'

interface Props {
  id: string
  title: string
  tips: string[]
  shortcut?: string
}

/**
 * First-visit help hint for a page.
 * Shows once per page, dismissible, stored in localStorage.
 */
export default function PageHint({ id, title, tips, shortcut }: Props) {
  const storageKey = `gth_hint_dismissed_${id}`
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey)
    if (!dismissed) setVisible(true)
  }, [storageKey])

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem(storageKey, 'true')
  }

  if (!visible) return null

  return (
    <div className="border border-border bg-surface/80 px-4 py-3 flex items-start gap-3 mb-4 animate-in fade-in">
      <Lightbulb size={14} className="text-warn mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-polar font-[700]" style={{ fontSize: '12px' }}>{title}</span>
          {shortcut && (
            <span className="mono text-dim" style={{ fontSize: '10px' }}>({shortcut})</span>
          )}
        </div>
        <ul className="mt-1 space-y-0.5">
          {tips.map((tip, i) => (
            <li key={i} className="text-dim" style={{ fontSize: '11px', lineHeight: '1.5' }}>
              {tip}
            </li>
          ))}
        </ul>
      </div>
      <button onClick={dismiss} className="text-dim hover:text-polar transition-colors cursor-pointer p-1 shrink-0" title="Dismiss">
        <X size={12} />
      </button>
    </div>
  )
}

/** Inline tooltip badge — attach to any label/heading */
export function HelpTip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex ml-1">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="text-dim hover:text-steel transition-colors cursor-help"
        style={{ fontSize: '10px' }}
        title={text}
      >
        ?
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2.5 py-1.5 bg-obsidian border border-border text-dim z-50 whitespace-nowrap"
          style={{ fontSize: '10px', maxWidth: '220px', whiteSpace: 'normal' }}>
          {text}
        </div>
      )}
    </span>
  )
}
