/**
 * Global interface effects.
 * - Cursor spotlight: panels light up where the pointer is. One passive
 *   listener for the whole app; it only writes two CSS variables.
 */
const SPOT_SELECTOR =
  '.card, .card-interactive, .card-glass, .stat-card, .brf-board, .brf-col, .qs, .brf-signal, .brf-deck, .modal-container, .spot'

export function installFx() {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(hover: none)').matches) return

  let raf = 0
  let lastEvent: PointerEvent | null = null

  const apply = () => {
    raf = 0
    const e = lastEvent
    if (!e) return
    const target = (e.target as Element | null)?.closest?.(SPOT_SELECTOR) as HTMLElement | null
    if (!target) return
    const r = target.getBoundingClientRect()
    target.style.setProperty('--mx', `${e.clientX - r.left}px`)
    target.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      lastEvent = e
      if (!raf) raf = requestAnimationFrame(apply)
    },
    { passive: true },
  )
}
