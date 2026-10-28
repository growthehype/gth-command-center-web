import { useEffect, useState } from 'react'

const KEY = 'gth_booted'
const CHECKS = ['Clients', 'Pipeline', 'Revenue', 'Agents', 'Calendar']

/** Short boot sequence, once per browser session. Click or any key skips it. */
export default function BootSequence() {
  const [show, setShow] = useState(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
      return sessionStorage.getItem(KEY) !== '1'
    } catch {
      return false
    }
  })
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!show) return
    try { sessionStorage.setItem(KEY, '1') } catch { /* private mode */ }
    const timers: number[] = []
    CHECKS.forEach((_, i) => timers.push(window.setTimeout(() => setStep(i + 1), 260 + i * 190)))
    timers.push(window.setTimeout(() => setLeaving(true), 260 + CHECKS.length * 190 + 280))
    timers.push(window.setTimeout(() => setShow(false), 260 + CHECKS.length * 190 + 1100))
    const skip = () => { setLeaving(true); window.setTimeout(() => setShow(false), 700) }
    window.addEventListener('keydown', skip, { once: true })
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('keydown', skip)
    }
  }, [show])

  if (!show) return null

  return (
    <div
      className={`boot ${leaving ? 'boot--out' : ''}`}
      onClick={() => { setLeaving(true); window.setTimeout(() => setShow(false), 700) }}
      role="status"
      aria-label="Loading command center"
    >
      <div className="boot-core">
        <img src="./icon.png" alt="" className="boot-logo" draggable={false} />
        <p className="boot-title">Command Center</p>
        <div className="boot-bar"><span style={{ transform: `scaleX(${step / CHECKS.length})` }} /></div>
        <ul className="boot-checks">
          {CHECKS.map((c, i) => (
            <li key={c} data-on={i < step || undefined}>
              <span className="boot-light" />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
