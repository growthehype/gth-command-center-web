import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { settings as settingsApi } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'

export interface PersonalLog {
  id: string
  day: string        // yyyy-MM-dd, local
  metric: string     // water_ml | smoke | stretch | sleep_h | habit:<id>
  value: number
  meta?: Record<string, any> | null
  created_at: string
}

export interface PersonalHabit { id: string; label: string }

export interface PersonalConfig {
  water_goal_ml: number
  stretch_min: number
  sleep_goal_h: number
  habits: PersonalHabit[]
}

export const DEFAULT_CONFIG: PersonalConfig = {
  water_goal_ml: 2000,
  stretch_min: 15,
  sleep_goal_h: 7,
  habits: [
    { id: 'move', label: 'Move for 30 minutes' },
    { id: 'read', label: 'Read 10 pages' },
    { id: 'plan', label: 'Plan tomorrow' },
  ],
}

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function daysBack(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)
    out.push(dayKey(x))
  }
  return out
}

const DEMO_KEY = 'gth_personal_demo'
function demoLoad(): PersonalLog[] {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]') } catch { return [] }
}
function demoSave(rows: PersonalLog[]) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(rows)) } catch { /* private mode */ }
}

/** Daily summary for one day */
export interface DaySummary {
  day: string
  water: number
  smokes: number
  lastSmokeAt: string | null
  stretch: number
  sleep: number | null
  habits: Record<string, boolean>
}

export function summarise(logs: PersonalLog[], day: string): DaySummary {
  const rows = logs.filter(l => l.day === day).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const habits: Record<string, boolean> = {}
  let sleep: number | null = null
  let lastSmokeAt: string | null = null
  let water = 0, smokes = 0, stretch = 0
  for (const r of rows) {
    if (r.metric === 'water_ml') water += Number(r.value)
    else if (r.metric === 'smoke') { smokes += Number(r.value); lastSmokeAt = r.created_at }
    else if (r.metric === 'stretch') stretch += Number(r.value)
    else if (r.metric === 'sleep_h') sleep = Number(r.value)
    else if (r.metric.startsWith('habit:')) habits[r.metric.slice(6)] = Number(r.value) > 0
  }
  return { day, water: Math.max(0, water), smokes: Math.max(0, smokes), lastSmokeAt, stretch, sleep, habits }
}

/** 0..100: how much of today's personal standard was met */
export function disciplineScore(s: DaySummary, prev: DaySummary | null, cfg: PersonalConfig): number {
  const parts: number[] = []
  parts.push(Math.min(1, s.water / cfg.water_goal_ml))
  parts.push(Math.min(1, s.stretch / cfg.stretch_min))
  for (const h of cfg.habits) parts.push(s.habits[h.id] ? 1 : 0)
  if (s.sleep != null) parts.push(Math.min(1, s.sleep / cfg.sleep_goal_h))
  // Smoking: zero is full marks; fewer than yesterday is partial
  const base = prev ? prev.smokes : null
  parts.push(s.smokes === 0 ? 1 : base != null && s.smokes < base ? 0.5 : 0)
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100)
}

export function usePersonal() {
  const demo = useAppStore(s => s.demoMode)
  const [logs, setLogs] = useState<PersonalLog[]>([])
  const [cfg, setCfg] = useState<PersonalConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [today, setToday] = useState(dayKey())

  // Roll over at midnight
  useEffect(() => {
    const t = setInterval(() => { const k = dayKey(); setToday(prev => (prev === k ? prev : k)) }, 30_000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    const since = daysBack(42)[0]
    if (demo) { setLogs(demoLoad().filter(l => l.day >= since)); setLoading(false); return }
    const [{ data }, raw] = await Promise.all([
      supabase.from('personal_logs').select('id, day, metric, value, meta, created_at').gte('day', since).order('created_at', { ascending: true }).limit(5000),
      settingsApi.get('personal_config').catch(() => null),
    ])
    setLogs((data || []) as PersonalLog[])
    if (raw) { try { setCfg({ ...DEFAULT_CONFIG, ...JSON.parse(raw) }) } catch { /* keep defaults */ } }
    setLoading(false)
  }, [demo])

  useEffect(() => { load() }, [load])

  const add = useCallback(async (metric: string, value: number, meta?: Record<string, any>) => {
    const row: PersonalLog = { id: `tmp-${Date.now()}-${Math.random()}`, day: dayKey(), metric, value, meta: meta || null, created_at: new Date().toISOString() }
    setLogs(prev => [...prev, row])
    if (demo) { demoSave([...demoLoad(), row]); return }
    const { data, error } = await supabase.from('personal_logs').insert({ day: row.day, metric, value, meta: meta || null }).select('id, created_at').single()
    if (error) {
      setLogs(prev => prev.filter(r => r.id !== row.id))
      showToast('Could not save that. Check your connection.', 'error')
      return
    }
    setLogs(prev => prev.map(r => (r.id === row.id ? { ...r, id: data.id, created_at: data.created_at } : r)))
  }, [demo])

  /** Undo the latest entry today for a metric */
  const undo = useCallback(async (metric: string) => {
    const k = dayKey()
    const last = [...logs].reverse().find(l => l.day === k && l.metric === metric)
    if (!last) return
    setLogs(prev => prev.filter(r => r.id !== last.id))
    if (demo) { demoSave(demoLoad().filter(r => r.id !== last.id)); return }
    if (!last.id.startsWith('tmp-')) await supabase.from('personal_logs').delete().eq('id', last.id)
  }, [logs, demo])

  const saveConfig = useCallback(async (next: PersonalConfig) => {
    setCfg(next)
    if (!demo) await settingsApi.set('personal_config', JSON.stringify(next)).catch(() => showToast('Could not save settings', 'error'))
  }, [demo])

  const days = useMemo(() => daysBack(28), [today])
  const byDay = useMemo(() => Object.fromEntries(days.map(d => [d, summarise(logs, d)])), [logs, days])
  const todaySum = byDay[today] || summarise(logs, today)
  const yesterday = byDay[days[days.length - 2]] || null

  return { loading, cfg, saveConfig, logs, add, undo, today, todaySum, yesterday, days, byDay, reload: load }
}
