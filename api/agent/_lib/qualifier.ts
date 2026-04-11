// Lead qualification engine using Claude AI
import { getAdminClient } from './supabase-admin'
import { askClaude, extractToolUse, LEAD_QUALIFIER_PROMPT, LEAD_QUALIFIER_TOOLS } from './claude'
import { isValidEmail, normalizeIndustryLabel, scrapeEmailFromWebsitePublic } from './scraper'
import { analyzeWebsite, type WebsiteIntel } from './website-analyzer'
import { buildLearnedPatterns } from './feedback-engine'

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

    // 2. Build prompt with feedback learning
    const attempted = leads.length
    const errors: string[] = []
    let systemPrompt = buildQualifierPrompt(agentConfig)

    // Inject learned patterns from user feedback
    try {
      const patterns = await buildLearnedPatterns(userId, agentConfig)
      if (patterns && patterns.sampleSize >= 2) {
        systemPrompt += `\n\nHISTORICAL FEEDBACK (${patterns.sampleSize} data points):\n`
        if (patterns.goodPatterns) systemPrompt += patterns.goodPatterns + '\n'
        if (patterns.badPatterns) systemPrompt += patterns.badPatterns + '\n'
        systemPrompt += 'Adjust your scoring to favor leads similar to GOOD fits and penalize leads similar to BAD fits.'
      }
    } catch { /* non-fatal */ }

    // 2b. Analyze websites in parallel BEFORE qualification so Claude has
    //     rich context about each business (services, decision makers, etc.)

    const websiteIntelMap = new Map<string, WebsiteIntel>()
    await Promise.all(
      leads.map(async (lead) => {
        if (!lead.website) return
        try {
          const intel = await analyzeWebsite(lead.website)
          websiteIntelMap.set(lead.id, intel)
        } catch { /* non-fatal */ }
      })
    )

    const results = await Promise.all(
      leads.map(async (lead) => {
        try {
          const intel = websiteIntelMap.get(lead.id)
          const leadInfoParts = [
            `Business Name: ${lead.name || 'Unknown'}`,
            `Industry/Type: ${lead.industry || 'Unknown'}`,
            `Location: ${lead.address || 'Unknown'}`,
            `Website: ${lead.website || 'None'}`,
            `Phone: ${lead.phone || 'None'}`,
            `Google Rating: ${lead.rating ?? 'N/A'}`,
            `Business Status: ${lead.business_status || 'Unknown'}`,
          ]

          // Inject website intelligence if available
          if (intel && intel.contentSnippet) {
            leadInfoParts.push(`\nWEBSITE ANALYSIS:`)
            leadInfoParts.push(`Website Quality: ${intel.websiteQuality}`)
            if (intel.summary) leadInfoParts.push(`Business Summary: ${intel.summary}`)
            if (intel.services.length > 0) leadInfoParts.push(`Services Found: ${intel.services.join(', ')}`)
            if (intel.decisionMakers.length > 0) {
              leadInfoParts.push(`Decision Makers: ${intel.decisionMakers.map(d => `${d.name} (${d.title})`).join(', ')}`)
            }
            if (intel.techSignals.length > 0) leadInfoParts.push(`Tech Stack: ${intel.techSignals.join(', ')}`)
            if (intel.socialLinks.length > 0) leadInfoParts.push(`Social Presence: ${intel.socialLinks.length} profiles`)
            leadInfoParts.push(`Has Blog: ${intel.hasBlog ? 'Yes' : 'No'}`)
            leadInfoParts.push(`Has Contact Form: ${intel.hasContactForm ? 'Yes' : 'No'}`)
            if (intel.copyrightYear) leadInfoParts.push(`Established: ~${intel.copyrightYear}`)
            leadInfoParts.push(`\nWebsite Content Excerpt:\n${intel.contentSnippet.slice(0, 800)}`)
          }

          const leadInfo = leadInfoParts.join('\n')

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
          // Store website intel + qualification data in enrichment_data
          const websiteData = intel ? {
            website_quality: intel.websiteQuality,
            website_summary: intel.summary || null,
            services_found: intel.services,
            decision_makers: intel.decisionMakers,
            tech_signals: intel.techSignals,
            social_links: intel.socialLinks,
            has_blog: intel.hasBlog,
            has_contact_form: intel.hasContactForm,
            copyright_year: intel.copyrightYear,
            website_analyzed_at: new Date().toISOString(),
          } : {}

          const mergedEnrichment = {
            ...existingEnrichment,
            ...websiteData,
            qualification_signals: signals,
            recommended_action: recommendedAction,
            qualified_at: new Date().toISOString(),
            agent_run_id: agentRunId,
          }

          // Extract primary decision maker for the lead record
          const primaryDM = intel?.decisionMakers?.[0]

          const updatePayload: Record<string, any> = {
            qualification_score: score,
            qualification_reason: reason,
            enrichment_data: mergedEnrichment,
          }
          // Store decision maker name directly on the lead for easy display
          if (primaryDM?.name) {
            updatePayload.contact_name = primaryDM.name
          }

          const { error: updateErr } = await sb
            .from('outreach_leads')
            .update(updatePayload)
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
