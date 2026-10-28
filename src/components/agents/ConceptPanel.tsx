import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Copy, Loader2, RefreshCw, Sparkles, PenLine } from 'lucide-react'
import type { OutreachLead } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'
import { relativeDate } from '@/lib/utils'
import { callPreview } from '@/hooks/useAgentWorkspace'

/*
 * Homepage concept for one lead: the new homepage the agent builds from
 * their own logo, photos and details, published on growthehype-previews.
 */

const STAGES: { key: string; label: string }[] = [
  { key: 'kit', label: 'Reading their site' },
  { key: 'generated', label: 'Designing the page' },
  { key: 'scripted', label: 'Adding motion' },
  { key: 'ready', label: 'Checked and live' },
]

function stageIndex(p: any): number {
  if (!p) return -1
  if (p.status === 'ready') return 3
  if (p.status === 'scripted') return 2
  if (p.status === 'generated') return 1
  return 0
}

export default function ConceptPanel({ lead, canRewriteEmails, onRewriteEmails }: {
  lead: OutreachLead
  canRewriteEmails: boolean
  onRewriteEmails: () => Promise<void>
}) {
  const [preview, setPreview] = useState<any>((lead.enrichment_data as any)?.preview || null)
  const [running, setRunning] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const alive = useRef(true)
  const frameRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(() => el.style.setProperty('--cp-scale', String(el.clientWidth / 1440)))
    ro.observe(el)
    return () => ro.disconnect()
  })
  useEffect(() => () => { alive.current = false }, [])
  useEffect(() => { setPreview((lead.enrichment_data as any)?.preview || null) }, [lead.id, lead.enrichment_data])

  const run = async (opts: { rebuild?: boolean; feedback?: string } = {}) => {
    setRunning(true)
    let first = true
    let fails = 0
    try {
      for (let i = 0; i < 12 && alive.current; i++) {
        try {
          const p = await callPreview({ leadId: lead.id, ...(first ? opts : {}) })
          first = false
          fails = 0
          if (p) setPreview(p)
          if (!p || p.status === 'ready' || p.status === 'failed') {
            if (p?.status === 'ready') showToast(`Homepage concept for ${lead.name} is live`, 'success')
            if (p?.status === 'failed') showToast(p.error || 'The concept did not reach the bar', 'error')
            break
          }
        } catch (err: any) {
          fails++
          if (fails >= 2) { showToast(err?.message || 'The builder stopped', 'error'); break }
        }
      }
      await useAppStore.getState().refreshLeads()
    } finally { if (alive.current) setRunning(false) }
  }

  const idx = stageIndex(preview)
  const ready = preview?.status === 'ready' && preview?.url
  const building = running || (preview && !['ready', 'failed'].includes(preview.status))
  const score = preview?.review?.score

  if (!lead.website) return null

  return (
    <section className="cp">
      <div className="cp-head">
        <div>
          <p className="ld-k" style={{ margin: 0 }}>Homepage concept</p>
          <p className="cp-sub">
            {ready
              ? `Built ${preview.built_at ? relativeDate(preview.built_at) : ''} from their own logo, photos and details${score ? ` · review ${score}/10` : ''}`
              : building
                ? 'Built from their own logo, photos and details, then checked in a real browser.'
                : (lead.qualification_score || 0) >= 70
                  ? 'Hot leads get one automatically. You can start it now.'
                  : 'A new homepage for this business to send with the first email.'}
          </p>
        </div>
        <div className="cp-actions">
          {ready && (
            <>
              <a className="btn-primary" href={preview.url} target="_blank" rel="noreferrer"><ArrowUpRight size={13} /> Open concept</a>
              <button className="btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(preview.url); showToast('Link copied', 'success') } catch { /* blocked */ } }}><Copy size={13} /> Copy link</button>
              <button className="btn-ghost" onClick={() => setNotesOpen(o => !o)} disabled={running}><RefreshCw size={13} /> Redo</button>
            </>
          )}
          {!ready && !building && (
            <button className="btn-primary" onClick={() => run({ rebuild: preview?.status === 'failed' })}><Sparkles size={13} /> {preview?.status === 'failed' ? 'Try again' : 'Build concept'}</button>
          )}
          {!ready && building && !running && (
            <button className="btn-ghost" onClick={() => run()}><Loader2 size={13} /> Continue now</button>
          )}
        </div>
      </div>

      {(building || ready) && (
        <ol className="cp-steps" aria-label="Progress">
          {STAGES.map((s, i) => (
            <li key={s.key} className={i < idx || ready ? 'cp-step--done' : i === idx ? 'cp-step--now' : ''}>
              <span className="cp-step-bar" />
              <span className="cp-step-l">{i === idx && running && !ready ? <Loader2 size={11} className="animate-spin" /> : null}{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      {building && <p className="cp-note">Each step takes a few minutes. It keeps going in the background, so you can close this.</p>}
      {preview?.status === 'failed' && preview?.error && <p className="cp-note cp-note--err">{preview.error}</p>}

      {ready && (
        <a ref={frameRef} className="cp-frame" href={preview.url} target="_blank" rel="noreferrer" aria-label={`Open the homepage concept for ${lead.name}`}>
          <iframe src={preview.url} title={`Homepage concept for ${lead.name}`} loading="lazy" tabIndex={-1} sandbox="allow-scripts allow-same-origin" />
        </a>
      )}

      {ready && canRewriteEmails && (
        <div className="cp-email">
          <p>The emails were written before this concept existed.</p>
          <button className="btn-ghost" onClick={onRewriteEmails} disabled={running}><PenLine size={13} /> Rewrite emails with the concept</button>
        </div>
      )}

      {notesOpen && (
        <div className="cp-notes">
          <label htmlFor={`cp-notes-${lead.id}`}>What should change? One note per line, or leave empty for a fresh take.</label>
          <textarea id={`cp-notes-${lead.id}`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Use the team photo in the hero&#10;Make it lighter and warmer" />
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setNotesOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => { setNotesOpen(false); run({ rebuild: true, feedback: notes }); setNotes('') }}><RefreshCw size={13} /> Rebuild</button>
          </div>
        </div>
      )}
    </section>
  )
}
