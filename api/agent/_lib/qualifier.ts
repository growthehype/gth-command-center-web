// Lead qualification engine using Claude AI
import { getAdminClient } from './supabase-admin'
import { askClaude, extractToolUse, LEAD_QUALIFIER_PROMPT, LEAD_QUALIFIER_TOOLS } from './claude'
import { isValidEmail, normalizeIndustryLabel, scrapeEmailFromWebsitePublic } from './scraper'

// ─── Types ──────────────────────────────────────────────────────

interface QualifyParams {
  userId: string
  agentRunId: string
  agentType: string
  batchSize?: number
  agentConfig?: any
}

interface QualifyResult {
  qualified: number
  avgScore: number
  attempted: number
  errors?: string[]
  firstError?: string
}

// ─── Main Export ────────────────────────────────────────────────

// Build a context-aware system prompt from the agent config so the AI
// actually knows what the CLIENT sells, who the ideal customer is, and
// what to skip.
function buildQualifierPrompt(cfg?: any): string {
  const c = cfg?.config || {}
  const parts: string[] = []

  parts.push('You are a lead qualification specialist.')

  if (c.client_business) {
    parts.push(`\nYou are qualifying leads for this client's business: ${c.client_business}`)
  }

  if (c.ideal_customer_profile) {
    parts.push(`\nIDEAL CUSTOMER PROFILE:\n${c.ideal_customer_profile}`)
    parts.push('Score leads HIGHER (75-100) when they closely match this profile.')
  }

  if (c.qualifying_signals) {
    parts.push(`\nQUALIFYING SIGNALS (score higher when present):\n${c.qualifying_signals}`)
  }

  if (c.disqualifying_signals) {
    parts.push(`\nDISQUALIFYING SIGNALS (score 0-25 or recommend skip):\n${c.disqualifying_signals}`)
  }

  if (c.target_industries) {
    parts.push(`\nTARGET INDUSTRIES: ${c.target_industries}`)
    parts.push('Leads in these industries should score higher. Leads in unrelated industries should score lower unless they clearly fit the ideal customer profile.')
  }

  parts.push('\nScore leads 0-100. Be specific and decisive in your reasoning. A score of 80+ means "reach out immediately". Under 30 means "skip".')

  return parts.join('\n')
}

export async function qualifyLeads(params: QualifyParams): Promise<QualifyResult> {
  const { userId, agentRunId, agentType, batchSize = 10, agentConfig } = params
  const sb = getAdminClient()

  try {
    // 0. CLEANUP PASS — fix garbage emails + raw industry strings AND re-scrape
    //    websites for any lead with no email but a valid website. All in
    //    parallel so it's cheap (~5s for 50 leads).
    try {
      const { data: allLeads } = await sb
        .from('outreach_leads')
        .select('id, email, website, industry')
        .eq('user_id', userId)

      if (allLeads && allLeads.length > 0) {
        // Stage 1: pure string-level fixes (industry normalize + bad-email nullify)
        const stringFixes: { id: string; patch: Record<string, any>; website?: string | null; needsEnrichment?: boolean }[] = []
        for (const l of allLeads) {
          const patch: Record<string, any> = {}
          let needsEnrichment = false
          if (l.email && !isValidEmail(l.email)) {
            patch.email = null
            needsEnrichment = !!l.website
          }
          if (!l.email && l.website) {
            needsEnrichment = true
          }
          if (l.industry) {
            const cleaned = normalizeIndustryLabel(l.industry)
            if (cleaned && cleaned !== l.industry) patch.industry = cleaned
          }
          if (Object.keys(patch).length > 0 || needsEnrichment) {
            stringFixes.push({ id: l.id, patch, website: l.website, needsEnrichment })
          }
        }

        // Stage 2: parallel website scraping for the leads that need an email
        const enrichmentTargets = stringFixes.filter(f => f.needsEnrichment && f.website)
        if (enrichmentTargets.length > 0) {
          await Promise.all(
            enrichmentTargets.map(async (target) => {
              try {
                const found = await scrapeEmailFromWebsitePublic(target.website!)
                if (found) target.patch.email = found
              } catch {
                // ignore — patch.email already null
              }
            })
          )
          console.log(`Qualifier re-enrichment: scraped ${enrichmentTargets.length} websites`)
        }

        // Stage 3: write all patches in parallel
        const dirty = stringFixes.filter(f => Object.keys(f.patch).length > 0)
        if (dirty.length > 0) {
          for (let i = 0; i < dirty.length; i += 10) {
            const slice = dirty.slice(i, i + 10)
            await Promise.all(
              slice.map(d =>
                sb.from('outreach_leads').update(d.patch).eq('id', d.id)
              )
            )
          }
          console.log(`Qualifier cleanup: fixed ${dirty.length} leads`)
        }
      }
    } catch (cleanupErr: any) {
      console.error('Qualifier cleanup pass failed (non-fatal):', cleanupErr?.message)
    }

    // 1. Fetch unqualified leads for this user
    const { data: leads, error: fetchErr } = await sb
      .from('outreach_leads')
      .select('*')
      .eq('user_id', userId)
      .is('qualification_score', null)
      .order('created_at', { ascending: false })
      .limit(batchSize)

    if (fetchErr) throw fetchErr

    if (!leads || leads.length === 0) {
      return { qualified: 0, avgScore: 0, attempted: 0 }
    }

    // 2. Qualify ALL leads via Claude in PARALLEL
    const attempted = leads.length
    const errors: string[] = []
    const systemPrompt = buildQualifierPrompt(agentConfig)

    const results = await Promise.all(
      leads.map(async (lead) => {
        try {
          const leadInfo = [
            `Business Name: ${lead.name || 'Unknown'}`,
            `Industry/Type: ${lead.industry || 'Unknown'}`,
            `Location: ${lead.address || 'Unknown'}`,
            `Website: ${lead.website || 'None'}`,
            `Phone: ${lead.phone || 'None'}`,
            `Google Rating: ${lead.rating ?? 'N/A'}`,
            `Business Status: ${lead.business_status || 'Unknown'}`,
          ].join('\n')

          const response = await askClaude({
            systemPrompt,
            messages: [{
              role: 'user',
              content: `Please qualify this lead and use the score_lead tool to provide your assessment:\n\n${leadInfo}`,
            }],
            tools: LEAD_QUALIFIER_TOOLS,
          })

          const toolResult = extractToolUse(response)
          let score = 50
          let reason = 'Unable to parse qualification response'
          let recommendedAction = 'add_to_nurture'
          let signals: string[] = []

          if (toolResult && toolResult.name === 'score_lead') {
            score = typeof toolResult.input.score === 'number' ? toolResult.input.score : 50
            reason = toolResult.input.reasoning || reason
            recommendedAction = toolResult.input.recommended_action || recommendedAction
            signals = toolResult.input.signals || []
          }

          score = Math.max(0, Math.min(100, score))

          const existingEnrichment = (lead.enrichment_data && typeof lead.enrichment_data === 'object')
            ? lead.enrichment_data
            : {}
          const mergedEnrichment = {
            ...existingEnrichment,
            qualification_signals: signals,
            recommended_action: recommendedAction,
            qualified_at: new Date().toISOString(),
            agent_run_id: agentRunId,
          }

          const { error: updateErr } = await sb
            .from('outreach_leads')
            .update({
              qualification_score: score,
              qualification_reason: reason,
              enrichment_data: mergedEnrichment,
            })
            .eq('id', lead.id)

          if (updateErr) {
            const msg = updateErr.message || JSON.stringify(updateErr)
            errors.push(`update ${lead.name}: ${msg.slice(0, 200)}`)
            return { ok: false, score: 0 }
          }

          return { ok: true, score }
        } catch (leadErr: any) {
          const msg = leadErr?.message || String(leadErr)
          errors.push(`${lead.name}: ${msg.slice(0, 200)}`)
          return { ok: false, score: 0 }
        }
      })
    )

    const qualifiedCount = results.filter(r => r.ok).length
    const totalScore = results.reduce((sum, r) => sum + (r.ok ? r.score : 0), 0)
    const avgScore = qualifiedCount > 0 ? Math.round(totalScore / qualifiedCount) : 0

    return {
      qualified: qualifiedCount,
      avgScore,
      attempted,
      ...(errors.length > 0 && {
        firstError: errors[0],
        errors: errors.slice(0, 3), // first 3 only, to keep response small
      }),
    }
  } catch (error) {
    console.error('qualifyLeads failed:', error)
    throw error
  }
}
