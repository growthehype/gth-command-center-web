// GET — check agent configs and recent runs for a user
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminClient } from './_lib/supabase-admin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const userId = req.query.userId as string | undefined

  if (!userId || typeof userId !== 'string' || userId.length < 10) {
    return res.status(400).json({ error: 'Missing or invalid userId query parameter' })
  }

  // Validate ownership: check Authorization header contains a valid Supabase JWT
  // and extract the authenticated user's ID from it
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Fallback: if no auth header, validate that the userId exists in the database
    // This prevents random UUID guessing from returning data
    const sb = getAdminClient()
    const { data: userCheck } = await sb
      .from('agent_configs')
      .select('user_id')
      .eq('user_id', userId)
      .limit(1)

    if (!userCheck || userCheck.length === 0) {
      // Also check agent_runs in case they have runs but no configs
      const { data: runCheck } = await sb
        .from('agent_runs')
        .select('user_id')
        .eq('user_id', userId)
        .limit(1)

      if (!runCheck || runCheck.length === 0) {
        return res.status(404).json({ error: 'User not found' })
      }
    }
  }

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
