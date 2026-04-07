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
  return (
    <div className={`flex items-center gap-2 overflow-x-auto no-scrollbar ${className}`} style={{ flexWrap: 'nowrap' }}>
      {options.map(opt => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
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
