import { useState, useEffect, useRef } from 'react'

type ConnectionStatus = 'online' | 'offline' | 'reconnected'

export function useOnlineStatus() {
  const [status, setStatus] = useState<ConnectionStatus>(
    navigator.onLine ? 'online' : 'offline'
  )
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const goOffline = () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      setStatus('offline')
    }

    const goOnline = () => {
      setStatus('reconnected')
      reconnectTimer.current = setTimeout(() => {
        setStatus('online')
        reconnectTimer.current = null
      }, 3000)
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [])

  return status
}
