import { useEffect, useMemo, useState } from 'react'
import { Play, Loader2, Settings2, Send, Copy, SkipForward, Search, RefreshCw, ArrowUpRight, Inbox, CheckCircle2, Mail } from 'lucide-react'
import { useAppStore, type OutreachLead } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'
import { relativeDate } from '@/lib/utils'
import {
  useLeadAgents, AgentSettingsModal, leadBelongsTo, agentFor, isExportAgent, type LeadAgent,
} from '@/components/outreach/LeadAgents'
import { useAgentWorkspace, callAgent, type WorkStep } from '@/hooks/useAgentWorkspace'
import LeadDossier from '@/components/agents/LeadDossier'
import { leadTier, leadObservation, TIER_LABEL, type Tier } from '@/components/agents/leadScore'

type Tab = 'ready' | 'leads' | 'sent' | 'how' | 'log'
const STEP_NAME: Record<number, string> = { 1: 'First email', 2: 'Follow-up', 3: 'Final note' }

/* ========================================
   SEND DESK
   ======================================== */

function SendDesk({ items, exportOnly, onSend, onCopy, onSave, onSkip, onOpenLead, onRun, running }: {
  items: WorkStep[]
  exportOnly: boolean
  onSend: (s: WorkStep) => Promise<any>
  onCopy: (s: WorkStep) => Promise<any>
  onSave: (s: WorkStep, subject: string, body: string) => Promise<any>
  onSkip: (s: WorkStep) => Promise<any>
  onOpenLead: (lead: OutreachLead) => void
  onRun: () => void
  running: boolean
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = items.find(i => i.id === activeId) || items[0] || null
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState<null | 'send' | 'save' | 'skip'>(null)

  useEffect(() => {
    setSubject(active?.subject || '')
    setBody(active?.body || '')
  }, [active?.id, active?.subject, active?.body])

  if (items.length === 0) {
    return (
      <div className="ah-empty">
        <Inbox size={22} />
        <p className="ah-empty-title">Nothing waiting for you</p>
        <p>When the agent finds a business worth contacting, the email it wrote lands here for you to read, tweak and send.</p>
        <button className="btn-primary" onClick={onRun} disabled={running}>
          {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} />} Find leads now
        </button>
      </div>
    )
  }

  const lead = active?.sequence?.lead as OutreachLead | undefined
  const dirty = !!active && (subject !== (active.subject || '') || body !== (active.body || ''))
  const tier = lead ? leadTier(lead) : 'unchecked'
  const obs = lead ? leadObservation(lead) : ''

  const doSend = async () => {
    if (!active) return
    setBusy('send')
    try {
      if (dirty) await onSave(active, subject, body)
      const next = items[items.findIndex(i => i.id === active.id) + 1]
      await (exportOnly ? onCopy(active) : onSend(active))
      setActiveId(next?.id || null)
    } finally { setBusy(null) }
  }

  return (
    <div className="ah-desk">
      <ul className="ah-queue" aria-label="Emails waiting">
        {items.map(s => {
          const l = s.sequence?.lead as OutreachLead
          const t = l ? leadTier(l) : 'unchecked'
          return (
            <li key={s.id}>
              <button className={`ah-q ${active?.id === s.id ? 'ah-q--on' : ''}`} onClick={() => setActiveId(s.id)}>
                <span className="ah-q-top">
                  <span className="ah-q-name">{l?.name || 'Lead'}</span>
                  <span className={`ah-chip ah-chip--${t}`}>{l?.qualification_score ?? '–'}</span>
                </span>
                <span className="ah-q-sub">{STEP_NAME[s.step_number] || 'Email'} · {s.subject}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {active && lead && (
        <div className="ah-editor">
          <div className="ah-context">
            <div className="min-w-0">
              <p className="ah-context-name">
                {lead.name}
                <span className={`ah-chip ah-chip--${tier}`}>{TIER_LABEL[tier as Tier]} · {lead.qualification_score ?? '–'}</span>
              </p>
              {obs && <p className="ah-context-obs">Opens with: “{obs}”</p>}
            </div>
            <button className="ah-linkbtn" onClick={() => onOpenLead(lead)}>Lead file <ArrowUpRight size={13} /></button>
          </div>

          <label className="ah-field">
            <span>To</span>
            <p className="ah-to">{lead.email}{lead.enrichment_data?.email_source === 'guessed' ? <em> guessed address, check before sending</em> : null}</p>
          </label>
          <label className="ah-field">
            <span>Subject</span>
            <input className="cw-input" value={subject} onChange={e => setSubject(e.target.value)} />
          </label>
          <label className="ah-field ah-field--grow">
            <span>{STEP_NAME[active.step_number] || 'Email'}{active.metadata?.validator_issues?.length ? ' · flagged, read carefully' : ''}</span>
            <textarea className="cw-input ah-body" value={body} onChange={e => setBody(e.target.value)} rows={14} />
          </label>
          <p className="ah-sig">Your signature and a one-line “reply no thanks” note are added when it sends.</p>

          <div className="ah-actions">
            <button className="btn-ghost" disabled={!!busy} onClick={async () => { setBusy('skip'); try { await onSkip(active) } finally { setBusy(null) } }}>
              <SkipForward size={13} /> Skip lead
            </button>
            <span className="flex-1" />
            {dirty && (
              <button className="btn-ghost" disabled={!!busy} onClick={async () => { setBusy('save'); try { await onSave(active, subject, body) } finally { setBusy(null) } }}>
                Save edits
              </button>
            )}
            <button className="btn-primary" disabled={!!busy || !lead.email} onClick={doSend}>
              {busy === 'send' ? <Loader2 size={13} className="animate-spin" /> : exportOnly ? <Copy size={13} /> : <Send size={13} />}
              {exportOnly ? 'Copy email' : 'Send now'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ========================================
   LEADS BOARD
   ======================================== */

function LeadsBoard({ leads, drafted, sentIds, onOpen, onRescore, rescoring }: {
  leads: OutreachLead[]
  drafted: Set<string>
  sentIds: Set<string>
  onOpen: (l: OutreachLead) => void
  onRescore: () => void
  rescoring: boolean
}) {
  const [filter, setFilter] = useState<'all' | Tier>('all')
  const [q, setQ] = useState('')
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length, hot: 0, warm: 0, cold: 0, skip: 0, unchecked: 0 }
    for (const l of leads) c[leadTier(l)]++
    return c
  }, [leads])
  const rows = useMemo(() => {
    const rank: Record<Tier, number> = { hot: 0, warm: 1, cold: 2, unchecked: 3, skip: 4 }
    return leads
      .filter(l => filter === 'all' || leadTier(l) === filter)
      .filter(l => !q || `${l.name} ${l.industry || ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => rank[leadTier(a)] - rank[leadTier(b)] || (b.qualification_score ?? -1) - (a.qualification_score ?? -1))
  }, [leads, filter, q])

  return (
    <div>
      <div className="ah-toolbar">
        <div className="ah-filters" role="tablist">
          {(['all', 'hot', 'warm', 'cold', 'skip', 'unchecked'] as const).map(f => (counts[f] > 0 || f === 'all') && (
            <button key={f} role="tab" aria-selected={filter === f} className={`ah-filter ${filter === f ? 'ah-filter--on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : TIER_LABEL[f]} <span className="tabular-nums">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="ah-search">
            <Search size={13} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search leads" aria-label="Search leads" />
          </div>
          <button className="btn-ghost" onClick={onRescore} disabled={rescoring} title="Check every lead again with the current scoring">
            {rescoring ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Rescore all leads
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ah-empty"><p>No leads here yet.</p></div>
      ) : (
        <ul className="ah-leads">
          {rows.map(l => {
            const t = leadTier(l)
            const obs = leadObservation(l)
            const status = sentIds.has(l.id) ? 'Contacted' : drafted.has(l.id) ? 'Email ready' : !l.email ? 'No email' : t === 'hot' || t === 'warm' ? 'Queued to write' : ''
            return (
              <li key={l.id}>
                <button className="ah-lead" onClick={() => onOpen(l)}>
                  <span className={`ah-score ah-score--${t}`}><b className="tabular-nums">{l.qualification_score ?? '–'}</b><i>{TIER_LABEL[t]}</i></span>
                  <span className="ah-lead-main">
                    <span className="ah-lead-name">{l.name}</span>
                    <span className="ah-lead-obs">{obs || l.qualification_reason || 'Not checked yet'}</span>
                  </span>
                  <span className="ah-lead-ind">{l.industry || ''}</span>
                  <span className={`ah-lead-status ${status === 'Contacted' ? 'ah-lead-status--ok' : status === 'Email ready' ? 'ah-lead-status--hot' : ''}`}>{status}</span>
                  <ArrowUpRight size={14} className="ah-lead-go" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ========================================
   HOW IT WORKS
   ======================================== */

function HowItWorks({ agent }: { agent: LeadAgent }) {
  const c = agent.config || {}
  const autoFollow = c.auto_followups !== false
  return (
    <div className="ah-how">
      <ol className="ah-flow">
        <li><b>1. Find</b><p>Each weekday morning it searches Google Maps for {(c.search_terms || []).slice(0, 4).join(', ')}{(c.search_terms || []).length > 4 ? ' and more' : ''} around {(c.search_areas || ['Edmonton']).slice(0, 3).join(', ')}. Up to {c.daily_lead_quota || 25} new businesses a day, never the same one twice.</p></li>
        <li><b>2. Check</b><p>It opens every website on a phone, takes a screenshot, and judges whether the design looks dated, average or modern. It also checks security, phone setup, speed, booking and quote forms, old copyright years and template builders, and reads the Google rating and reviews.</p></li>
        <li><b>3. Score</b><p>Points out of 100, shown line by line in each lead file.</p>
          <div className="ah-rubric">
            <div><b>Need · 50</b><span>A visible problem: dated design, not secure, not built for phones, slow, a “Book now” button with no way to book, no website at all.</span></div>
            <div><b>Fit · 30</b><span>An independent local business with a real customer base: 15 to 400 Google reviews, strong rating, our core industries, inside our area. Chains and franchises are ruled out.</span></div>
            <div><b>Reach · 20</b><span>A real email on their site, the owner’s name, a phone number.</span></div>
          </div>
          <p>Hot is 70 and up, warm is 55 to 69. A lead can only be hot or warm if it has a real problem we can see, so a modern, well-run site stays cold even with great reviews.</p>
        </li>
        <li><b>4. Write</b><p>For hot and warm leads it writes three emails in your voice: polite, specific, grateful for their time, never pushy. It may only mention things it actually verified on their site, and every draft is checked against your rules (no dashes, no hype words, no made-up numbers) before you see it.</p></li>
        <li><b>5. You send</b><p>{isExportAgent(agent) ? 'Client agents never send. You copy each email and hand it to the client.' : `You read the first email in Ready to send and hit Send now. It goes from your Gmail with your signature. ${autoFollow ? 'The follow-up and final note then go out on their own three and five days later, unless they reply or say no thanks, which stops everything.' : 'Follow-ups come back to Ready to send for your approval.'}`}</p></li>
      </ol>
    </div>
  )
}

/* ========================================
   PAGE
   ======================================== */

export default function Agents() {
  const { leads, clients, refreshLeads } = useAppStore()
  const la = useLeadAgents()
  const [agentId, setAgentId] = useState<string>(() => { try { return localStorage.getItem('gth_lead_agent') || '' } catch { return '' } })
  const agent = la.agents.find(a => a.id === agentId) || la.agents[0] || null
  useEffect(() => { if (agent && agent.id !== agentId) setAgentId(agent.id) }, [agent, agentId])
  const pick = (id: string) => { setAgentId(id); try { localStorage.setItem('gth_lead_agent', id) } catch { /* private */ } }

  const ws = useAgentWorkspace(agent)
  const [tab, setTab] = useState<Tab>('ready')
  const [openLead, setOpenLead] = useState<OutreachLead | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rescoring, setRescoring] = useState(false)

  const mine = useMemo(() => (agent ? leads.filter(l => leadBelongsTo(l, agent)) : []), [leads, agent])
  const sentLeadIds = useMemo(() => new Set(ws.sent.map(s => s.sequence?.lead?.id).filter(Boolean)), [ws.sent])
  const draftedIds = useMemo(() => new Set([...ws.ready, ...ws.scheduled].map(s => s.sequence?.lead?.id).filter(Boolean)), [ws.ready, ws.scheduled])

  const funnel = useMemo(() => {
    const worth = mine.filter(l => ['hot', 'warm'].includes(leadTier(l))).length
    const replied = mine.filter(l => ['responded', 'interested'].includes(String(l.stage).toLowerCase())).length
    const meetings = mine.filter(l => /meeting/i.test(String(l.stage))).length
    return [
      { key: 'found', label: 'Found', value: mine.length, tab: 'leads' as Tab },
      { key: 'worth', label: 'Worth contacting', value: worth, tab: 'leads' as Tab },
      { key: 'ready', label: 'Ready to send', value: ws.ready.length, tab: 'ready' as Tab, hot: ws.ready.length > 0 },
      { key: 'sent', label: 'Contacted', value: sentLeadIds.size, tab: 'sent' as Tab },
      { key: 'replied', label: 'Replied', value: replied, tab: 'sent' as Tab },
      { key: 'meet', label: 'Meetings', value: meetings, tab: 'sent' as Tab },
    ]
  }, [mine, ws.ready.length, sentLeadIds])

  const run = async () => {
    if (!agent) return
    const ok = await la.run(agent)
    if (ok) await Promise.all([refreshLeads(), ws.reload()])
  }

  const rescore = async () => {
    if (!agent) return
    setRescoring(true)
    showToast('Rechecking every lead. This takes a few minutes.', 'info')
    try {
      let total = 0
      for (let i = 0; i < 6; i++) {
        const r = await callAgent({ mode: 'rescore', agentType: agent.agent_type, configId: agent.id })
        const res = r?.results?.rescore || {}
        total += res.rescored || 0
        if (!res.remaining) break
      }
      await refreshLeads()
      showToast(`Rechecked ${total} lead${total === 1 ? '' : 's'}`, 'success')
    } catch (err: any) {
      showToast(err?.message || 'Rescore failed', 'error')
    } finally { setRescoring(false) }
  }

  const busy = agent ? la.running.has(agent.id) : false
  const exportOnly = isExportAgent(agent)

  if (la.loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={22} className="animate-spin text-dim" /></div>
  }

  if (!agent) {
    return (
      <div className="ah-empty" style={{ marginTop: 80 }}>
        <p className="ah-empty-title">No lead agents yet</p>
        <p>Create one from Leads &amp; Outreach.</p>
      </div>
    )
  }

  return (
    <div className="ah max-w-[1240px] mx-auto pb-16">
      {/* Header */}
      <header className="ah-head">
        <div className="min-w-0">
          <p className="ah-eyebrow">AI Agents</p>
          <h1 className="ah-title">{agent.agent_name}<span> · {agentFor(agent)}</span></h1>
          <p className="ah-status">
            <span className={`ah-dot ${busy ? 'ah-dot--busy' : agent.enabled ? 'ah-dot--on' : ''}`} />
            {busy ? 'Working now' : agent.enabled ? 'Runs every weekday morning' : 'Paused, runs only when you click'}
            {agent.last_run_at ? ` · last run ${relativeDate(agent.last_run_at)}` : ''}
          </p>
        </div>
        <div className="ah-head-actions">
          {la.agents.length > 1 && (
            <div className="ah-switch" role="tablist" aria-label="Choose agent">
              {la.agents.map(a => (
                <button key={a.id} role="tab" aria-selected={a.id === agent.id} className={`ah-switch-btn ${a.id === agent.id ? 'ah-switch-btn--on' : ''}`} onClick={() => pick(a.id)}>
                  {a.agent_name}
                </button>
              ))}
            </div>
          )}
          <button className="btn-ghost" onClick={() => setSettingsOpen(true)}><Settings2 size={13} /> Settings</button>
          <button className="btn-primary" onClick={run} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} />} {busy ? 'Working' : 'Find leads now'}
          </button>
        </div>
      </header>

      {/* Funnel */}
      <div className="ah-funnel">
        {funnel.map((f, i) => (
          <button key={f.key} className={`ah-stage ${f.hot ? 'ah-stage--hot' : ''}`} onClick={() => setTab(f.tab)} style={{ animationDelay: `${i * 40}ms` }}>
            <span className="ah-stage-v tabular-nums">{f.value}</span>
            <span className="ah-stage-l">{f.label}</span>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabbar ah-tabs" role="tablist">
        {([
          ['ready', `Ready to send${ws.ready.length ? ` (${ws.ready.length})` : ''}`],
          ['leads', `Leads (${mine.length})`],
          ['sent', 'Sent'],
          ['how', 'How it works'],
          ['log', 'Run log'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tabbar-tab ${tab === k ? 'la-tab--on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'ready' && (
        <>
          <SendDesk
            items={ws.ready}
            exportOnly={exportOnly}
            onSend={ws.send}
            onCopy={ws.copy}
            onSave={ws.save}
            onSkip={ws.skip}
            onOpenLead={setOpenLead}
            onRun={run}
            running={busy}
          />
          {ws.scheduled.length > 0 && (
            <section className="ah-sched">
              <p className="ah-k">Going out on their own</p>
              <ul>
                {ws.scheduled.map(s => (
                  <li key={s.id}>
                    <button onClick={() => s.sequence?.lead && setOpenLead(s.sequence.lead)}>
                      <span>{s.sequence?.lead?.name}</span>
                      <span className="text-dim">{STEP_NAME[s.step_number]} · {s.scheduled_at ? relativeDate(s.scheduled_at) : 'soon'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === 'leads' && (
        <LeadsBoard leads={mine} drafted={draftedIds} sentIds={sentLeadIds} onOpen={setOpenLead} onRescore={rescore} rescoring={rescoring} />
      )}

      {tab === 'sent' && (
        ws.sent.length === 0 ? (
          <div className="ah-empty"><Mail size={22} /><p className="ah-empty-title">Nothing sent yet</p><p>Emails you send show up here with their status. Replies stop a sequence automatically.</p></div>
        ) : (
          <ul className="ah-leads">
            {ws.sent.map(s => (
              <li key={s.id}>
                <button className="ah-lead" onClick={() => s.sequence?.lead && setOpenLead(s.sequence.lead)}>
                  <span className={`ah-sent-ico ${s.sequence?.status === 'replied' ? 'ah-sent-ico--ok' : ''}`}>{s.sequence?.status === 'replied' ? <CheckCircle2 size={15} /> : <Send size={14} />}</span>
                  <span className="ah-lead-main">
                    <span className="ah-lead-name">{s.sequence?.lead?.name}</span>
                    <span className="ah-lead-obs">{STEP_NAME[s.step_number]} · {s.subject}</span>
                  </span>
                  <span className="ah-lead-ind">{s.executed_at ? relativeDate(s.executed_at) : ''}</span>
                  <span className={`ah-lead-status ${s.sequence?.status === 'replied' ? 'ah-lead-status--ok' : ''}`}>{s.sequence?.status === 'replied' ? 'Replied' : s.status === 'failed' ? 'Failed' : 'Sent'}</span>
                  <ArrowUpRight size={14} className="ah-lead-go" />
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'how' && <HowItWorks agent={agent} />}

      {tab === 'log' && (
        ws.runs.length === 0 ? <div className="ah-empty"><p>No runs yet.</p></div> : (
          <ul className="ah-log">
            {ws.runs.map(r => {
              const text = typeof r.summary === 'string' ? r.summary : r.summary?.text || ''
              const errs: string[] = r.summary?.generate_emails?.errors || []
              return (
                <li key={r.id}>
                  <span className={`ah-dot ${r.status === 'completed' ? 'ah-dot--on' : r.status === 'running' ? 'ah-dot--busy' : 'ah-dot--warn'}`} />
                  <div className="min-w-0 flex-1">
                    <p>{text || r.status}</p>
                    {errs.length > 0 && <p className="ah-log-err">{errs.length} draft{errs.length === 1 ? '' : 's'} failed: {errs[0].slice(0, 140)}</p>}
                  </div>
                  <span className="text-dim">{r.triggered_by === 'manual' ? 'You' : 'Daily'} · {relativeDate(r.started_at)}</span>
                </li>
              )
            })}
          </ul>
        )
      )}

      {openLead && (
        <LeadDossier
          lead={leads.find(l => l.id === openLead.id) || openLead}
          agent={agent}
          onClose={() => setOpenLead(null)}
          onChanged={() => { ws.reload(); refreshLeads() }}
        />
      )}

      <AgentSettingsModal
        open={settingsOpen}
        agent={agent}
        clients={clients}
        leadCount={mine.length}
        onClose={() => setSettingsOpen(false)}
        onSave={la.save}
        onDelete={la.remove}
        onPauseToggle={la.setEnabled}
      />
    </div>
  )
}
