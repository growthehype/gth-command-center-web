import { useEffect, useMemo, useRef, useState } from 'react'
import { Droplets, Plus, Undo2, Settings2, Play, Pause, RotateCcw, Check, CalendarClock, Moon, Minus, X } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { isGoogleConnected, fetchGoogleEvents } from '@/lib/google-calendar'
import Modal from '@/components/ui/Modal'
import { usePersonal, disciplineScore, dayKey, type PersonalConfig } from '@/hooks/usePersonal'

/* ========================================
   SMALL PIECES
   ======================================== */

function fmtL(ml: number) {
  const l = ml / 1000
  return l % 1 === 0 ? `${l}` : l.toFixed(2).replace(/0$/, '')
}

function since(iso: string | null, now: number): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  if (h >= 24) { const d = Math.floor(h / 24); return `${d} day${d === 1 ? '' : 's'} ${h % 24}h` }
  return h ? `${h}h ${m}m` : `${m}m`
}

function MiniBars({ values, max, goal, lowerIsBetter = false, labels }: { values: number[]; max: number; goal?: number; lowerIsBetter?: boolean; labels: string[] }) {
  const top = Math.max(max, ...values, 1)
  return (
    <div className="pc-bars" aria-hidden="true">
      {values.map((v, i) => {
        const hit = goal != null ? (lowerIsBetter ? v <= goal : v >= goal) : false
        return (
          <div key={i} className="pc-bar">
            <i className={`${hit ? 'is-hit' : ''} ${i === values.length - 1 ? 'is-today' : ''}`} style={{ height: `${Math.max(4, (v / top) * 100)}%` }} />
            <span>{labels[i]}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Glass carafe with a moving water line */
function Carafe({ level }: { level: number }) {
  const pct = Math.max(0, Math.min(1, level))
  const y = 196 - pct * 168 // top of water inside the body
  return (
    <svg viewBox="0 0 140 210" className="pc-carafe" role="img" aria-label={`${Math.round(pct * 100)} percent of today's water`}>
      <defs>
        <clipPath id="pc-carafe-clip">
          <path d="M48 14h44v26c0 8 6 14 14 22 12 12 18 26 18 44v78c0 12-10 20-22 20H38c-12 0-22-8-22-20v-78c0-18 6-32 18-44 8-8 14-14 14-22z" />
        </clipPath>
        <linearGradient id="pc-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#E9F2FF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#8FB4E8" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="pc-glass" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <g clipPath="url(#pc-carafe-clip)">
        <rect x="0" y="0" width="140" height="210" fill="url(#pc-glass)" />
        <g className="pc-water" style={{ transform: `translateY(${y}px)` }}>
          <path className="pc-wave pc-wave--back" d="M-140 8 Q-105 -2 -70 8 T0 8 T70 8 T140 8 T210 8 T280 8 V260 H-140 Z" fill="#9CC0F0" opacity="0.45" />
          <path className="pc-wave pc-wave--front" d="M-140 8 Q-105 18 -70 8 T0 8 T70 8 T140 8 T210 8 T280 8 V260 H-140 Z" fill="url(#pc-water)" />
        </g>
        {[0, 1, 2].map(i => <circle key={i} className="pc-bubble" style={{ animationDelay: `${i * 1.3}s` }} cx={52 + i * 18} cy="190" r={1.6 + i * 0.4} fill="#fff" opacity="0.6" />)}
      </g>
      <path d="M48 14h44v26c0 8 6 14 14 22 12 12 18 26 18 44v78c0 12-10 20-22 20H38c-12 0-22-8-22-20v-78c0-18 6-32 18-44 8-8 14-14 14-22z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
      <rect x="44" y="6" width="52" height="10" rx="3" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1="104" x2="114" y1={196 - t * 168} y2={196 - t * 168} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      ))}
      <path d="M30 96c0-14 4-24 12-32" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** A cigarette whose ember cools the longer you go without one */
function Cigarette({ minutesSince }: { minutesSince: number | null }) {
  const heat = minutesSince == null ? 0 : Math.max(0, 1 - minutesSince / 240)
  const smoking = minutesSince != null && minutesSince < 20
  return (
    <svg viewBox="0 0 220 80" className="pc-cig" role="img" aria-label={heat > 0 ? 'Ember still warm' : 'Ember out'}>
      {smoking && [0, 1, 2].map(i => (
        <path key={i} className="pc-smoke" style={{ animationDelay: `${i * 1.1}s` }} d="M186 40 C176 30 196 22 184 10 C176 2 190 -6 182 -14" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
      ))}
      <rect x="20" y="40" width="58" height="14" rx="2" fill="#C9A27A" />
      <rect x="20" y="40" width="58" height="14" rx="2" fill="url(#pc-cork)" opacity="0.5" />
      <rect x="78" y="40" width="104" height="14" fill="#F2F0EB" />
      <rect x="182" y="40" width="10" height="14" rx="1" fill="#6B6B6B" />
      <rect x="182" y="40" width="10" height="14" rx="1" fill="#FF6A2B" style={{ opacity: heat }} className={heat > 0 ? 'pc-ember' : ''} />
      <defs>
        <pattern id="pc-cork" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.8" fill="#7A5232" />
          <circle cx="5" cy="4.5" r="0.6" fill="#7A5232" />
        </pattern>
      </defs>
      {heat === 0 && <line x1="12" y1="66" x2="208" y2="28" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" opacity="0.85" />}
    </svg>
  )
}

function Ring({ value, size = 92, stroke = 7, children, tone = 'polar' }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; tone?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={`pc-ring pc-ring--${tone}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="pc-ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="pc-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} />
      </svg>
      <div className="pc-ring-in">{children}</div>
    </div>
  )
}

/* ========================================
   SETTINGS
   ======================================== */

function PersonalSettings({ open, cfg, onClose, onSave }: { open: boolean; cfg: PersonalConfig; onClose: () => void; onSave: (c: PersonalConfig) => void }) {
  const [f, setF] = useState(cfg)
  const [newHabit, setNewHabit] = useState('')
  useEffect(() => { if (open) setF(cfg) }, [open, cfg])
  return (
    <Modal open={open} onClose={onClose} title="Personal standard" width="520px">
      <div className="la-form">
        <div className="la-row la-row--3">
          <label><span>Water per day (L)</span>
            <input className="cw-input" type="number" step="0.25" min={0.5} value={f.water_goal_ml / 1000} onChange={e => setF({ ...f, water_goal_ml: Math.round(Number(e.target.value) * 1000) || 2000 })} />
          </label>
          <label><span>Stretch (min)</span>
            <input className="cw-input" type="number" min={1} value={f.stretch_min} onChange={e => setF({ ...f, stretch_min: Number(e.target.value) || 15 })} />
          </label>
          <label><span>Sleep goal (h)</span>
            <input className="cw-input" type="number" step="0.5" min={4} value={f.sleep_goal_h} onChange={e => setF({ ...f, sleep_goal_h: Number(e.target.value) || 7 })} />
          </label>
        </div>
        <label><span>Daily habits</span></label>
        <ul className="pc-edit-habits">
          {f.habits.map(h => (
            <li key={h.id}>
              <input className="cw-input" value={h.label} onChange={e => setF({ ...f, habits: f.habits.map(x => x.id === h.id ? { ...x, label: e.target.value } : x) })} />
              <button className="la-icon" aria-label={`Remove ${h.label}`} onClick={() => setF({ ...f, habits: f.habits.filter(x => x.id !== h.id) })}><X size={14} /></button>
            </li>
          ))}
          <li>
            <input className="cw-input" value={newHabit} placeholder="Add a habit, e.g. No phone first hour" onChange={e => setNewHabit(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newHabit.trim()) { setF({ ...f, habits: [...f.habits, { id: `h${Date.now()}`, label: newHabit.trim() }] }); setNewHabit('') } }} />
            <button className="la-icon" aria-label="Add habit" onClick={() => { if (newHabit.trim()) { setF({ ...f, habits: [...f.habits, { id: `h${Date.now()}`, label: newHabit.trim() }] }); setNewHabit('') } }}><Plus size={14} /></button>
          </li>
        </ul>
        <div className="la-actions">
          <span className="flex-1" />
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { onSave(f); onClose() }}>Save</button>
        </div>
      </div>
    </Modal>
  )
}

/* ========================================
   TODAY OUTSIDE WORK
   ======================================== */

const PERSONAL_RE = /hockey|game|practice|gym|workout|training|yoga|run\b|golf|soccer|basketball|swim|dentist|doctor|physio|massage|haircut|barber|family|birthday|dinner|date night|vet|church|mosque|prayer/i

function useTodayEvents() {
  const events = useAppStore(s => s.events)
  const [google, setGoogle] = useState<{ title: string; startTime: string; allDay: boolean }[]>([])
  useEffect(() => {
    if (!isGoogleConnected()) return
    const d = new Date()
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
    fetchGoogleEvents(start, end).then(list => setGoogle(list.map(e => ({ title: e.title, startTime: e.startTime, allDay: e.allDay })))).catch(() => {})
  }, [])
  return useMemo(() => {
    const k = dayKey()
    const local = (events || []).filter((e: any) => e.date === k).map((e: any) => ({ title: e.title, startTime: e.start_time, allDay: !e.start_time }))
    const seen = new Set<string>()
    return [...google, ...local]
      .filter(e => { const key = `${e.title}|${e.startTime}`; if (seen.has(key)) return false; seen.add(key); return true })
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
      .map(e => ({ ...e, personal: PERSONAL_RE.test(e.title) }))
  }, [events, google])
}

function timeLabel(t: string) {
  const [h, m] = (t || '').split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const ap = h >= 12 ? 'p.m.' : 'a.m.'
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${ap}`
}

/* ========================================
   MAIN
   ======================================== */

export default function PersonalCommand() {
  const p = usePersonal()
  const { cfg, todaySum: t, yesterday: y } = p
  const [now, setNow] = useState(Date.now())
  const [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id) }, [])

  // Stretch timer
  const total = cfg.stretch_min * 60
  const [left, setLeft] = useState(total)
  const [running, setRunning] = useState(false)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => { if (!running) setLeft(total) }, [total]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!running) { if (tick.current) clearInterval(tick.current); return }
    tick.current = setInterval(() => setLeft(l => {
      if (l <= 1) { setRunning(false); p.add('stretch', cfg.stretch_min); return total }
      return l - 1
    }), 1000)
    return () => { if (tick.current) clearInterval(tick.current) }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  const lastSmoke = useMemo(() => {
    const all = p.logs.filter(l => l.metric === 'smoke').map(l => l.created_at).sort()
    return all.length ? all[all.length - 1] : null
  }, [p.logs])
  const minsSinceSmoke = lastSmoke ? Math.floor((now - new Date(lastSmoke).getTime()) / 60000) : null

  const week = p.days.slice(-7)
  const dayLetters = week.map(d => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${d}T12:00:00`).getDay()])
  const score = disciplineScore(t, y, cfg)
  const scores = p.days.map((d, i) => disciplineScore(p.byDay[d], i ? p.byDay[p.days[i - 1]] : null, cfg))
  const activeDays = p.days.filter(d => { const s = p.byDay[d]; return s.water || s.stretch || s.smokes || Object.keys(s.habits).length })
  let streak = 0
  for (let i = scores.length - 1; i >= 0; i--) { if (scores[i] >= 80) streak++; else if (i !== scores.length - 1) break }
  const waterHits = week.filter(d => p.byDay[d].water >= cfg.water_goal_ml).length
  const smokeFreeDays = p.days.filter(d => activeDays.includes(d) && p.byDay[d].smokes === 0).length

  const avgOf = (ds: string[]) => { const a = ds.filter(d => activeDays.includes(d)); return a.length ? a.reduce((n, d) => n + p.byDay[d].smokes, 0) / a.length : 0 }
  const thisWeek = p.days.slice(-7), lastWeek = p.days.slice(-14, -7)
  const avg = (ds: string[]) => { const v = avgOf(ds); return v % 1 === 0 ? String(v) : v.toFixed(1) }
  const events = useTodayEvents()
  const personalToday = events.filter(e => e.personal)
  const stretchDone = t.stretch >= cfg.stretch_min
  const waterPct = t.water / cfg.water_goal_ml
  const smokeDelta = y ? t.smokes - y.smokes : null

  if (p.loading) return null

  return (
    <section className="pc rv" style={{ ['--i' as string]: 3 }} aria-labelledby="pc-title">
      <div className="pc-head">
        <div>
          <p className="pc-eyebrow">Personal standard</p>
          <h3 id="pc-title" className="pc-title">You</h3>
        </div>
        <div className="pc-score">
          <Ring value={score / 100} size={74} stroke={6} tone={score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'polar'}>
            <b className="tabular-nums">{score}</b>
          </Ring>
          <div>
            <p className="pc-score-label">Discipline today</p>
            <p className="pc-score-sub">{streak > 1 ? `${streak} days in a row at 80% or more` : 'Hit 80% to start a streak'}</p>
          </div>
          <button className="la-icon" onClick={() => setSettingsOpen(true)} aria-label="Personal settings"><Settings2 size={14} /></button>
        </div>
      </div>

      {personalToday.length > 0 && (
        <div className="pc-today">
          <CalendarClock size={16} />
          <p>
            {personalToday.map((e, i) => (
              <span key={i}>
                {i > 0 && (i === personalToday.length - 1 ? ' and ' : ', ')}
                You have <strong>{e.title}</strong>{e.allDay ? ' today' : ` at ${timeLabel(e.startTime)}`}
              </span>
            ))}
            .
          </p>
        </div>
      )}

      <div className="pc-grid">
        {/* Water */}
        <article className="pc-card pc-card--water">
          <span className="edge-spot" aria-hidden="true" />
          <div className="pc-card-head">
            <p className="pc-k"><Droplets size={13} /> Water</p>
            {t.water > 0 && <button className="pc-undo" onClick={() => p.undo('water_ml')} aria-label="Undo last water"><Undo2 size={13} /></button>}
          </div>
          <div className="pc-water-body">
            <Carafe level={waterPct} />
            <div className="pc-water-info">
              <p className="pc-big tabular-nums">{fmtL(t.water)}<em> / {fmtL(cfg.water_goal_ml)} L</em></p>
              <p className="pc-sub">{waterPct >= 1 ? 'Goal hit. Nicely done.' : `${fmtL(Math.max(0, cfg.water_goal_ml - t.water))} L to go`}</p>
              <div className="pc-btns">
                <button className="pc-btn" onClick={() => p.add('water_ml', 250)}><Plus size={12} /> 250 ml</button>
                <button className="pc-btn" onClick={() => p.add('water_ml', 500)}><Plus size={12} /> 500 ml</button>
              </div>
            </div>
          </div>
          <MiniBars values={week.map(d => p.byDay[d].water)} max={cfg.water_goal_ml} goal={cfg.water_goal_ml} labels={dayLetters} />
          <p className="pc-foot">Goal hit {waterHits} of the last 7 days</p>
        </article>

        {/* Smoking */}
        <article className="pc-card pc-card--smoke">
          <span className="edge-spot" aria-hidden="true" />
          <div className="pc-card-head">
            <p className="pc-k">Quitting smoking</p>
            {t.smokes > 0 && <button className="pc-undo" onClick={() => p.undo('smoke')} aria-label="Undo last cigarette"><Undo2 size={13} /></button>}
          </div>
          <Cigarette minutesSince={minsSinceSmoke} />
          <div className="pc-smoke-row">
            <div>
              <p className="pc-big tabular-nums">{t.smokes}<em> today</em></p>
              <p className={`pc-sub ${smokeDelta != null && smokeDelta < 0 ? 'pc-good' : smokeDelta != null && smokeDelta > 0 ? 'pc-warn' : ''}`}>
                {y == null ? 'First day tracking' :
                  smokeDelta! < 0 ? `${-smokeDelta!} fewer than yesterday (${y.smokes})` :
                  smokeDelta! > 0 ? `${smokeDelta} more than yesterday (${y.smokes})` :
                  `Same as yesterday (${y.smokes})`}
              </p>
            </div>
            <div className="pc-free">
              <p className="pc-free-v tabular-nums">{lastSmoke ? since(lastSmoke, now) : '–'}</p>
              <p className="pc-free-l">smoke-free</p>
            </div>
          </div>
          <div className="pc-btns">
            <button className="pc-btn pc-btn--quiet" onClick={() => p.add('smoke', 1)}><Plus size={12} /> Log one</button>
          </div>
          <MiniBars values={week.map(d => p.byDay[d].smokes)} max={Math.max(5, ...week.map(d => p.byDay[d].smokes))} goal={0} lowerIsBetter labels={dayLetters} />
          <p className="pc-foot">{smokeFreeDays} smoke-free day{smokeFreeDays === 1 ? '' : 's'} in the last 4 weeks</p>
        </article>

        {/* Stretch */}
        <article className={`pc-card pc-card--stretch ${stretchDone ? 'is-done' : ''}`}>
          <span className="edge-spot" aria-hidden="true" />
          <div className="pc-card-head">
            <p className="pc-k">Stretch</p>
            {t.stretch > 0 && <button className="pc-undo" onClick={() => p.undo('stretch')} aria-label="Undo stretch"><Undo2 size={13} /></button>}
          </div>
          <div className="pc-stretch">
            <Ring value={stretchDone ? 1 : running ? 1 - left / total : 0} size={132} stroke={8} tone={stretchDone ? 'ok' : 'polar'}>
              {stretchDone ? <Check size={30} /> : <b className="tabular-nums">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</b>}
            </Ring>
            <p className="pc-sub">{stretchDone ? `${t.stretch} minutes done today` : `${cfg.stretch_min} minutes, every day`}</p>
            {!stretchDone && (
              <div className="pc-btns">
                <button className="pc-btn" onClick={() => setRunning(r => !r)}>{running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> {left < total ? 'Resume' : 'Start'}</>}</button>
                {left < total && !running && <button className="pc-btn pc-btn--quiet" onClick={() => setLeft(total)} aria-label="Reset timer"><RotateCcw size={12} /></button>}
                <button className="pc-btn pc-btn--quiet" onClick={() => p.add('stretch', cfg.stretch_min)}><Check size={12} /> Did it</button>
              </div>
            )}
          </div>
        </article>

        {/* Habits */}
        <article className="pc-card pc-card--habits">
          <span className="edge-spot" aria-hidden="true" />
          <div className="pc-card-head"><p className="pc-k">Daily habits</p></div>
          <ul className="pc-habits">
            {cfg.habits.map(h => {
              const done = !!t.habits[h.id]
              return (
                <li key={h.id}>
                  <button className={`pc-habit ${done ? 'is-done' : ''}`} onClick={() => p.add(`habit:${h.id}`, done ? 0 : 1)} aria-pressed={done}>
                    <span className="pc-check" aria-hidden="true"><Check size={13} /></span>
                    <span>{h.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="pc-sleep">
            <Moon size={14} />
            <span>Slept</span>
            <button className="pc-step" onClick={() => p.add('sleep_h', Math.max(0, (t.sleep ?? cfg.sleep_goal_h) - 0.5))} aria-label="Less sleep"><Minus size={12} /></button>
            <b className="tabular-nums">{t.sleep ?? '–'}</b><em>h</em>
            <button className="pc-step" onClick={() => p.add('sleep_h', (t.sleep ?? cfg.sleep_goal_h - 0.5) + 0.5)} aria-label="More sleep"><Plus size={12} /></button>
            <span className="pc-sub" style={{ marginLeft: 'auto' }}>goal {cfg.sleep_goal_h}h</span>
          </div>
        </article>

        {/* 28-day consistency */}
        <article className="pc-card pc-card--wide">
          <div className="pc-card-head">
            <p className="pc-k">Last 4 weeks</p>
            <p className="pc-sub">Each square is a day. Brighter means you kept more of your standard.</p>
          </div>
          <div className="pc-heat">
            {p.days.map((d, i) => {
              const active = activeDays.includes(d)
              const s = scores[i]
              return <span key={d} title={`${d}: ${active ? `${s}%` : 'nothing logged'}`} className={`${d === p.today ? 'is-today' : ''}`} style={{ opacity: active ? 0.18 + (s / 100) * 0.82 : 0.08 }} />
            })}
          </div>
          <dl className="pc-stats">
            <div><dt>Water goal days</dt><dd className="tabular-nums">{p.days.filter(d => p.byDay[d].water >= cfg.water_goal_ml).length}<em>/28</em></dd></div>
            <div><dt>Stretch days</dt><dd className="tabular-nums">{p.days.filter(d => p.byDay[d].stretch >= cfg.stretch_min).length}<em>/28</em></dd></div>
            <div><dt>Smokes a day</dt><dd className="tabular-nums">{avg(thisWeek)}<em> vs {avg(lastWeek)} last week</em></dd></div>
          </dl>
        </article>
      </div>

      <PersonalSettings open={settingsOpen} cfg={cfg} onClose={() => setSettingsOpen(false)} onSave={p.saveConfig} />
    </section>
  )
}
