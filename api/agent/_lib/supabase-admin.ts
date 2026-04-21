// Server-side Supabase admin client — bypasses RLS for agent operations
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (_admin) return _admin

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('SUPABASE_URL or VITE_SUPABASE_URL not configured')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')

  _admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return _admin
}

// ─── Agent Config ───────────────────────────────────────────────

export async function getAgentConfig(userId: string, agentType: string) {
  const sb = getAdminClient()
  // For client agents there can be many rows; just pick the first.
  // Callers that need a specific client agent should use getAgentConfigById.
  const { data, error } = await sb
    .from('agent_configs')
    .select('*')
    .eq('user_id', userId)
    .eq('agent_type', agentType)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data || null
}

export async function getAgentConfigById(configId: string) {
  const sb = getAdminClient()
  const { data, error } = await sb
    .from('agent_configs')
    .select('*')
    .eq('id', configId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

// ─── Agent Runs ─────────────────────────────────────────────────

export interface CreateRunParams {
  user_id: string
  agent_type: string
  agent_config_id?: string | null
  status?: string
  trigger?: string
  metadata?: Record<string, any>
}

// Map any incoming "trigger" value to one allowed by the DB CHECK constraint.
function normaliseTriggeredBy(t?: string): string {
  if (!t) return 'cron'
  const v = t.toLowerCase()
  if (v === 'scheduled' || v === 'cron') return 'cron'
  if (v === 'manual' || v === 'user' || v === 'on_demand') return 'manual'
  if (v === 'webhook') return 'webhook'
  return 'cron'
}

export async function createAgentRun(params: CreateRunParams): Promise<string> {
  const sb = getAdminClient()
  const { data, error } = await sb
    .from('agent_runs')
    .insert({
      user_id: params.user_id,
      agent_type: params.agent_type,
      agent_config_id: params.agent_config_id || null,
      status: params.status || 'running',
      triggered_by: normaliseTriggeredBy(params.trigger),
      started_at: new Date().toISOString(),
      // agent_runs has a JSONB `summary` column, NOT `metadata`.
      // Pack everything into summary so we don't lose context.
      summary: params.metadata ? { ...params.metadata } : {},
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function updateAgentRun(
  runId: string,
  updates: {
    status?: string
    summary?: string | Record<string, any>
    completed_at?: string
    metadata?: Record<string, any>
    error?: string
  }
) {
  const sb = getAdminClient()

  const patch: Record<string, any> = {}

  if (updates.status) patch.status = updates.status

  // Merge summary + metadata into one JSONB blob
  let summaryBlob: Record<string, any> | undefined
  if (typeof updates.summary === 'string') {
    summaryBlob = { text: updates.summary }
  } else if (updates.summary && typeof updates.summary === 'object') {
    summaryBlob = { ...updates.summary }
  }
  if (updates.metadata) {
    summaryBlob = { ...(summaryBlob || {}), ...updates.metadata }
  }
  if (summaryBlob) patch.summary = summaryBlob

  if (updates.error) patch.error_log = updates.error

  // Auto-stamp completed_at on terminal states
  const isTerminal =
    updates.status === 'completed' ||
    updates.status === 'failed' ||
    updates.status === 'success' ||
    updates.status === 'error'
  if (updates.completed_at) {
    patch.completed_at = updates.completed_at
  } else if (isTerminal) {
    patch.completed_at = new Date().toISOString()
  }

  const { error } = await sb
    .from('agent_runs')
    .update(patch)
    .eq('id', runId)

  if (error) throw error
}

// ─── Gmail Refresh Token ────────────────────────────────────────

export async function getGmailRefreshToken(userId: string): Promise<string | null> {
  const sb = getAdminClient()

  // Try integrations table first (provider = 'gmail')
  const { data, error } = await sb
    .from('integrations')
    .select('refresh_token, credentials')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .single()

  if (!error && data) {
    if (data.refresh_token) return data.refresh_token
    // Some schemas store inside a credentials JSONB column
    if (data.credentials?.refresh_token) return data.credentials.refresh_token
  }

  // Fallback: check for a gmail_refresh_token column on profiles/users
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('gmail_refresh_token')
    .eq('id', userId)
    .single()

  if (!pErr && profile?.gmail_refresh_token) return profile.gmail_refresh_token

  return null
}

// ─── Integrations (upsert) ─────────────────────────────────────

export interface UpsertIntegrationParams {
  user_id: string
  provider: string
  refresh_token: string
  email?: string
  metadata?: Record<string, any>
}

export async function upsertIntegration(params: UpsertIntegrationParams): Promise<void> {
  const sb = getAdminClient()
  // NOTE: integrations table has `credentials` JSONB, not `metadata`.
  // Writing `metadata` would fail with "column does not exist" and silently
  // drop the refresh token — causing users to keep getting logged out.
  const row: Record<string, any> = {
    user_id: params.user_id,
    provider: params.provider,
    refresh_token: params.refresh_token,
    email: params.email || null,
    updated_at: new Date().toISOString(),
  }
  if (params.metadata && Object.keys(params.metadata).length > 0) {
    row.credentials = params.metadata
  }

  const { error } = await sb
    .from('integrations')
    .upsert(row, { onConflict: 'user_id,provider' })

  if (error) throw error
}
