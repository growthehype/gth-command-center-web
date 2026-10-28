import { useEffect, useRef } from 'react'

/**
 * The command-center environment behind every page:
 * a deep starfield with a live data mesh, a perspective grid floor
 * running to a lit horizon, and radar rings under the searchlight.
 * One canvas, capped at 30fps, paused when the tab is hidden,
 * static when the user prefers reduced motion.
 */

interface Star {
  x: number
  y: number
  z: number // depth 0.2 (far) .. 1 (near)
  vx: number
  vy: number
  tw: number // twinkle phase
}

const STAR_COUNT = 150
const MESH_COUNT = 58
const LINK_DIST = 150

export default function CommandStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0
    let h = 0
    let stars: Star[] = []
    let mesh: Star[] = []
    let raf = 0
    let last = 0
    let px = 0
    let py = 0 // pointer parallax target (-1..1)
    let cx = 0
    let cy = 0

    const isLight = () => document.documentElement.getAttribute('data-theme') === 'light'

    const seed = () => {
      stars = Array.from({ length: STAR_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 0.2 + Math.random() * 0.8,
        vx: 0,
        vy: 0,
        tw: Math.random() * Math.PI * 2,
      }))
      mesh = Array.from({ length: MESH_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 0.5 + Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.08,
        tw: Math.random() * Math.PI * 2,
      }))
    }

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      w = r.width
      h = r.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    const draw = (t: number) => {
      const light = isLight()
      const ink = light ? '10,11,13' : '255,255,255'
      ctx.clearRect(0, 0, w, h)

      cx += (px - cx) * 0.04
      cy += (py - cy) * 0.04

      // Stars: drift slowly to the left, deeper ones slower; twinkle
      for (const s of stars) {
        if (!reduce) {
          s.x -= 0.035 * s.z
          if (s.x < -2) s.x = w + 2
        }
        const ox = cx * 14 * s.z
        const oy = cy * 10 * s.z
        const a = (0.12 + 0.42 * s.z) * (0.65 + 0.35 * Math.sin(t * 0.0012 * (0.6 + s.z) + s.tw))
        ctx.fillStyle = `rgba(${ink},${(light ? a * 0.35 : a).toFixed(3)})`
        const size = s.z > 0.92 ? 1.6 : s.z > 0.6 ? 1.1 : 0.8
        ctx.fillRect(s.x + ox, s.y + oy, size, size)
      }

      // Data mesh: slow-moving nodes with proximity links
      for (const m of mesh) {
        if (!reduce) {
          m.x += m.vx
          m.y += m.vy
          if (m.x < -20) m.x = w + 20
          if (m.x > w + 20) m.x = -20
          if (m.y < -20) m.y = h + 20
          if (m.y > h + 20) m.y = -20
        }
      }
      ctx.lineWidth = 0.6
      for (let i = 0; i < mesh.length; i++) {
        const a = mesh[i]
        const ax = a.x + cx * 22 * a.z
        const ay = a.y + cy * 16 * a.z
        for (let j = i + 1; j < mesh.length; j++) {
          const b = mesh[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < LINK_DIST * LINK_DIST) {
            const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * (light ? 0.05 : 0.09)
            ctx.strokeStyle = `rgba(${ink},${alpha.toFixed(3)})`
            ctx.beginPath()
            ctx.moveTo(ax, ay)
            ctx.lineTo(b.x + cx * 22 * b.z, b.y + cy * 16 * b.z)
            ctx.stroke()
          }
        }
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + a.tw)
        ctx.fillStyle = `rgba(${ink},${((light ? 0.15 : 0.35) + pulse * (light ? 0.1 : 0.35)).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(ax, ay, 1.2 + pulse * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 33) return // ~30fps is plenty for ambience
      last = t
      draw(t)
    }

    const onMove = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth) * 2 - 1
      py = (e.clientY / window.innerHeight) * 2 - 1
    }
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf)
      else if (!reduce) raf = requestAnimationFrame(loop)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('visibilitychange', onVis)
    if (reduce) draw(0)
    else raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return (
    <div className="stage" aria-hidden="true">
      <canvas ref={canvasRef} className="stage-canvas" />
      <div className="stage-radar">
        <span className="stage-ring" />
        <span className="stage-ring" />
        <span className="stage-ring" />
        <span className="stage-sweep" />
      </div>
      <div className="stage-light" />
      <div className="stage-vignette" />
    </div>
  )
}
