import { useState, useRef, useCallback } from 'react'

interface UseVoiceInputOptions {
  onResult: (text: string) => void
  append?: boolean
  lang?: string
}

export function useVoiceInput({ onResult, append = true, lang = 'en-US' }: UseVoiceInputOptions) {
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  const toggle = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = lang

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      if (transcript.trim()) {
        onResult(transcript.trim())
      }
      setIsListening(false)
    }

    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening, onResult, lang])

  return { isListening, toggle }
}
