import { useVoiceInput } from '@/hooks/useVoiceInput'
import MicButton from './MicButton'

interface VoiceTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  style?: React.CSSProperties
  onBlur?: () => void
}

export default function VoiceTextarea({ value, onChange, placeholder, rows = 4, className = '', style, onBlur }: VoiceTextareaProps) {
  const { isListening, toggle } = useVoiceInput({
    onResult: (text) => {
      onChange(value ? `${value} ${text}` : text)
    },
  })

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        className={className}
        style={style}
      />
      <div className="absolute top-2 right-2">
        <MicButton isListening={isListening} onClick={toggle} size={14} />
      </div>
      {isListening && (
        <div className="absolute bottom-2 left-3 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-err animate-pulse" />
          <span className="text-err" style={{ fontSize: '10px', fontWeight: 600 }}>Listening...</span>
        </div>
      )}
    </div>
  )
}
