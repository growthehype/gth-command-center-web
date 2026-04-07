import { useState, useEffect } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'

/**
 * Returns a live-updating relative time string ("2 minutes ago", etc.)
 * Refreshes every 60 seconds and cleans up on unmount.
 */
export function useRelativeTime(date: string | Date | null | undefined): string {
  const compute = (): string => {
    if (!date) return ''
    try {
      const d = typeof date === 'string' ? parseISO(date) : date
      return formatDistanceToNow(d, { addSuffix: true })
    } catch {
      return typeof date === 'string' ? date : ''
    }
  }

  const [relative, setRelative] = useState<string>(compute)

  useEffect(() => {
    // Recompute immediately when date changes
    setRelative(compute())

    const id = setInterval(() => {
      setRelative(compute())
    }, 60_000)

    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  return relative
}
