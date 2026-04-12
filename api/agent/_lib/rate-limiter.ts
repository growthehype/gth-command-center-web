// Supabase-backed rate limiter for agent actions
// Memory cache is used only for fast-path rejection, Supabase is source of truth
import { getAdminClient } from './supabase-admin'

// In-memory cache for fast-path rejection only
const memoryCounters = new Map<string, { count: number; date: string }>()

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

function memKey(userId: string, action: string): string {
  return `${userId}:${action}`
}

// ─── Rate Limit Check ───────────────────────────────────────────

interface RateLimitResult {
  allowed: boolean
  remaining: number
  used: number
  limit: number
}

export async function checkRateLimit(
  userId: string,
  action: string,
  maxPerDay: number,
): Promise<RateLimitResult> {
  const today = todayKey()
  const key = memKey(userId, action)

  // Fast-path rejection from memory (avoids DB call if already over limit)
  const mem = memoryCounters.get(key)
  if (mem && mem.date === today && mem.count >= maxPerDay) {
    return { allowed: false, remaining: 0, used: mem.count, limit: maxPerDay }
  }

  // Always check Supabase for the real count (handles cold starts)
  const count = await getTodayCount(userId, action, today)

  // Sync memory cache with DB truth
  memoryCounters.set(key, { count, date: today })

  const remaining = Math.max(0, maxPerDay - count)
  return {
    allowed: count < maxPerDay,
    remaining,
    used: count,
    limit: maxPerDay,
  }
}

// ─── Increment Counter ──────────────────────────────────────────

export async function incrementCounter(userId: string, action: string): Promise<void> {
  const today = todayKey()
  const key = memKey(userId, action)
  const sb = getAdminClient()

  // Read current count from DB first
  const currentCount = await getTodayCount(userId, action, today)
  const newCount = currentCount + 1

  // Upsert with the incremented count
  const { error } = await sb.from('agent_rate_limits').upsert(
    {
      user_id: userId,
      action,
      date: today,
      count: newCount,
    },
    { onConflict: 'user_id,action,date' },
  )

  if (error) {
    console.error('Rate limiter increment failed:', error.message)
  }

  // Update memory cache to match
  memoryCounters.set(key, { count: newCount, date: today })
}

// ─── Internal ───────────────────────────────────────────────────

async function getTodayCount(userId: string, action: string, today: string): Promise<number> {
  const sb = getAdminClient()

  const { data, error } = await sb
    .from('agent_rate_limits')
    .select('count')
    .eq('user_id', userId)
    .eq('action', action)
    .eq('date', today)
    .single()

  if (!error && data) return data.count || 0

  // Fallback: count from agent_runs table
  const { count, error: countErr } = await sb
    .from('agent_runs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('started_at', `${today}T00:00:00Z`)
    .lte('started_at', `${today}T23:59:59Z`)

  if (!countErr && count !== null) return count
  return 0
}

// ─── Default Limits ─────────────────────────────────────────────

export const DEFAULT_LIMITS: Record<string, number> = {
  email_send: 50,
  scrape: 100,
  claude_call: 200,
}
