import { useEffect, useRef } from 'react'
import { X, Keyboard } from 'lucide-react'

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

interface Shortcut {
  keys: string[]
  description: string
}

interface Section {
  title: string
  shortcuts: Shortcut[]
}

const sections: Section[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['G', 'B'], description: 'Go to Daily Briefing' },
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'C'], description: 'Go to Clients' },
      { keys: ['G', 'L'], description: 'Go to Contacts' },
      { keys: ['G', 'P'], description: 'Go to Projects' },
      { keys: ['G', 'T'], description: 'Go to Tasks' },
      { keys: ['G', 'I'], description: 'Go to Invoices' },
      { keys: ['G', 'F'], description: 'Go to Financials' },
      { keys: ['G', 'O'], description: 'Go to Outreach' },
      { keys: ['G', 'M'], description: 'Go to Meetings' },
      { keys: ['Ctrl', ','], description: 'Open Settings' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Open Command Palette' },
      { keys: ['/'], description: 'Focus Search' },
      { keys: ['Ctrl', 'J'], description: 'Toggle AI Assist' },
      { keys: ['Ctrl', 'N'], description: 'Quick Add' },
      { keys: ['Ctrl', 'L'], description: 'Lock Screen' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['Esc'], description: 'Close Panel / Modal' },
      { keys: ['?'], description: 'Show Keyboard Shortcuts' },
    ],
  },
]

function KeyBadge({ label }: { label: string }) {
  return (
    <kbd
      className="inline-flex items-center justify-center font-mono font-bold select-none"
      style={{
        fontSize: '11px',
        minWidth: '28px',
        height: '26px',
        padding: '0 7px',
        borderRadius: '5px',
        backgroundColor: 'var(--color-surface-2)',
        border: '1px solid var(--color-border-hard)',
        boxShadow: '0 2px 0 var(--color-border-hard), 0 3px 4px rgba(0,0,0,0.15)',
        color: 'var(--color-polar)',
        lineHeight: '26px',
      }}
    >
      {label}
    </kbd>
  )
}

export default function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
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
      className="fixed inset-0 flex items-center justify-center z-[200]"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className="bg-surface border border-border overflow-hidden w-[95vw]"
        style={{ maxWidth: '520px', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Keyboard size={15} className="text-dim" />
            <h3 className="font-[800]" style={{ fontSize: '14px' }}>Keyboard Shortcuts</h3>
          </div>
          <button onClick={onClose} className="text-dim hover:text-steel transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: 'calc(85vh - 60px)' }}>
          {sections.map((section, sIdx) => (
            <div key={section.title} className={sIdx > 0 ? 'mt-6' : ''}>
              <h4
                className="text-dim font-sans uppercase mb-3"
                style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em' }}
              >
                {section.title}
              </h4>
              <div className="flex flex-col gap-0">
                {section.shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
                  >
                    <span className="text-steel" style={{ fontSize: '13px' }}>
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
                      {shortcut.keys.map((key, kIdx) => (
                        <span key={kIdx} className="flex items-center gap-1.5">
                          {kIdx > 0 && shortcut.keys.length > 1 && shortcut.keys[0] !== 'Ctrl' && shortcut.keys[0] !== 'Shift' && (
                            <span className="text-dim" style={{ fontSize: '10px' }}>then</span>
                          )}
                          {kIdx > 0 && (shortcut.keys[0] === 'Ctrl' || shortcut.keys[0] === 'Shift') && (
                            <span className="text-dim" style={{ fontSize: '11px' }}>+</span>
                          )}
                          <KeyBadge label={key} />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Footer hint */}
          <div className="mt-6 pt-4 border-t border-border text-center">
            <span className="text-dim" style={{ fontSize: '11px' }}>
              Press <KeyBadge label="?" /> anywhere to toggle this panel
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
