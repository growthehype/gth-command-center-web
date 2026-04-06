import { Mic, MicOff } from 'lucide-react'

interface MicButtonProps {
  isListening: boolean
  onClick: () => void
  size?: number
  className?: string
}

export default function MicButton({ isListening, onClick, size = 12, className = '' }: MicButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`transition-colors ${isListening ? 'text-err animate-pulse' : 'text-dim hover:text-polar'} ${className}`}
      title={isListening ? 'Stop listening' : 'Voice input'}
    >
      {isListening ? <MicOff size={size} /> : <Mic size={size} />}
    </button>
  )
}
