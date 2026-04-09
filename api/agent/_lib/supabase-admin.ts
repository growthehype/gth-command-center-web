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
  const { data, error } = await sb
    .from('agent_configs')
    .select('*')
    .eq('user_id', userId)
    .eq('agent_type', agentType)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data || null
}

// ─── Agent Runs ─────────────────────────────────────────────────

export interface CreateRunParams {
  user_id: string
  agent_type: string
  status?: string
  trigger?: string
  metadata?: Record<string, any>
}

export async function createAgentRun(params: CreateRunParams): Promise<string> {
  const sb = getAdminClient()
  const { data, error } = await sb
    .from('agent_runs')
    .insert({
      user_id: params.user_id,
      agent_type: params.agent_type,
      status: params.status || 'running',
      trigger: params.trigger || 'scheduled',
      started_at: new Date().toISOString(),
      metadata: params.metadata || {},
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function updateAgentRun(
  runId: string,
  updates: { status?: string; summary?: string; completed_at?: string; metadata?: Record<string, any> }
) {
  const sb = getAdminClient()
  const { error } = await sb
    .from('agent_runs')
    .update({
      ...updates,
      completed_at: updates.completed_at || (updates.status === 'completed' || updates.status === 'failed' ? new Date().toISOString() : undefined),
    })
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
