// Small animated charts for the Home page. Pure SVG/CSS, no chart library.
// Everything animates in on mount and respects reduced-motion.
import { useEffect, useState } from 'react'

/** true one frame after mount, so CSS transitions run from the empty state */
export function useGrow(deps: any[] = []) {
  const [on, setOn] = useState(false)
  useEffect(() => { setOn(false); const r = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true))); return () => cancelAnimationFrame(r) }, deps)
  return on
}

/** Progress ring: value / total, with a label in the middle */
export function Ring({ value, total, size = 92, stroke = 8, label, sub }: { value: number; total: number; size?: number; stroke?: number; label: string; sub?: string }) {
  const on = useGrow([value, total])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = total > 0 ? Math.min(1, value / total) : 0
  return (
    <div className="vz-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={on ? c * (1 - pct) : c} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="vz-ring-arc" />
      </svg>
      <div className="vz-ring-c"><b>{label}</b>{sub && <span>{sub}</span>}</div>
    </div>
  )
}

/** Vertical bars, one per period. Each bar can have a lighter "target" behind it (e.g. invoiced vs collected). */
export function Bars({ data, height = 74, format }: { data: { label: string; value: number; back?: number; current?: boolean }[]; height?: number; format: (n: number) => string }) {
  const on = useGrow([data.map(d => d.value + ':' + (d.back || 0)).join()])
  const max = Math.max(1, ...data.map(d => Math.max(d.value, d.back || 0)))
  return (
    <div className="vz-bars" style={{ height: height + 22 }}>
      {data.map((d, i) => (
        <div key={d.label} className={`vz-bar ${d.current ? 'is-now' : ''}`} title={`${d.label}: ${format(d.value)}${d.back != null ? ` of ${format(d.back)}` : ''}`}>
          <div className="vz-bar-track" style={{ height }}>
            {d.back != null && <i className="vz-bar-back" style={{ height: on ? `${(d.back / max) * 100}%` : 0, transitionDelay: `${i * 60}ms` }} />}
            <i className="vz-bar-fill" style={{ height: on ? `${(d.value / max) * 100}%` : 0, transitionDelay: `${i * 60 + 80}ms` }} />
          </div>
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** One horizontal bar split into coloured segments */
export function Stack({ parts, height = 10 }: { parts: { value: number; tone: string; label: string }[]; height?: number }) {
  const on = useGrow([parts.map(p => p.value).join()])
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div className="vz-stack" style={{ height }} role="img" aria-label={parts.map(p => `${p.label} ${p.value}`).join(', ')}>
      {total === 0 ? <i className="vz-stack-empty" /> : parts.filter(p => p.value > 0).map((p, i) => (
        <i key={p.label} className={`vz-seg is-${p.tone}`} style={{ width: on ? `${(p.value / total) * 100}%` : 0, transitionDelay: `${i * 90}ms` }} />
      ))}
    </div>
  )
}

/** Donut of shares (e.g. hosting income by client) */
export function Donut({ parts, size = 92, stroke = 12, center, sub }: { parts: { value: number; label: string }[]; size?: number; stroke?: number; center: string; sub?: string }) {
  const on = useGrow([parts.map(p => p.value).join()])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  const shades = ['#FFFFFF', '#C9C6C0', '#9B978F', '#76736C', '#5A5752', '#45433F', '#36342F']
  let acc = 0
  return (
    <div className="vz-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={parts.map(p => p.label).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke} />
        {parts.map((p, i) => {
          const len = (p.value / total) * c
          const gap = parts.length > 1 ? Math.min(3, len * 0.3) : 0
          const el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={shades[i % shades.length]} strokeWidth={stroke}
            strokeDasharray={`${on ? Math.max(0, len - gap) : 0} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="vz-ring-arc" style={{ transitionDelay: `${i * 70}ms` }}><title>{p.label}</title></circle>
          acc += len
          return el
        })}
      </svg>
      <div className="vz-ring-c"><b>{center}</b>{sub && <span>{sub}</span>}</div>
    </div>
  )
}

/** Funnel rows with widths relative to the largest stage */
export function Funnel({ rows }: { rows: { label: string; n: number }[] }) {
  const on = useGrow([rows.map(r => r.n).join()])
  const max = Math.max(1, ...rows.map(r => r.n))
  return (
    <div className="vz-funnel">
      {rows.map((r, i) => (
        <div key={r.label} className="vz-fun-row">
          <span className="vz-fun-l">{r.label}</span>
          <div className="vz-fun-track"><i style={{ width: on ? `${Math.max(r.n ? 6 : 0, (r.n / max) * 100)}%` : 0, transitionDelay: `${i * 90}ms`, opacity: 1 - i * 0.16 }} /></div>
          <b className="vz-fun-n">{r.n}</b>
        </div>
      ))}
    </div>
  )
}

/** Four-step project stage meter: backlog, in progress, review, done */
const STAGES = ['backlog', 'progress', 'review', 'done']
export function StageMeter({ status }: { status: string }) {
  const on = useGrow([status])
  const at = Math.max(0, STAGES.indexOf(status))
  return (
    <span className="vz-stage" aria-label={`Stage ${at + 1} of 4`}>
      {STAGES.map((s, i) => <i key={s} className={on && i <= at ? 'is-on' : ''} style={{ transitionDelay: `${i * 80}ms` }} />)}
    </span>
  )
}
