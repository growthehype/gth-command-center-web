import { useRef, useCallback } from 'react'

/**
 * Wraps an async function so that concurrent calls are ignored.
 * The returned function skips execution if a previous call is still in-flight.
 */
export function useAsyncLock<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  const lockRef = useRef(false)

  return useCallback(async (...args: any[]) => {
    if (lockRef.current) return
    lockRef.current = true
    try {
      return await fn(...args)
    } finally {
      lockRef.current = false
    }
  }, [fn]) as unknown as T
}
