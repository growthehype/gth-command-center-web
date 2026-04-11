// Feedback learning engine — aggregates user feedback (thumbs up/down, stage
// changes) into patterns the qualifier uses as few-shot context.

import { getAdminClient } from './supabase-admin'

interface LearnedPatterns {
  goodPatterns: string
  badPatterns: string
  sampleSize: number
}

export async function buildLearnedPatterns(
  userId: string,
  _agentConfig?: any,
): Promise<LearnedPatterns | null> {
  const sb = getAdminClient()

  try {
    // Fetch leads with explicit feedback or stage signals
    const { data: feedbackLeads } = await sb
      .from('outreach_leads')
      .select('name, industry, rating, enrichment_data, stage, qualification_score')
      .eq('user_id', userId)
      .not('enrichment_data', 'is', null)

    if (!feedbackLeads || feedbackLeads.length === 0) return null

    const good: string[] = []
    const bad: string[] = []

    for (const lead of feedbackLeads) {
      const enrichment = lead.enrichment_data as Record<string, any> | null
      if (!enrichment) continue

      const feedback = enrichment.user_feedback
      const isPositiveStage = lead.stage === 'meeting-set' || lead.stage === 'closed-won' || lead.stage === 'proposal-sent'
      const isNegativeStage = lead.stage === 'closed-lost'

      const desc = [
        lead.industry || 'unknown industry',
        lead.rating ? `${lead.rating} stars` : '',
        enrichment.website_quality ? `${enrichment.website_quality} website` : '',
        enrichment.services_found?.length ? `services: ${enrichment.services_found.slice(0, 3).join(', ')}` : '',
      ].filter(Boolean).join(', ')

      if (feedback === 'good' || isPositiveStage) {
        good.push(`${lead.name} (${desc})`)
      } else if (feedback === 'bad' || isNegativeStage) {
        bad.push(`${lead.name} (${desc})`)
      }
    }

    if (good.length === 0 && bad.length === 0) return null

    return {
      goodPatterns: good.length > 0
        ? `Leads the user marked as GOOD fits:\n${good.slice(0, 10).map(g => `- ${g}`).join('\n')}`
        : '',
      badPatterns: bad.length > 0
        ? `Leads the user marked as BAD fits:\n${bad.slice(0, 10).map(b => `- ${b}`).join('\n')}`
        : '',
      sampleSize: good.length + bad.length,
    }
  } catch (err) {
    console.warn('Feedback engine failed (non-fatal):', err)
    return null
  }
}
