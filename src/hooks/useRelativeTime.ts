import { useState, useEffect, useSyncExternalStore, useCallback } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'

// ── Shared tick for all useRelativeTime consumers ──
// Instead of N intervals for N components, one global interval fires every 60s
// and all subscribers re-render together.
let tick = 0
const listeners = new Set<() => void>()
let globalInterval: ReturnType<typeof setInterval> | null = null

function subscribe(cb: () => void) {
  listeners.add(cb)
  if (!globalInterval) {
    globalInterval = setInterval(() => {
      tick++
      listeners.forEach(fn => fn())
    }, 60_000)
  }
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && globalInterval) {
      clearInterval(globalInterval)
      globalInterval = null
    }
  }
}

function getSnapshot() { return tick }

/**
 * Returns a live-updating relative time string ("2 minutes ago", etc.)
 * Uses a single shared 60-second interval for all consumers.
 */
export function useRelativeTime(date: string | Date | null | undefined): string {
  useSyncExternalStore(subscribe, getSnapshot)

  const compute = useCallback((): string => {
    if (!date) return ''
    try {
      const d = typeof date === 'string' ? parseISO(date) : date
      return formatDistanceToNow(d, { addSuffix: true })
    } catch {
      return typeof date === 'string' ? date : ''
    }
  }, [date])

  return compute()
}
