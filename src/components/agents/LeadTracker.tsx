import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, Loader2, Mail, Check, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAppStore, type OutreachLead } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'
import { relativeDate } from '@/lib/utils'
import type { LeadAgent } from '@/components/outreach/LeadAgents'
import { callAgent } from '@/hooks/useAgentWorkspace'

/*
 * Lead tracker: where every contacted business stands after the first email.
 * The stage is worked out from what actually happened in Omar's Gmail: drafts
 * he sent, emails he wrote himself, replies, bounces, accepted invites and
 * proposals (see api/agent/_lib/tracker-sync.ts). It checks Gmail when the
 * tracker opens and every few minutes while it is on screen. Omar can still
 * move a lead by hand at any point.
 */

export type TrackStage = 'drafted' | 'emailed' | 'following' | 'replied' | 'call' | 'proposal' | 'won' | 'closed'

export const TRACK_STAGES: { key: TrackStage; label: string; hint: string }[] = [
  { key: 'drafted', label: 'In drafts', hint: 'Ready in your Gmail drafts. Send it when you are happy with it.' },
  { key: 'emailed', label: 'Emailed', hint: 'First email sent, waiting to hear back' },
  { key: 'following', label: 'Following up', hint: 'A follow-up has gone out' },
  { key: 'replied', label: 'Replied', hint: 'They wrote back. Your move.' },
  { key: 'call', label: 'Call booked', hint: 'A conversation is on the calendar' },
  { key: 'proposal', label: 'Proposal', hint: 'Proposal or quote sent' },
  { key: 'won', label: 'Won', hint: 'They said yes' },
  { key: 'closed', label: 'Closed', hint: 'Not now, or no reply after the last note' },
]

/** What lead.stage is saved as when Omar moves a lead by hand */
const STAGE_VALUE: Record<TrackStage, string> = {
  drafted: 'qualified',
  emailed: 'Contacted',
  following: 'Contacted',
  replied: 'Responded',
  call: 'Meeting Set',
  proposal: 'Proposal Sent',
  won: 'Closed Won',
  closed: 'Closed Lost',
}

interface TrackStep { id: string; step_number: number; status: string; scheduled_at: string | null; executed_at: string | null; gmail_thread_id: string | null; metadata?: any }
interface TrackSeq { id: string; status: string; replied_at: string | null; created_at: string; lead: OutreachLead | null; steps: TrackStep[] }

export interface TrackRow {
  lead: OutreachLead
  seq: TrackSeq
  stage: TrackStage
  sentCount: number
  lastTouch: string | null
  lastLabel: string
  next: string
  urgent: boolean
  threadId: string | null
}

const STEP_NAME: Record<number, string> = { 1: 'First email', 2: 'Follow-up', 3: 'Final note' }

/** Manual stages set on the lead win over what the emails say */
function manualStage(raw: string | null | undefined): TrackStage | null {
  const s = String(raw || '').toLowerCase().replace(/[_-]/g, ' ').trim()
  if (!s) return null
  if (/won/.test(s)) return 'won'
  if (/lost|not interested|unsubscribed|closed/.test(s)) return 'closed'
  if (/proposal|quote/.test(s)) return 'proposal'
  if (/meeting|call/.test(s)) return 'call'
  if (/respond|interested|objection|replied/.test(s)) return 'replied'
  return null
}

function buildRow(seq: TrackSeq): TrackRow | null {
  const lead = seq.lead
  if (!lead) return null
  const steps = [...(seq.steps || [])].sort((a, b) => a.step_number - b.step_number)
  const sent = steps.filter(s => ['sent', 'replied'].includes(s.status) && s.executed_at)
  const manual = manualStage(lead.stage)
  const first = steps.find(s => s.step_number === 1)
  const inDrafts = !sent.length && first?.status === 'approved' && first?.metadata?.via === 'gmail_draft'
  if (!sent.length && !manual && !inDrafts) return null

  const last = sent[sent.length - 1] || null
  const upcoming = steps.find(s => ['scheduled', 'pending', 'approved'].includes(s.status))
  const seqDone = ['completed', 'stopped'].includes(seq.status) || (!upcoming && sent.length >= 3)

  let stage: TrackStage
  if (manual) stage = manual
  else if (inDrafts) stage = 'drafted'
  else if (seq.status === 'replied') stage = 'replied'
  else if (seq.status === 'bounced') stage = 'closed'
  else if (seq.status === 'unsubscribed') stage = 'closed'
  else if (seqDone) stage = 'closed'
  else stage = sent.length > 1 ? 'following' : 'emailed'

  let next = ''
  let urgent = false
  switch (stage) {
    case 'drafted': next = 'Send it from your Gmail drafts'; urgent = true; break
    case 'emailed':
    case 'following':
      if (upcoming?.status === 'scheduled' && upcoming.scheduled_at) next = `${STEP_NAME[upcoming.step_number]} goes out ${relativeDate(upcoming.scheduled_at)}`
      else if (upcoming) { next = `${STEP_NAME[upcoming.step_number]} waiting for your OK`; urgent = true }
      else next = 'Waiting on a reply'
      break
    case 'replied': next = 'Reply and book a call'; urgent = true; break
    case 'call': next = 'Have the call, then send a proposal'; break
    case 'proposal': next = 'Check in if you have not heard back'; break
    case 'won': next = lead.converted_client_id ? 'Now a client' : 'Set them up as a client'; break
    case 'closed':
      if (seq.status === 'bounced') { next = 'Email bounced. Find another address'; urgent = true; break }
      next = seq.status === 'unsubscribed' || /lost|not/i.test(String(lead.stage)) ? 'Not interested for now' : 'No reply after the last note'; break
  }

  const touch = seq.replied_at && ['replied', 'call', 'proposal', 'won'].includes(stage) ? seq.replied_at : last?.executed_at || null
  const draftedAt = inDrafts ? first?.metadata?.gmail_draft_at || null : null
  const lastLabel = seq.replied_at && touch === seq.replied_at ? 'They replied'
    : last?.metadata?.via === 'gmail_own' ? 'You emailed them'
    : last ? `${STEP_NAME[last.step_number]} sent`
    : inDrafts ? 'Drafted' : 'Moved by you'
  const threadId = sent.find(s => s.gmail_thread_id)?.gmail_thread_id || null
  return { lead, seq, stage, sentCount: sent.length, lastTouch: touch || draftedAt, lastLabel, next, urgent, threadId }
}

export function useLeadTracker(agent: LeadAgent | null) {
  const [rows, setRows] = useState<TrackRow[]>([])
  const [loading, setLoading] = useState(true)
  const demo = useAppStore(s => s.demoMode)

  const load = useCallback(async () => {
    if (!agent || demo) { setRows([]); setLoading(false); return }
    const { data, error } = await supabase.from('outreach_sequences')
      .select('id, status, replied_at, created_at, lead:outreach_leads(*), steps:outreach_steps(id, step_number, status, scheduled_at, executed_at, gmail_thread_id, metadata)')
      .eq('agent_config_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) { console.error('tracker:', error); setLoading(false); return }
    // One row per lead: keep the newest sequence
    const seen = new Set<string>()
    const out: TrackRow[] = []
    for (const seq of (data || []) as any[]) {
      const lead = Array.isArray(seq.lead) ? seq.lead[0] : seq.lead
      if (!lead || seen.has(lead.id)) continue
      const row = buildRow({ ...seq, lead })
      if (row) { seen.add(lead.id); out.push(row) }
    }
    out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || String(b.lastTouch || '').localeCompare(String(a.lastTouch || '')))
    setRows(out)
    setLoading(false)
  }, [agent, demo])

  useEffect(() => { setLoading(true); load() }, [load])

  // Check Gmail when the tracker opens and every 4 minutes while it's visible
  const [syncing, setSyncing] = useState(false)
  const [syncedAt, setSyncedAt] = useState<Date | null>(null)
  const sync = useCallback(async () => {
    if (!agent || demo) return
    setSyncing(true)
    try { await callAgent({ mode: 'sync_drafts', agentType: agent.agent_type, configId: agent.id }); setSyncedAt(new Date()) } catch { /* offline is fine */ }
    setSyncing(false)
    await load()
  }, [agent, demo, load])
  useEffect(() => {
    sync()
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') sync() }, 240_000)
    return () => window.clearInterval(id)
  }, [sync])

  /** Move a lead by hand. Anything past "Following up" stops the automatic follow-ups. */
  const move = useCallback(async (row: TrackRow, to: TrackStage) => {
    const now = new Date().toISOString()
    const { error } = await supabase.from('outreach_leads')
      .update({ stage: STAGE_VALUE[to], last_contact: now.slice(0, 10) })
      .eq('id', row.lead.id)
    if (error) { showToast(error.message, 'error'); return }
    let stopped = 0
    if (!['emailed', 'following'].includes(to) && ['active', 'draft', 'paused'].includes(row.seq.status)) {
      await supabase.from('outreach_sequences')
        .update({ status: to === 'closed' ? 'stopped' : 'replied', replied_at: row.seq.replied_at || (to === 'closed' ? null : now), updated_at: now })
        .eq('id', row.seq.id)
      const { data } = await supabase.from('outreach_steps')
        .update({ status: 'skipped', updated_at: now })
        .eq('sequence_id', row.seq.id)
        .in('status', ['pending', 'scheduled'])
        .select('id')
      stopped = data?.length || 0
    }
    const label = TRACK_STAGES.find(s => s.key === to)?.label
    showToast(`${row.lead.name} moved to ${label}${stopped ? `. Follow-ups stopped.` : ''}`, 'success')
    await Promise.all([load(), useAppStore.getState().refreshLeads()])
  }, [load])

  return { rows, loading, reload: load, move, sync, syncing, syncedAt }
}

/* ========================================
   UI
   ======================================== */

function StageMenu({ row, onMove }: { row: TrackRow; onMove: (to: TrackStage) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const current = TRACK_STAGES.find(s => s.key === row.stage)!
  return (
    <div className="lt-menu" ref={ref}>
      <button className={`lt-pill lt-pill--${row.stage}`} onClick={e => { e.stopPropagation(); setOpen(o => !o) }} aria-haspopup="listbox" aria-expanded={open} disabled={busy}>
        {busy ? <Loader2 size={11} className="animate-spin" /> : <span className="lt-pill-dot" />}
        {current.label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <ul className="lt-menu-list" role="listbox">
          {TRACK_STAGES.filter(s => s.key !== 'following' && s.key !== 'drafted').map(s => (
            <li key={s.key}>
              <button role="option" aria-selected={s.key === row.stage} onClick={async e => {
                e.stopPropagation(); setOpen(false)
                if (s.key === row.stage) return
                setBusy(true); await onMove(s.key); setBusy(false)
              }}>
                <span className={`lt-pill-dot lt-dot--${s.key}`} />
                <span>{s.label}</span>
                {s.key === row.stage && <Check size={12} className="ml-auto" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Dots({ count }: { count: number }) {
  return (
    <span className="lt-dots" aria-label={`${count} of 3 emails sent`}>
      {[1, 2, 3].map(i => <span key={i} className={i <= count ? 'lt-dots-on' : ''} />)}
    </span>
  )
}

export default function LeadTracker({ agent, onOpenLead }: { agent: LeadAgent; onOpenLead: (lead: OutreachLead) => void }) {
  const t = useLeadTracker(agent)
  const [filter, setFilter] = useState<TrackStage | 'open'>('open')

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of t.rows) c[r.stage] = (c[r.stage] || 0) + 1
    return c
  }, [t.rows])
  const openCount = t.rows.filter(r => !['won', 'closed'].includes(r.stage)).length
  const yourMove = t.rows.filter(r => r.urgent).length
  const shown = filter === 'open' ? t.rows.filter(r => !['won', 'closed'].includes(r.stage)) : t.rows.filter(r => r.stage === filter)

  if (t.loading) return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-dim" /></div>

  if (t.rows.length === 0) {
    return (
      <div className="ah-empty">
        <Mail size={22} />
        <p className="ah-empty-title">No conversations yet</p>
        <p>Once an email is in your Gmail drafts or goes out, the business shows up here and moves along on its own: emailed, followed up, replied, call booked, proposal. You only move it to won.</p>
      </div>
    )
  }

  return (
    <div className="lt">
      {/* Stage rail */}
      <div className="lt-rail" role="tablist" aria-label="Stages">
        {TRACK_STAGES.map((s, i) => (
          <button key={s.key} role="tab" aria-selected={filter === s.key}
            className={`lt-step ${filter === s.key ? 'lt-step--on' : ''} ${counts[s.key] ? '' : 'lt-step--empty'}`}
            onClick={() => setFilter(f => f === s.key ? 'open' : s.key)} title={s.hint}
            style={{ animationDelay: `${i * 35}ms` }}>
            <span className={`lt-step-bar lt-dot--${s.key}`} />
            <span className="lt-step-v tabular-nums">{counts[s.key] || 0}</span>
            <span className="lt-step-l">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="lt-bar">
        <p className="lt-sum">
          {filter === 'open'
            ? <>{openCount} open conversation{openCount === 1 ? '' : 's'}{yourMove ? <> · <strong>{yourMove} need{yourMove === 1 ? 's' : ''} you</strong></> : ''}</>
            : <>{TRACK_STAGES.find(s => s.key === filter)?.hint}</>}
        </p>
        <div className="lt-bar-r">
          {filter !== 'open' && <button className="lt-clear" onClick={() => setFilter('open')}>Show all open</button>}
          <button className="lt-sync" onClick={() => t.sync()} disabled={t.syncing} title="Check Gmail for sends, replies and bounces now">
            <RefreshCw size={12} className={t.syncing ? 'animate-spin' : ''} />
            {t.syncing ? 'Checking Gmail' : t.syncedAt ? `Gmail checked ${t.syncedAt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}` : 'Check Gmail'}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="ah-empty" style={{ padding: '40px 20px' }}><p>Nobody here right now.</p></div>
      ) : (
        <ul className="lt-list">
          {shown.map((r, i) => (
            <li key={r.lead.id} className={`lt-row ${r.urgent ? 'lt-row--urgent' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
              <button className="lt-main" onClick={() => onOpenLead(r.lead)}>
                <span className="lt-name">{r.lead.name}</span>
                <span className="lt-meta">{[r.lead.industry, (r.lead as any).location?.split(',')[0]].filter(Boolean).join(' · ')}</span>
              </button>
              <div className="lt-touch">
                <Dots count={r.sentCount} />
                <span>{r.lastLabel}{r.lastTouch ? ` ${relativeDate(r.lastTouch)}` : ''}</span>
              </div>
              <p className={`lt-next ${r.urgent ? 'lt-next--urgent' : ''}`}>{r.next}</p>
              <div className="lt-actions">
                {r.threadId && (
                  <a className="lt-icon" href={`https://mail.google.com/mail/u/0/#all/${r.threadId}`} target="_blank" rel="noreferrer" title="Open the thread in Gmail" aria-label="Open the thread in Gmail">
                    <Mail size={14} />
                  </a>
                )}
                <StageMenu row={r} onMove={to => t.move(r, to)} />
                <button className="lt-icon" onClick={() => onOpenLead(r.lead)} title="Open lead file" aria-label="Open lead file"><ArrowUpRight size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
