import { useEffect, useRef } from 'react'

/**
 * Draws a notification-count badge on the favicon.
 * When count > 0, renders a red circle with white number (capped at "9+").
 * When count is 0, restores the original favicon.
 */
export function useFaviconBadge(count: number) {
  const originalHref = useRef<string | null>(null)

  useEffect(() => {
    const link: HTMLLinkElement =
      document.querySelector('link[rel="icon"]') ||
      (() => {
        const el = document.createElement('link')
        el.rel = 'icon'
        document.head.appendChild(el)
        return el
      })()

    // Capture the original favicon href on first run
    if (originalHref.current === null) {
      originalHref.current = link.href
    }

    // No badge needed — restore original
    if (count <= 0) {
      link.href = originalHref.current
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = originalHref.current

    img.onload = () => {
      const size = 64
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Draw original favicon
      ctx.drawImage(img, 0, 0, size, size)

      // Badge params
      const label = count > 9 ? '9+' : String(count)
      const badgeRadius = label.length > 1 ? 15 : 12
      const cx = size - badgeRadius - 1
      const cy = badgeRadius + 1

      // Red circle
      ctx.beginPath()
      ctx.arc(cx, cy, badgeRadius, 0, 2 * Math.PI)
      ctx.fillStyle = '#DC2626'
      ctx.fill()

      // White text
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `bold ${label.length > 1 ? 16 : 20}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, cx, cy + 1)

      // Apply
      link.href = canvas.toDataURL('image/png')
    }

    // If image fails to load, just skip badge
    img.onerror = () => {}
  }, [count])
}
