// Manual trigger — POST to run an agent on demand
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAgentConfig, createAgentRun, updateAgentRun } from './_lib/supabase-admin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { agentType, userId } = req.body ?? {}

  if (!agentType || !userId) {
    return res.status(400).json({ error: 'Missing agentType or userId' })
  }

  const validTypes = ['lead_gen', 'sales']
  if (!validTypes.includes(agentType)) {
    return res.status(400).json({ error: `Invalid agentType. Must be one of: ${validTypes.join(', ')}` })
  }

  try {
    // 1. Read agent config for this user + type
    const cfg = await getAgentConfig(userId, agentType)
    if (!cfg) {
      return res.status(404).json({ error: 'Agent config not found for this user/type' })
    }

    // 2. Create an agent_runs record
    const runId = await createAgentRun({
      user_id: userId,
      agent_type: agentType,
      status: 'running',
      trigger: 'manual',
      metadata: { config_id: cfg.id },
    })

    // 3. Phase 1: placeholder — actual execution added in Phase 2
    const summary = `[Phase 1] Manual run completed for agent "${agentType}" (user ${userId})`
    console.log(summary)

    await updateAgentRun(runId, { status: 'completed', summary })

    return res.status(200).json({
      runId,
      status: 'completed',
      message: summary,
    })
  } catch (err: any) {
    console.error('Agent run error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
