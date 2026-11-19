import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Copy, Loader2, RefreshCw, Sparkles, PenLine, Check } from 'lucide-react'
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
          if (p?.busy) { await new Promise(r => setTimeout(r, 20_000)); i--; continue }
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

  const decide = async (decision: 'approve' | 'reject') => {
    setRunning(true)
    try {
      const p = await callPreview({ leadId: lead.id, decision })
      if (p) setPreview(p)
      showToast(decision === 'approve' ? `Approved. ${lead.name}'s first email now links the concept (still a draft).` : 'Taken out of the email.', 'success')
      await useAppStore.getState().refreshLeads()
    } catch (e: any) { showToast(e?.message || 'Could not save that', 'error') } finally { setRunning(false) }
  }
  void canRewriteEmails; void onRewriteEmails

  const idx = stageIndex(preview)
  const ready = preview?.status === 'ready' && preview?.url
  // Concepts are built by hand in a Claude chat now; the CRM only holds the link
  const building = false
  const prompt = `Pull the lead brief for "${lead.name}" from the Command Center (get_lead_brief) and build their homepage concept to the Grow The Hype build standard it includes, the same level as our NAKH (nakh-collective.netlify.app, nakh-wellness.netlify.app, nakh-institute.netlify.app), Ideal Integration (idealintegration.netlify.app), Tetz Powell (tetzpowell.netlify.app), T&C (tccpa.ca), Granville House (granvillehousemontessori.com) and Sumar (sumarfinancial.netlify.app) builds. Open those sites first and match their craft, not their look.

Use the skills in the order the standard gives: site-architecture, impeccable (init, shape, then audit and polish), design-taste-frontend, frontend-design, high-end-visual-design (selectively), emil-design-eng, animate, find-animation-opportunities, mobile-native, copy-editing, seo-audit, ai-seo, page-cro, review-animations and full-output-enforcement.

It has to look like a $250,000 custom build, 10 out of 10, with nothing that reads as a template or AI. Check their logo is really their logo and tell me if the photos aren't good enough before you build around them. Fully custom HTML on Netlify. Send me the live link and a zip, and only attach the concept to the lead after I approve it.`
  const attach = async () => {
    const url = window.prompt(`Paste the live link to ${lead.name}'s concept`)?.trim()
    if (!url) return
    setRunning(true)
    try {
      const p = await callPreview({ leadId: lead.id, decision: 'attach', url } as any)
      if (p) setPreview(p)
      showToast(`Saved. ${lead.name}'s first email now shares the concept (still a draft).`, 'success')
      await useAppStore.getState().refreshLeads()
    } catch (e: any) { showToast(e?.message || 'Could not save the link', 'error') } finally { setRunning(false) }
  }
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
              : 'Build it in a Claude chat: copy the prompt, paste it in a new chat, then save the live link here.'}
          </p>
        </div>
        <div className="cp-actions">
          {ready && (
            <>
              <a className="btn-primary" href={preview.url} target="_blank" rel="noreferrer"><ArrowUpRight size={13} /> Open concept</a>
              <button className="btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(preview.url); showToast('Link copied', 'success') } catch { /* blocked */ } }}><Copy size={13} /> Copy link</button>
              {preview.approved
                ? <button className="btn-ghost" onClick={() => decide('reject')} disabled={running}>Take it out of the email</button>
                : <button className="btn-primary" onClick={() => decide('approve')} disabled={running}><Check size={13} /> Approve for the email</button>}
            </>
          )}
          {!ready && (
            <>
              <button className="btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(prompt); showToast('Prompt copied. Paste it in a new Claude chat.', 'success') } catch { window.prompt('Copy this into a new Claude chat', prompt) } }}><Sparkles size={13} /> Copy build prompt</button>
              <button className="btn-ghost" onClick={attach} disabled={running}><Copy size={13} /> Save concept link</button>
            </>
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

      {ready && !preview.approved && (
        <p className="cp-note">Not in any email yet. Look it over first: only concepts you approve are linked in the first email.</p>
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
