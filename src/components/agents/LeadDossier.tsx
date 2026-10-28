import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Globe, MapPin, Phone, Mail, Star, Check, AlertCircle, HelpCircle, Send, PenLine, Loader2, ThumbsDown, Copy } from 'lucide-react'
import type { OutreachLead } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'
import { relativeDate } from '@/lib/utils'
import { callAgent, loadLeadSequence, type WorkStep } from '@/hooks/useAgentWorkspace'
import { leadQual, leadTier, leadObservation, TIER_LABEL, TIER_HINT, ANGLE_LABEL, type BreakdownRow } from './leadScore'
import type { LeadAgent } from '@/components/outreach/LeadAgents'

const GROUPS: { key: 'need' | 'fit' | 'reach'; label: string; max: number; blurb: string }[] = [
  { key: 'need', label: 'Need', max: 50, blurb: 'Is there a real, visible problem we can fix?' },
  { key: 'fit', label: 'Fit', max: 30, blurb: 'Is this the kind of business we do our best work for?' },
  { key: 'reach', label: 'Reach', max: 20, blurb: 'Can we get the email in front of the owner?' },
]

const STEP_NAME: Record<number, string> = { 1: 'First email', 2: 'Follow-up', 3: 'Final note' }

function host(url?: string | null) {
  if (!url) return null
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '') } catch { return url }
}

function ScoreRing({ score, tier }: { score: number | null; tier: string }) {
  const pct = Math.max(0, Math.min(100, score ?? 0))
  const r = 30, c = 2 * Math.PI * r
  return (
    <div className={`ld-ring ld-ring--${tier}`} aria-label={`Score ${score ?? 'not checked'} out of 100`}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r={r} className="ld-ring-track" />
        <circle cx="36" cy="36" r={r} className="ld-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="tabular-nums">{score ?? '–'}</span>
    </div>
  )
}

function Row({ row }: { row: BreakdownRow }) {
  // Need: a 'fail' is a gap we found (the opportunity). Fit/Reach: 'pass' means the criterion is met.
  const kind = row.status === 'unknown' ? 'unknown'
    : row.group === 'need' ? (row.status === 'fail' ? 'gap' : 'fine')
    : (row.status === 'pass' ? 'met' : 'miss')
  const Icon = kind === 'gap' ? AlertCircle : kind === 'met' || kind === 'fine' ? Check : kind === 'miss' ? X : HelpCircle
  return (
    <li className={`ld-row ld-row--${kind}`}>
      <Icon size={14} className="ld-row-icon" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="ld-row-label">{row.label}</p>
        {row.detail && <p className="ld-row-detail">{row.detail}</p>}
      </div>
      <span className="ld-row-pts tabular-nums">{row.points > 0 ? `+${row.points}` : '0'}<em>/{row.max}</em></span>
    </li>
  )
}

interface Props {
  lead: OutreachLead
  agent: LeadAgent | null
  onClose: () => void
  onChanged?: () => void
}

export default function LeadDossier({ lead, agent, onClose, onChanged }: Props) {
  const q = leadQual(lead)
  const tier = leadTier(lead)
  const obs = leadObservation(lead)
  const e = lead.enrichment_data || {}
  const exportOnly = agent?.config?.delivery === 'export'
  const [steps, setSteps] = useState<WorkStep[]>([])
  const [busy, setBusy] = useState<null | 'draft' | 'send' | 'save' | 'dismiss'>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const refreshSteps = async () => setSteps(await loadLeadSequence(lead.id))
  useEffect(() => { refreshSteps() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lead.id])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const grouped = useMemo(() => {
    const out: Record<string, BreakdownRow[]> = { need: [], fit: [], reach: [] }
    for (const r of q?.breakdown || []) (out[r.group] ||= []).push(r)
    return out
  }, [q])

  const first = steps.find(s => s.step_number === 1)
  const anySent = steps.some(s => ['sent', 'replied'].includes(s.status))
  const firstReady = first && first.status === 'pending'

  const draft = async () => {
    if (!agent) return
    setBusy('draft')
    try {
      await callAgent({ mode: 'draft_lead', agentType: agent.agent_type, configId: agent.id, leadId: lead.id })
      await refreshSteps()
      showToast(`Emails written for ${lead.name}`, 'success')
      onChanged?.()
    } catch (err: any) { showToast(err?.message || 'Could not write the emails', 'error') }
    finally { setBusy(null) }
  }

  const sendFirst = async () => {
    if (!first || !agent) return
    setBusy('send')
    const now = new Date().toISOString()
    try {
      if (exportOnly) {
        try { await navigator.clipboard.writeText(`To: ${lead.email || ''}\nSubject: ${first.subject || ''}\n\n${first.body || ''}`) } catch { /* blocked */ }
        await supabase.from('outreach_steps').update({ status: 'approved', approval_status: 'approved', updated_at: now }).eq('id', first.id)
        showToast('Email copied', 'success')
      } else {
        await supabase.from('outreach_steps').update({ status: 'scheduled', approval_status: first.metadata?.edited ? 'edited' : 'approved', scheduled_at: now, updated_at: now }).eq('id', first.id)
        await supabase.from('outreach_sequences').update({ status: 'active', updated_at: now }).eq('id', first.sequence_id).eq('status', 'draft')
        const r = await callAgent({ mode: 'send_approved', agentType: agent.agent_type, configId: agent.id })
        const res = r?.results?.send_emails || {}
        if (res.sent) showToast(`Sent to ${lead.name}`, 'success')
        else showToast(res.firstError ? `Approved, but Gmail said: ${res.firstError}` : 'Approved. It goes out with the next send.', res.firstError ? 'error' : 'info')
      }
      await refreshSteps()
      onChanged?.()
    } catch (err: any) { showToast(err?.message || 'Send failed', 'error') }
    finally { setBusy(null) }
  }

  const saveEdit = async (s: WorkStep) => {
    setBusy('save')
    const { error } = await supabase.from('outreach_steps')
      .update({ subject, body, approval_status: 'edited', metadata: { ...(s.metadata || {}), edited: true }, updated_at: new Date().toISOString() })
      .eq('id', s.id)
    setBusy(null)
    if (error) { showToast(error.message, 'error'); return }
    setEditId(null)
    await refreshSteps()
    showToast('Saved', 'success')
  }

  const dismiss = async () => {
    setBusy('dismiss')
    const data = { ...(lead.enrichment_data || {}), user_feedback: 'bad', feedback_at: new Date().toISOString() }
    const { error } = await supabase.from('outreach_leads').update({ enrichment_data: data, stage: 'skipped' }).eq('id', lead.id)
    if (!error && first && !anySent) {
      await supabase.from('outreach_sequences').update({ status: 'stopped' }).eq('id', first.sequence_id)
      await supabase.from('outreach_steps').update({ status: 'skipped' }).eq('sequence_id', first.sequence_id).in('status', ['pending', 'scheduled'])
    }
    setBusy(null)
    if (error) { showToast(error.message, 'error'); return }
    await useAppStore.getState().refreshLeads()
    showToast(`${lead.name} marked as not a fit. The agent learns from this.`, 'info')
    onChanged?.()
    onClose()
  }

  const legacy = !q && lead.qualification_score != null

  return createPortal(
    <div className="cw-overlay" role="dialog" aria-modal="true" aria-label={lead.name}>
      <div className="cw-window ld-window">
        <div className="cw-inner">
          {/* Header */}
          <header className="ld-head">
            <ScoreRing score={lead.qualification_score ?? null} tier={tier} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="ld-name">{lead.name}</h2>
                <span className={`ld-tier ld-tier--${tier}`}>{TIER_LABEL[tier]}</span>
              </div>
              <p className="ld-sub">
                {[lead.industry, lead.address || (lead as any).location].filter(Boolean).join(' · ')}
              </p>
              <p className="ld-hint">{TIER_HINT[tier]}</p>
            </div>
            <button className="ld-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>

          <div className="ld-links">
            {lead.website && <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer"><Globe size={13} /> {host(lead.website)}</a>}
            {lead.google_maps_url && <a href={lead.google_maps_url} target="_blank" rel="noreferrer"><MapPin size={13} /> Google listing</a>}
            {lead.rating != null && <span><Star size={13} /> {lead.rating}{e.review_count || e.user_rating_count ? ` · ${e.review_count || e.user_rating_count} reviews` : ''}</span>}
            {lead.phone && <a href={`tel:${lead.phone}`}><Phone size={13} /> {lead.phone}</a>}
            {lead.email
              ? <a href={`mailto:${lead.email}`}><Mail size={13} /> {lead.email}{e.email_source === 'guessed' ? ' (guessed)' : ''}</a>
              : <span className="ld-warn"><Mail size={13} /> No email found</span>}
          </div>

          <div className="ld-grid">
            {/* Left: what we saw */}
            <section className="ld-col">
              {q?.design?.screenshot_url ? (
                <figure className="ld-shot">
                  <img src={q.design.screenshot_url} alt={`${lead.name} homepage on a phone`} loading="lazy" />
                  <figcaption>
                    <span className={`ld-verdict ld-verdict--${q.design.verdict || 'unknown'}`}>{q.design.verdict ? `Design: ${q.design.verdict}` : 'Design not judged'}</span>
                    {q.design.note && <span>{q.design.note}</span>}
                  </figcaption>
                </figure>
              ) : (
                <div className="ld-shot ld-shot--empty">
                  <Globe size={20} />
                  <p>{lead.website ? 'No screenshot yet. Rescore to see the site.' : 'No website on their Google listing.'}</p>
                </div>
              )}

              {obs && (
                <div className="ld-card">
                  <p className="ld-k">What the email opens with</p>
                  <p className="ld-quote">“{obs}”</p>
                  {(q?.pitch_angle || e.pitch_angle) && <p className="ld-meta">Pitch: {ANGLE_LABEL[q?.pitch_angle || e.pitch_angle] || q?.pitch_angle || e.pitch_angle}</p>}
                </div>
              )}

              {lead.qualification_reason && (
                <div className="ld-card">
                  <p className="ld-k">Why this score</p>
                  <p className="ld-p">{lead.qualification_reason}</p>
                  {q?.adjustment?.points ? <p className="ld-meta">Agent judgment: {q.adjustment.points > 0 ? '+' : ''}{q.adjustment.points}, {q.adjustment.reason}</p> : null}
                  {q?.disqualifier && <p className="ld-meta ld-warn">Not a fit: {q.disqualifier}</p>}
                </div>
              )}
            </section>

            {/* Right: the checklist */}
            <section className="ld-col">
              <p className="ld-k">Score breakdown</p>
              {q ? (
                <div className="ld-groups">
                  {GROUPS.map(g => {
                    const got = (q as any)[g.key] ?? grouped[g.key].reduce((a, r) => a + r.points, 0)
                    return (
                      <div key={g.key} className="ld-group">
                        <div className="ld-group-head">
                          <div>
                            <p className="ld-group-name">{g.label}</p>
                            <p className="ld-group-blurb">{g.blurb}</p>
                          </div>
                          <span className="ld-group-pts tabular-nums">{got}<em>/{g.max}</em></span>
                        </div>
                        <div className="ld-bar"><i style={{ width: `${Math.min(100, (got / g.max) * 100)}%` }} /></div>
                        <ul className="ld-rows">{grouped[g.key].map(r => <Row key={r.key} row={r} />)}</ul>
                      </div>
                    )
                  })}
                  <p className="ld-legend"><span><AlertCircle size={12} /> gap we can fix</span><span><Check size={12} /> in place or criterion met</span><span><X size={12} /> not met</span><span><HelpCircle size={12} /> couldn’t check</span></p>
                </div>
              ) : (
                <div className="ld-card">
                  <p className="ld-p">
                    {legacy
                      ? 'This lead was scored with the earlier method, so there is no itemized checklist. Run "Rescore all leads" in the agent’s Leads tab to check it the new way.'
                      : 'The agent hasn’t checked this business yet.'}
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* Emails */}
          <section className="ld-emails">
            <div className="ld-emails-head">
              <p className="ld-k" style={{ margin: 0 }}>Emails</p>
              <div className="flex items-center gap-2 flex-wrap">
                {!anySent && (
                  <button className="btn-ghost" onClick={draft} disabled={!!busy || !lead.email || !agent}>
                    {busy === 'draft' ? <Loader2 size={13} className="animate-spin" /> : <PenLine size={13} />}
                    {steps.length ? 'Rewrite emails' : 'Write emails'}
                  </button>
                )}
                {firstReady && (
                  <button className="btn-primary" onClick={sendFirst} disabled={!!busy}>
                    {busy === 'send' ? <Loader2 size={13} className="animate-spin" /> : exportOnly ? <Copy size={13} /> : <Send size={13} />}
                    {exportOnly ? 'Copy first email' : 'Send first email'}
                  </button>
                )}
              </div>
            </div>

            {steps.length === 0 ? (
              <p className="ld-p text-dim">{lead.email ? 'No emails written yet.' : 'Add an email address to this lead before the agent can write to them.'}</p>
            ) : (
              <ol className="ld-steps">
                {steps.map(s => {
                  const editing = editId === s.id
                  const editable = ['pending', 'scheduled'].includes(s.status)
                  return (
                    <li key={s.id} className="ld-step">
                      <div className="ld-step-head">
                        <span className="ld-step-n">{STEP_NAME[s.step_number] || `Email ${s.step_number}`}</span>
                        <span className={`ld-step-status ld-step-status--${s.status}`}>
                          {s.status === 'pending' ? (s.scheduled_at ? 'Ready for you' : 'Waits for the email before it') :
                            s.status === 'scheduled' ? `Sends ${s.scheduled_at ? relativeDate(s.scheduled_at) : 'soon'}` :
                            s.status === 'sent' ? `Sent ${s.executed_at ? relativeDate(s.executed_at) : ''}` : s.status}
                        </span>
                        {editable && !editing && (
                          <button className="ld-link" onClick={() => { setEditId(s.id); setSubject(s.subject || ''); setBody(s.body || '') }}>Edit</button>
                        )}
                      </div>
                      {editing ? (
                        <div className="ld-edit">
                          <input className="cw-input" value={subject} onChange={ev => setSubject(ev.target.value)} aria-label="Subject" />
                          <textarea className="cw-input ld-body-input" rows={9} value={body} onChange={ev => setBody(ev.target.value)} aria-label="Email" />
                          <div className="flex justify-end gap-2">
                            <button className="btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                            <button className="btn-primary" onClick={() => saveEdit(s)} disabled={busy === 'save'}>Save</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="ld-step-subj">{s.subject}</p>
                          <p className="ld-step-body">{s.body}</p>
                        </>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <footer className="ld-foot">
            {tier !== 'skip' && (
              <button className="btn-ghost" onClick={dismiss} disabled={!!busy}>
                <ThumbsDown size={13} /> Not a fit
              </button>
            )}
            <span className="flex-1" />
            <button className="btn-ghost" onClick={onClose}>Close</button>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  )
}
