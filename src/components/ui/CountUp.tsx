import { useEffect, useRef, useState } from 'react'

interface CountUpProps {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

/** Numbers roll up to their value on mount and on change. */
export default function CountUp({ value, format, duration = 900, className }: CountUpProps) {
  const [display, setDisplay] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || value === 0) {
      setDisplay(value)
      from.current = value
      return
    }
    const start = performance.now()
    const startVal = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const v = startVal + (value - startVal) * easeOutExpo(t)
      setDisplay(v)
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  const rounded = Number.isInteger(value) ? Math.round(display) : Math.round(display * 10) / 10
  return <span className={className}>{format ? format(rounded) : rounded.toLocaleString()}</span>
}
