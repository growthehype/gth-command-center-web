import { useEffect, useState } from 'react'
import { Check, PenLine, X, ExternalLink, Play, Loader2 } from 'lucide-react'
import type { OutreachQueueItem } from '@/hooks/useAgentDashboard'

interface ApprovalQueueProps {
  queue: OutreachQueueItem[]
  loading?: boolean
  isRunning: boolean
  onApprove: (id: string) => Promise<void> | void
  onSkip: (id: string) => Promise<void> | void
  onSave: (id: string, subject: string, body: string) => Promise<void> | void
  onRun: () => void
}

const STEP_LABEL: Record<number, string> = { 1: 'First email', 2: 'Follow-up', 3: 'Final note' }

function hostOf(url?: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function QueueCard({ item, onApprove, onSkip, onSave }: {
  item: OutreachQueueItem
  onApprove: ApprovalQueueProps['onApprove']
  onSkip: ApprovalQueueProps['onSkip']
  onSave: ApprovalQueueProps['onSave']
}) {
  const lead = item.sequence?.lead
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(item.subject || '')
  const [body, setBody] = useState(item.body || '')
  const [busy, setBusy] = useState<null | 'approve' | 'skip' | 'save'>(null)

  useEffect(() => {
    if (!editing) {
      setSubject(item.subject || '')
      setBody(item.body || '')
    }
  }, [item.subject, item.body, editing])

  const step = item.step_number || 1
  const host = hostOf(lead?.website)
  const flagged = (item.metadata?.validator_issues || []).length > 0
  const score = lead?.score ?? null

  const run = async (kind: 'approve' | 'skip' | 'save', fn: () => Promise<void> | void) => {
    setBusy(kind)
    try { await fn() } finally { setBusy(null) }
  }

  return (
    <article className="card" style={{ padding: 0, borderRadius: 14 }}>
      <span className="edge-spot" aria-hidden="true" />
      <div className="relative grid grid-cols-1 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* Who and why */}
        <div className="px-5 pt-5 pb-4 xl:pb-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-polar" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.25 }}>
              {lead?.name || 'Unknown business'}
            </h3>
            {score !== null && (
              <span
                className={`badge ${score >= 80 ? 'badge-ok' : 'badge-neutral'} tabular-nums`}
                title="Fit score"
                style={{ flexShrink: 0 }}
              >
                {Math.round(score)}
              </span>
            )}
          </div>
          <p className="text-dim mt-1" style={{ fontSize: 12 }}>
            {[lead?.industry, lead?.location?.split(',').slice(-3, -1).join(',').trim() || null].filter(Boolean).join(' · ')}
            {lead?.rating ? ` · ${lead.rating} on Google` : ''}
          </p>

          {(lead?.observation || lead?.reason) && (
            <p className="text-steel mt-3" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              {lead?.observation ? <><span className="text-polar">Noticed:</span> {lead.observation}. </> : null}
              {lead?.reason}
            </p>
          )}

          {(lead?.issues?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {lead!.issues!.slice(0, 4).map((i) => (
                <span key={i} className="badge badge-neutral" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10.5 }}>{i}</span>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-1.5" style={{ fontSize: 12 }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-dim w-9 shrink-0">To</span>
              <span className="text-polar truncate">{lead?.email || 'no email'}</span>
              {lead?.email_source === 'guessed' && (
                <span className="badge badge-warn" title="No address was published; this is the usual info@ inbox for their domain" style={{ fontSize: 9.5 }}>guessed</span>
              )}
            </div>
            {host && (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-dim w-9 shrink-0">Site</span>
                <a href={lead!.website!.startsWith('http') ? lead!.website! : `https://${lead!.website}`} target="_blank" rel="noreferrer" className="text-steel hover:text-polar truncate inline-flex items-center gap-1">
                  {host} <ExternalLink size={11} />
                </a>
              </div>
            )}
            {lead?.phone && (
              <div className="flex items-center gap-2">
                <span className="text-dim w-9 shrink-0">Call</span>
                <span className="text-steel tabular-nums">{lead.phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* The email */}
        <div className="px-5 pt-5 pb-5 xl:border-l" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="label-md text-dim">{STEP_LABEL[step] || `Email ${step}`}</span>
            {item.metadata?.edited && <span className="badge badge-neutral" style={{ fontSize: 9.5 }}>edited</span>}
            {flagged && !item.metadata?.edited && (
              <span className="badge badge-warn" title={(item.metadata?.validator_issues || []).join('; ')} style={{ fontSize: 9.5 }}>check wording</span>
            )}
          </div>

          {editing ? (
            <div className="space-y-2.5">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-polar"
                style={{ fontSize: 13, fontWeight: 600 }}
                aria-label="Subject"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={Math.min(16, Math.max(8, body.split('\n').length + 2))}
                className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-polar"
                style={{ fontSize: 13.5, lineHeight: 1.6 }}
                aria-label="Email body"
              />
            </div>
          ) : (
            <div>
              <p className="text-polar" style={{ fontSize: 13.5, fontWeight: 600 }}>{item.subject || '(no subject)'}</p>
              <p className="text-steel mt-2.5 whitespace-pre-wrap" style={{ fontSize: 13.5, lineHeight: 1.65, maxWidth: 640 }}>
                {item.body}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-5">
            {editing ? (
              <>
                <button
                  className="btn-primary"
                  disabled={!!busy}
                  onClick={() => run('save', async () => { await onSave(item.id, subject.trim(), body.trim()); setEditing(false) })}
                >
                  {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Save
                </button>
                <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              </>
            ) : (
              <>
                <button className="btn-primary" disabled={!!busy || !lead?.email} onClick={() => run('approve', () => onApprove(item.id))}>
                  {busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Approve &amp; send
                </button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => setEditing(true)}>
                  <PenLine size={13} />
                  Edit
                </button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => run('skip', () => onSkip(item.id))} title={step === 1 ? 'Skip this business' : 'Skip this email'}>
                  {busy === 'skip' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function ApprovalQueue({ queue, loading, isRunning, onApprove, onSkip, onSave, onRun }: ApprovalQueueProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => <div key={i} className="skeleton-shimmer rounded-xl" style={{ height: 220 }} />)}
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <div className="card text-center" style={{ padding: '44px 24px', borderRadius: 14 }}>
        <p className="font-display text-polar" style={{ fontSize: 16, fontWeight: 700 }}>Nothing waiting for you</p>
        <p className="text-dim mt-2 mx-auto" style={{ fontSize: 12.5, maxWidth: 420, lineHeight: 1.6 }}>
          New drafts land here after each run. Follow-ups show up here too once they're due, so every email still goes past you first.
        </p>
        <button className="btn-primary mt-5" onClick={onRun} disabled={isRunning}>
          {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {isRunning ? 'Hunting...' : 'Find leads now'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {queue.map((item) => (
        <QueueCard key={item.id} item={item} onApprove={onApprove} onSkip={onSkip} onSave={onSave} />
      ))}
    </div>
  )
}
