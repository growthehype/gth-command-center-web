import { useRef, useCallback } from 'react'

interface FilterChipOption {
  value: string
  label: string
  count?: number
}

interface FilterChipsProps {
  options: FilterChipOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export default function FilterChips({ options, value, onChange, className = '' }: FilterChipsProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    let nextIdx = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIdx = (idx + 1) % options.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIdx = (idx - 1 + options.length) % options.length
    }
    if (nextIdx >= 0) {
      const btns = containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      btns?.[nextIdx]?.focus()
      onChange(options[nextIdx].value)
    }
  }, [options, onChange])

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-2 overflow-x-auto no-scrollbar ${className}`}
      style={{ flexWrap: 'nowrap' }}
      role="tablist"
      aria-label="Filters"
    >
      {options.map((opt, idx) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`flex-shrink-0 px-3 py-1.5 font-sans cursor-pointer transition-all duration-150 border whitespace-nowrap ${
              isActive
                ? 'bg-polar text-obsidian border-polar'
                : 'bg-transparent text-steel border-border-hard hover:border-dim hover:text-polar'
            }`}
            style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={`ml-1.5 ${isActive ? 'text-obsidian/60' : 'text-dim'}`}
                style={{ fontSize: '10px' }}
              >
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
