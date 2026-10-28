import { useMemo, useState } from 'react'
import { Play, Loader2, SlidersHorizontal, Power } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { AgentConfig, TodayStats } from '@/hooks/useAgentDashboard'

interface ProspectorPanelProps {
  config: AgentConfig
  today: TodayStats
  lastSummary: string | null
  isRunning: boolean
  onRun: () => void
  onToggle: (enabled: boolean) => void
  onSave: (config: Record<string, any>) => void
}

const DEFAULT_TERMS_COUNT = 30
const DEFAULT_AREAS_COUNT = 7

function nextSearches(cfg: Record<string, any>, n: number): string[] {
  const terms: string[] = Array.isArray(cfg.search_terms) ? cfg.search_terms : []
  const areas: string[] = Array.isArray(cfg.search_areas) ? cfg.search_areas : []
  if (!terms.length || !areas.length) return []
  const total = terms.length * areas.length
  const start = Number(cfg.rotation_index) || 0
  const out: string[] = []
  for (let k = 0; k < n; k++) {
    const i = (start + k) % total
    out.push(`${terms[i % terms.length]}, ${areas[Math.floor(i / terms.length) % areas.length].replace(', AB', '')}`)
  }
  return out
}

function Stat({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className="px-5 py-4 min-w-0" style={{ borderLeft: '1px solid var(--color-border)' }}>
      <div className="text-dim" style={{ fontSize: 11, fontWeight: 500 }}>{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span
          className="font-display tabular-nums"
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            color: tone === 'warn' ? 'var(--color-warn)' : tone === 'ok' ? 'var(--color-ok)' : 'var(--color-polar)',
          }}
        >
          {value}
        </span>
        {sub && <span className="text-dim tabular-nums" style={{ fontSize: 11.5 }}>{sub}</span>}
      </div>
    </div>
  )
}

export default function ProspectorPanel({ config, today, lastSummary, isRunning, onRun, onToggle, onSave }: ProspectorPanelProps) {
  const cfg = config.config || {}
  const [showSettings, setShowSettings] = useState(false)
  const [draft, setDraft] = useState(() => ({
    search_terms: (cfg.search_terms || []).join('\n'),
    search_areas: (cfg.search_areas || []).join('\n'),
    queries_per_run: cfg.queries_per_run ?? 5,
    daily_lead_quota: cfg.daily_lead_quota ?? 25,
    daily_email_limit: cfg.daily_email_limit ?? 15,
    drafts_per_run: cfg.drafts_per_run ?? 8,
    min_score: cfg.min_score ?? 60,
  }))

  const status = isRunning ? 'running' : config.enabled ? 'live' : 'paused'
  const upcoming = useMemo(() => nextSearches(cfg, 5), [cfg])
  const terms = Array.isArray(cfg.search_terms) ? cfg.search_terms.length : DEFAULT_TERMS_COUNT
  const areas = Array.isArray(cfg.search_areas) ? cfg.search_areas.length : DEFAULT_AREAS_COUNT

  const save = () => {
    const toList = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
    const clamp = (v: any, lo: number, hi: number, d: number) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d
    }
    onSave({
      ...cfg,
      search_terms: toList(draft.search_terms),
      search_areas: toList(draft.search_areas),
      queries_per_run: clamp(draft.queries_per_run, 1, 10, 5),
      daily_lead_quota: clamp(draft.daily_lead_quota, 5, 100, 25),
      daily_email_limit: clamp(draft.daily_email_limit, 1, 40, 15),
      drafts_per_run: clamp(draft.drafts_per_run, 1, 12, 8),
      min_score: clamp(draft.min_score, 30, 95, 60),
    })
    setShowSettings(false)
  }

  return (
    <section className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }} aria-label="GTH Prospector">
      {config.enabled && <span className="beam" aria-hidden="true" style={{ animationDuration: '9s' }} />}
      <span className="edge-spot" aria-hidden="true" />

      <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6 px-6 pt-6 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="brf-light" data-tone={status === 'running' ? 'warn' : status === 'live' ? 'ok' : 'off'} aria-hidden="true" />
            <span className="label-md" style={{ color: status === 'paused' ? 'var(--color-dim)' : 'var(--color-polar)' }}>
              {status === 'running' ? 'Working now' : status === 'live' ? 'Live · runs weekday mornings' : 'Paused'}
            </span>
          </div>
          <h2 className="font-display" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            {config.agent_name || 'GTH Prospector'}
          </h2>
          <p className="text-steel mt-2" style={{ fontSize: 13.5, lineHeight: 1.55, maxWidth: 620 }}>
            Finds Edmonton-area clinics, professional firms and trades whose website or workflow is holding them back,
            checks their site, scores the fit and writes you a short email in your voice. Nothing sends until you approve it.
          </p>
          <p className="text-dim mt-3 tabular-nums" style={{ fontSize: 12 }}>
            {config.last_run_at
              ? `Last run ${formatDistanceToNow(new Date(config.last_run_at), { addSuffix: true })}${lastSummary ? ` · ${lastSummary}` : ''}`
              : 'Not run yet'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onToggle(!config.enabled)}
            className="btn-ghost"
            title={config.enabled ? 'Pause the daily runs' : 'Turn on daily runs'}
            aria-pressed={config.enabled}
          >
            <Power size={13} />
            {config.enabled ? 'Pause' : 'Turn on'}
          </button>
          <button onClick={() => setShowSettings((v) => !v)} className="btn-ghost" aria-expanded={showSettings}>
            <SlidersHorizontal size={13} />
            Targets
          </button>
          <button onClick={onRun} disabled={isRunning} className="btn-primary" style={{ paddingTop: 9, paddingBottom: 9 }}>
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {isRunning ? 'Hunting... up to 4 min' : 'Run now'}
          </button>
        </div>
      </div>

      <div className="relative grid grid-cols-2 md:grid-cols-5" style={{ borderTop: '1px solid var(--color-border)' }}>
        <Stat label="Found today" value={today.leadsToday} sub={`/ ${cfg.daily_lead_quota ?? 25}`} />
        <Stat label="Scored today" value={today.scoredToday} />
        <Stat label="Waiting for you" value={today.awaitingReview} tone={today.awaitingReview > 0 ? 'warn' : undefined} />
        <Stat label="Sent today" value={today.sentToday} sub={`/ ${cfg.daily_email_limit ?? 15}`} />
        <Stat label="Replies this week" value={today.repliesWeek} sub={today.interestedWeek ? `${today.interestedWeek} interested` : undefined} tone={today.interestedWeek ? 'ok' : undefined} />
      </div>

      {upcoming.length > 0 && !showSettings && (
        <div className="relative flex flex-wrap items-center gap-2 px-6 py-3.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="text-dim" style={{ fontSize: 11.5, marginRight: 4 }}>Next searches</span>
          {upcoming.map((u) => (
            <span key={u} className="badge badge-neutral" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>{u}</span>
          ))}
          <span className="text-dim" style={{ fontSize: 11.5 }}>· {terms} searches across {areas} areas, {today.totalLeads} leads so far</span>
        </div>
      )}

      {showSettings && (
        <div className="relative px-6 py-5 grid grid-cols-1 lg:grid-cols-[1fr_1fr_260px] gap-5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <label className="block">
            <span className="label-md text-dim">Searches (one per line)</span>
            <textarea
              value={draft.search_terms}
              onChange={(e) => setDraft({ ...draft, search_terms: e.target.value })}
              rows={9}
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-polar"
              style={{ fontSize: 12.5, lineHeight: 1.5 }}
            />
          </label>
          <label className="block">
            <span className="label-md text-dim">Areas (one per line)</span>
            <textarea
              value={draft.search_areas}
              onChange={(e) => setDraft({ ...draft, search_areas: e.target.value })}
              rows={9}
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-polar"
              style={{ fontSize: 12.5, lineHeight: 1.5 }}
            />
          </label>
          <div className="space-y-3">
            {([
              ['queries_per_run', 'Searches per run'],
              ['daily_lead_quota', 'New leads per day'],
              ['daily_email_limit', 'Emails sent per day'],
              ['drafts_per_run', 'Drafts per run'],
              ['min_score', 'Minimum fit score'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3">
                <span className="text-steel" style={{ fontSize: 12.5 }}>{label}</span>
                <input
                  type="number"
                  value={(draft as any)[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-polar text-right tabular-nums"
                  style={{ fontSize: 12.5 }}
                />
              </label>
            ))}
            <div className="flex gap-2 pt-2">
              <button className="btn-primary" onClick={save}>Save</button>
              <button className="btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
