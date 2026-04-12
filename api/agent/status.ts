// GET — check agent configs and recent runs for a user
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from './_lib/supabase-admin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Require JWT auth — extract userId from token
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const token = authHeader.slice(7)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const userId = user.id
  const sb = getAdminClient()

  try {
    // 1. Get agent configs for this user
    const { data: configs, error: cfgErr } = await sb
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)

    if (cfgErr) throw cfgErr

    // 2. Get latest 10 agent runs for this user
    const { data: runs, error: runErr } = await sb
      .from('agent_runs')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(10)

    if (runErr) throw runErr

    return res.status(200).json({
      configs: configs ?? [],
      recentRuns: runs ?? [],
    })
  } catch (err: any) {
    console.error('Agent status error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
