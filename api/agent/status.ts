// GET — check agent configs and recent runs for a user
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminClient } from './_lib/supabase-admin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const userId = req.query.userId as string | undefined

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId query parameter' })
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
