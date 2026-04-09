// Simple in-memory + Supabase-backed rate limiter for agent actions
import { getAdminClient } from './supabase-admin'

// In-memory counters (reset on cold start — Supabase is the source of truth)
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

  // Check memory first (fast path)
  const mem = memoryCounters.get(key)
  if (mem && mem.date === today && mem.count >= maxPerDay) {
    return { allowed: false, remaining: 0, used: mem.count, limit: maxPerDay }
  }

  // Query Supabase for today's actual count
  const count = await getTodayCount(userId, action, today)

  // Update memory cache
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

  // Upsert into agent_rate_limits table
  const { error } = await sb.from('agent_rate_limits').upsert(
    {
      user_id: userId,
      action,
      date: today,
      count: 1,
    },
    { onConflict: 'user_id,action,date' },
  )

  // If upsert doesn't support increment, do a manual increment
  if (error) {
    // Fallback: read then update
    const current = await getTodayCount(userId, action, today)
    await sb.from('agent_rate_limits').upsert({
      user_id: userId,
      action,
      date: today,
      count: current + 1,
    }, { onConflict: 'user_id,action,date' })
  } else {
    // Increment via RPC or manual read-update
    const current = await getTodayCount(userId, action, today)
    if (current > 0) {
      await sb
        .from('agent_rate_limits')
        .update({ count: current + 1 })
        .eq('user_id', userId)
        .eq('action', action)
        .eq('date', today)
    }
  }

  // Update memory
  const mem = memoryCounters.get(key)
  if (mem && mem.date === today) {
    mem.count += 1
  } else {
    memoryCounters.set(key, { count: 1, date: today })
  }
}

// ─── Internal ───────────────────────────────────────────────────

async function getTodayCount(userId: string, action: string, today: string): Promise<number> {
  const sb = getAdminClient()

  // Try agent_rate_limits table first
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
