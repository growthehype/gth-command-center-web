import { useVoiceInput } from '@/hooks/useVoiceInput'
import MicButton from './MicButton'

interface VoiceInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  type?: string
}

export default function VoiceInput({ value, onChange, placeholder, className = '', style, type = 'text' }: VoiceInputProps) {
  const { isListening, toggle } = useVoiceInput({
    onResult: (text) => {
      onChange(value ? `${value} ${text}` : text)
    },
  })

  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        style={{ ...style, paddingRight: '32px' }}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <MicButton isListening={isListening} onClick={toggle} size={12} />
      </div>
    </div>
  )
}
