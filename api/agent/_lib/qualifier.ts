// Lead qualification engine using Claude AI
import { getAdminClient } from './supabase-admin'
import { askClaude, extractToolUse, LEAD_QUALIFIER_PROMPT, LEAD_QUALIFIER_TOOLS } from './claude'
import { isValidEmail, normalizeIndustryLabel, scrapeEmailDetailed, fetchReviewCount, scrapeRotation } from './scraper'
import { analyzeWebsite, type WebsiteIntel } from './website-analyzer'
import { captureSite, auditVisually, type VisualAudit } from './visual-audit'
import { buildLearnedPatterns } from './feedback-engine'
import {
  isGthAgent, GTH_QUALIFIER_PROMPT, GTH_QUALIFIER_TOOLS, GTH_SEARCH_AREAS,
  scoreGthLead, finaliseGthScore, type GthScore, type QualTier,
} from './gth-profile'

// ─── Types ──────────────────────────────────────────────────────

interface QualifyParams {
  userId: string
  agentRunId: string
  agentType: string
  batchSize?: number
  agentConfig?: any
  /** Stop starting new leads after this many ms (GTH v2 path) */
  deadlineMs?: number
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
  if (isGthAgent(cfg)) return GTH_QUALIFIER_PROMPT
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
      let cleanupQuery = sb
        .from('outreach_leads')
        .select('id, email, website, industry')
        .eq('user_id', userId)
      if (agentConfig?.id) cleanupQuery = cleanupQuery.eq('agent_config_id', agentConfig.id)
      const { data: allLeads } = await cleanupQuery

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
                const found = await scrapeEmailDetailed(target.website!)
                if (found.email) {
                  target.patch.email = found.email
                  target.patch.__email_source = found.source
                }
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
              slice.map(async d => {
                const { __email_source, ...patch } = d.patch
                if (__email_source) {
                  const { data: cur } = await sb.from('outreach_leads').select('enrichment_data').eq('id', d.id).single()
                  patch.enrichment_data = { ...(cur?.enrichment_data || {}), email_source: __email_source }
                }
                return sb.from('outreach_leads').update(patch).eq('id', d.id)
              })
            )
          }
          console.log(`Qualifier cleanup: fixed ${dirty.length} leads`)
        }
      }
    } catch (cleanupErr: any) {
      console.error('Qualifier cleanup pass failed (non-fatal):', cleanupErr?.message)
    }

    // GTH agents use the v2 points-based review
    if (isGthAgent(agentConfig)) {
      return await qualifyGthBatch({ userId, agentRunId, agentConfig, batchSize, deadlineMs: params.deadlineMs ?? 100_000 })
    }

    // 1. Fetch unqualified leads for this user
    let leadQuery = sb
      .from('outreach_leads')
      .select('*')
      .eq('user_id', userId)
      .is('qualification_score', null)
    if (agentConfig?.id) leadQuery = leadQuery.eq('agent_config_id', agentConfig.id)
    const { data: leads, error: fetchErr } = await leadQuery
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
            // No founding year: the copyright year is not a reliable source for it
            leadInfoParts.push(`\nWebsite Content Excerpt:\n${intel.contentSnippet.slice(0, 800)}`)
          }
          if (intel?.audit) {
            const a = intel.audit
            leadInfoParts.push(`\nWEBSITE CHECK (measured by us just now):`)
            leadInfoParts.push(`Loads: ${a.reachable ? 'yes' : 'no'}; HTTPS: ${a.https ? 'yes' : 'no'}; Set up for phones: ${a.mobileReady ? 'yes' : 'no'}`)
            if (a.loadMs) leadInfoParts.push(`Homepage response time: ${a.loadMs} ms`)
            if (a.builder) leadInfoParts.push(`Built with: ${a.builder}`)
            leadInfoParts.push(`Online booking: ${a.hasOnlineBooking ? (a.bookingTool || 'yes') : 'none found'}; Quote form: ${a.hasQuoteForm ? 'yes' : 'no'}; Chat: ${a.chatWidget ? 'yes' : 'no'}`)
            if (a.issues.length) leadInfoParts.push(`Gaps found: ${a.issues.join('; ')}`)
          } else if (!lead.website) {
            leadInfoParts.push(`\nWEBSITE CHECK: this business has no website listed on Google.`)
          }

          const leadInfo = leadInfoParts.join('\n')

          const gth = isGthAgent(agentConfig)
          const response = await askClaude({
            systemPrompt,
            messages: [{
              role: 'user',
              content: `Please qualify this lead and use the score_lead tool to provide your assessment:\n\n${leadInfo}`,
            }],
            tools: gth ? GTH_QUALIFIER_TOOLS : LEAD_QUALIFIER_TOOLS,
            tier: 'fast',
            maxTokens: 600,
          })

          const toolResult = extractToolUse(response)
          let score = 50
          let reason = 'Unable to parse qualification response'
          let recommendedAction = 'add_to_nurture'
          let signals: string[] = []
          let observation = ''
          let pitchAngle: string | null = null

          if (toolResult && toolResult.name === 'score_lead') {
            score = typeof toolResult.input.score === 'number' ? toolResult.input.score : 50
            reason = toolResult.input.reasoning || reason
            recommendedAction = toolResult.input.recommended_action || recommendedAction
            signals = toolResult.input.signals || []
            observation = (toolResult.input.observation || '').trim()
            pitchAngle = toolResult.input.pitch_angle || null
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
            website_audit: intel.audit || null,
            website_analyzed_at: new Date().toISOString(),
          } : {}

          const mergedEnrichment = {
            ...existingEnrichment,
            ...websiteData,
            qualification_signals: signals,
            observation,
            pitch_angle: pitchAngle,
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


// ════════════════════════════════════════════════════════════════
//  GTH v2: measured checks + points + one Claude review per lead
// ════════════════════════════════════════════════════════════════

const PER_LEAD_WORST_MS = 60_000

let bucketReady: Promise<void> | null = null
function ensureScreenshotBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      try {
        const sb = getAdminClient()
        const { data } = await sb.storage.getBucket('lead-screenshots')
        if (!data) await sb.storage.createBucket('lead-screenshots', { public: true })
      } catch { /* ignore: upload will just fail quietly */ }
    })()
  }
  return bucketReady
}

async function uploadScreenshot(leadId: string, dataUri: string): Promise<string | null> {
  const m = dataUri.match(/^data:(image\/[a-z]+);base64,(.+)$/)
  if (!m) return null
  try {
    await ensureScreenshotBucket()
    const sb = getAdminClient()
    const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg'
    const path = `${leadId}.${ext}`
    const { error } = await sb.storage.from('lead-screenshots').upload(path, Buffer.from(m[2], 'base64'), {
      contentType: m[1], upsert: true,
    })
    if (error) return null
    const { data } = sb.storage.from('lead-screenshots').getPublicUrl(path)
    return data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : null
  } catch {
    return null
  }
}

/** Run `fn` over items with `size` workers, never starting one after `deadline`. */
async function deadlinePool<T, R>(items: T[], size: number, deadline: number, fn: (item: T) => Promise<R>): Promise<{ results: R[]; notStarted: number }> {
  const results: R[] = []
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      if (Date.now() + PER_LEAD_WORST_MS > deadline) return
      const item = items[i++]
      results.push(await fn(item))
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return { results, notStarted: Math.max(0, items.length - i) }
}

export interface GthLeadOutcome { ok: boolean; score: number; tier: QualTier | null; error?: string }

/** Check, score and save one lead. Never throws. */
export async function qualifyGthLead(lead: any, agentConfig: any, agentRunId: string | null): Promise<GthLeadOutcome> {
  const sb = getAdminClient()
  const inner = agentConfig?.config || {}
  const prev = (lead.enrichment_data && typeof lead.enrichment_data === 'object') ? lead.enrichment_data : {}
  try {
    // 1. Website facts, Google's Lighthouse run and email source, in parallel
    const [intel, psi, emailLookup, place] = await Promise.all([
      lead.website ? analyzeWebsite(lead.website).catch(() => null) : Promise.resolve(null),
      lead.website ? captureSite(lead.website).catch(() => null) : Promise.resolve(null),
      lead.website && (!lead.email || !prev.email_source) ? scrapeEmailDetailed(lead.website).catch(() => null) : Promise.resolve(null),
      (prev.review_count == null && lead.google_place_id) ? fetchReviewCount(lead.google_place_id) : Promise.resolve(null),
    ])

    let email: string | null = lead.email || null
    let emailSource: 'website' | 'guessed' | null = prev.email_source ?? null
    if (emailLookup) {
      if (!email && emailLookup.email) { email = emailLookup.email; emailSource = emailLookup.source }
      else if (email && !emailSource) emailSource = emailLookup.email === email ? emailLookup.source : 'website'
    }
    if (email && !isValidEmail(email)) { email = null; emailSource = null }

    // 2. Look at the site: phone and desktop screenshots, top to footer, read by Claude
    const visual: VisualAudit | null = psi ? await auditVisually(lead.name || 'this business', psi, lead.id) : null
    const design = visual?.checked && visual.design_verdict !== 'unknown' ? { verdict: visual.design_verdict, note: visual.design_note } : null
    const screenshotUrl = visual?.urls?.mobile_top || visual?.urls?.desktop_top || null

    const reviewCount: number | null = prev.review_count ?? place?.reviewCount ?? null
    const types: string[] = (prev.place_types && prev.place_types.length ? prev.place_types : place?.types) || []
    const decisionMaker = intel?.decisionMakers?.[0]?.name || lead.contact_name || null
    // What we saw on screen beats what the HTML suggests. Never claim a
    // footer year we didn't read, and trust a visible booking button.
    const b = psi?.browser?.loaded ? psi.browser : null
    if (psi && !psi.loaded) console.error(`capture failed for ${lead.website}: ${psi.captureError}`)
    let audit: any = intel?.audit ? { ...intel.audit } : null
    if (psi?.loaded && (!audit || !audit.reachable)) {
      // Our plain fetch was blocked but a real browser (or Google) saw the page
      audit = {
        ...(audit || {}),
        reachable: true,
        https: (b?.finalUrl || lead.website || '').startsWith('https'),
        mobileReady: b ? b.viewportMeta : true,
        hasOnlineBooking: !!b?.bookingWidget,
        bookingTool: b?.bookingWidget ? 'online booking' : null,
        builder: audit?.builder || null,
        copyrightYear: null,
        ctaWithoutAction: null,
        hasForm: (b?.forms || 0) > 0,
        issues: [],
      }
    }
    if (audit && !psi?.loaded && psi?.confirmedDown === false && audit.reachable === false) {
      // Not proven down: don't score it as a dead site
      audit = null
    }
    if (audit && psi?.confirmedDown) audit.reachable = false
    if (audit) {
      // Footer year: the rendered footer text first, then what Claude read on screen. Never the raw HTML.
      const seenYear = b?.copyrightYear || (visual?.checked ? visual.footer_year : null)
      audit.copyrightYear = seenYear ? String(seenYear) : null
      if (b?.bookingWidget || visual?.booking_visible === 'yes') audit.hasOnlineBooking = true
      if (b && b.forms > 0) audit.hasForm = true
      if ((b && (b.forms > 0 || b.bookingWidget)) || (visual?.checked && visual.form_visible === 'yes')) {
        if (audit.ctaWithoutAction === true) audit.ctaWithoutAction = null
      }
      if (b) audit.mobileReady = b.viewportMeta
    }

    // 3. Points
    const pts: GthScore = scoreGthLead({
      name: lead.name || '',
      industry: lead.industry || null,
      searchQuery: prev.search_query || null,
      address: lead.address || null,
      website: lead.website || null,
      phone: lead.phone || null,
      rating: lead.rating ?? place?.rating ?? null,
      reviewCount,
      types,
      email,
      emailSource,
      decisionMaker,
      areas: Array.isArray(inner.search_areas) && inner.search_areas.length ? inner.search_areas : GTH_SEARCH_AREAS,
      audit,
      design: design ? { verdict: design.verdict, note: design.note, perf: psi?.perfMobile ?? null } : { verdict: 'unknown', perf: psi?.perfMobile ?? null },
    })

    // 4. Claude reviews the whole picture (small, bounded adjustment)
    const failed = pts.breakdown.filter(c => c.group === 'need' && c.status === 'fail' && c.points > 0)
    const facts = [
      `Business: ${lead.name}`,
      `Type: ${lead.industry || 'unknown'}${prev.search_query ? ` (found searching "${prev.search_query}")` : ''}`,
      `Address: ${lead.address || 'unknown'}`,
      `Website: ${lead.website || 'none'}`,
      `Google: ${lead.rating ?? 'no'} stars from ${reviewCount ?? 'an unknown number of'} reviews`,
      intel?.summary ? `Homepage says: ${intel.summary}` : '',
      intel?.services?.length ? `Services: ${intel.services.slice(0, 8).join(', ')}` : '',
      intel?.contentSnippet ? `Site text excerpt: ${intel.contentSnippet.slice(0, 700)}` : '',
      visual?.checked ? `Seen on screen: design ${visual.design_verdict} (${visual.design_note}); footer reads "${visual.footer_text || 'not legible'}"; booking visible: ${visual.booking_visible}; form visible: ${visual.form_visible}` : 'Screenshots unavailable, so make no claims about how the site looks.',
      ...(visual?.findings || []).map(f => `Visible problem: ${f.claim} (evidence: ${f.evidence})`),
      '',
      `POINTS: need ${pts.need}/50, fit ${pts.fit}/30, reach ${pts.reach}/20 = ${pts.base}/100${pts.disqualifier ? ` (disqualified: ${pts.disqualifier})` : ''}`,
      ...pts.breakdown.map(c => `- [${c.key}] ${c.label}: ${c.status}, ${c.points}/${c.max}. ${c.detail}`),
      '',
      failed.length
        ? `Failed checks you can use for the opener: ${failed.map(c => c.key).join(', ')}`
        : 'No check failed, so leave the observation empty.',
    ].filter(Boolean).join('\n')

    let adjustment = 0
    let adjustmentReason = ''
    let extraDisq: string | null = null
    let observation = ''
    let observationKey = ''
    let summary = ''
    try {
      const response = await askClaude({
        systemPrompt: GTH_QUALIFIER_PROMPT,
        messages: [{ role: 'user', content: `${facts}\n\nReview this lead with review_lead.` }],
        tools: GTH_QUALIFIER_TOOLS,
        tier: 'fast',
        maxTokens: 500,
      })
      const t = extractToolUse(response)?.input || {}
      adjustment = Number(t.adjustment) || 0
      adjustmentReason = String(t.adjustment_reason || '').trim()
      extraDisq = String(t.disqualifier || '').trim() || null
      observationKey = String(t.observation_key || '').trim()
      observation = String(t.observation || '').trim()
      summary = String(t.summary || '').trim()
    } catch { /* score stands on the points alone */ }

    // The opener must come from a check that actually failed
    const chosen = failed.find(c => c.key === observationKey)
    if (!chosen || !observation) {
      const top = [...failed].sort((a, b) => b.points - a.points)[0]
      observation = top?.say || ''
      observationKey = top?.key || ''
    }
    if (!failed.length) { observation = ''; observationKey = '' }

    const fin = finaliseGthScore(pts, adjustment, extraDisq, !lead.website || !!visual?.checked)
    if (fin.adjustment === 0) adjustmentReason = ''
    if (!summary) {
      summary = fin.disqualifier
        ? `Skipped: ${fin.disqualifier.toLowerCase()}.`
        : failed.length
          ? `Main gaps: ${failed.map(c => c.label.toLowerCase()).join(', ')}.`
          : 'No clear gap for GTH to fix right now.'
    }

    const now = new Date().toISOString()
    const qual = {
      version: 2,
      score: fin.score,
      tier: fin.tier,
      need: pts.need,
      fit: pts.fit,
      reach: pts.reach,
      adjustment: { points: fin.adjustment, reason: adjustmentReason },
      breakdown: pts.breakdown.map(({ say, ...c }) => c),
      design: {
        verdict: design?.verdict || 'unknown',
        note: design?.note || '',
        screenshot_url: screenshotUrl,
        desktop_url: visual?.urls?.desktop_top || null,
        footer_url: visual?.urls?.desktop_footer || null,
        perf: psi?.perfMobile ?? null,
        perf_desktop: psi?.perfDesktop ?? null,
        seo: psi?.seo ?? null,
        accessibility: psi?.accessibility ?? null,
      },
      visual: visual ? { attempts: visual.checked ? 0 : (Number(prev.qual?.visual?.attempts) || 0) + 1, source: psi?.source || 'none', error: psi?.captureError || psi?.browser?.error || null, checked: visual.checked, footer_text: visual.footer_text, footer_year: visual.footer_year, booking_visible: visual.booking_visible, form_visible: visual.form_visible, main_cta: visual.main_cta, findings: visual.findings, urls: visual.urls, checked_at: visual.checked_at } : { checked: false, attempts: (Number(prev.qual?.visual?.attempts) || 0) + 1, source: psi?.source || 'none', error: psi?.captureError || psi?.browser?.error || null },
      observation,
      observation_key: observationKey || null,
      pitch_angle: pts.pitchAngle,
      disqualifier: fin.disqualifier,
      checked_at: now,
    }

    const enrichment = {
      ...prev,
      ...(intel ? {
        website_quality: intel.websiteQuality,
        website_summary: intel.summary || null,
        services_found: intel.services,
        decision_makers: intel.decisionMakers,
        tech_signals: intel.techSignals,
        social_links: intel.socialLinks,
        has_blog: intel.hasBlog,
        has_contact_form: intel.hasContactForm,
        copyright_year: intel.copyrightYear,
        website_audit: intel.audit || null,
        website_analyzed_at: now,
      } : {}),
      review_count: reviewCount,
      place_types: types,
      email_source: emailSource,
      qual,
      observation,
      pitch_angle: pts.pitchAngle,
      qualification_signals: failed.map(c => c.detail),
      recommended_action: fin.tier === 'hot' ? 'priority_outreach' : fin.tier === 'warm' ? 'send_cold_email' : fin.tier === 'cold' ? 'add_to_nurture' : 'skip',
      qualified_at: now,
      ...(agentRunId ? { agent_run_id: agentRunId } : {}),
    }

    const patch: Record<string, any> = {
      qualification_score: fin.score,
      qualification_reason: summary,
      enrichment_data: enrichment,
    }
    if (email !== (lead.email || null)) patch.email = email
    if (decisionMaker && !lead.contact_name) patch.contact_name = decisionMaker

    const { error } = await sb.from('outreach_leads').update(patch).eq('id', lead.id)
    if (error) return { ok: false, score: 0, tier: null, error: `update ${lead.name}: ${error.message}` }
    return { ok: true, score: fin.score, tier: fin.tier }
  } catch (err: any) {
    return { ok: false, score: 0, tier: null, error: `${lead.name}: ${String(err?.message || err).slice(0, 200)}` }
  }
}

// "Current" means scored with points AND looked at on screen (or tried to)
// Current = scored with points AND actually seen on screen. A site we
// couldn't open gets two more tries before we stop retrying it.
function isV2(lead: any): boolean {
  const q = lead?.enrichment_data?.qual
  if (q?.version !== 2 || !q?.visual) return false
  return !!q.visual.checked || !lead.website || (Number(q.visual.attempts) || 0) >= 3
}

/** Normal run: new leads first, then older leads scored the old way (not yet emailed). */
async function qualifyGthBatch(p: { userId: string; agentRunId: string; agentConfig: any; batchSize: number; deadlineMs: number }): Promise<QualifyResult> {
  const sb = getAdminClient()
  const deadline = Date.now() + p.deadlineMs
  const size = Math.max(1, p.batchSize)

  const { data: fresh } = await sb.from('outreach_leads').select('*')
    .eq('user_id', p.userId).eq('agent_config_id', p.agentConfig.id)
    .is('qualification_score', null)
    .order('created_at', { ascending: false }).limit(size)
  let leads: any[] = fresh || []

  if (leads.length < size) {
    const { data: scored } = await sb.from('outreach_leads').select('*')
      .eq('user_id', p.userId).eq('agent_config_id', p.agentConfig.id)
      .not('qualification_score', 'is', null)
      .order('created_at', { ascending: false }).limit(300)
    const old = (scored || []).filter(l => !isV2(l))
    if (old.length) {
      const { data: seqs } = await sb.from('outreach_sequences').select('lead_id').in('lead_id', old.map(l => l.id))
      const emailed = new Set((seqs || []).map((s: any) => s.lead_id))
      leads = leads.concat(old.filter(l => !emailed.has(l.id)).slice(0, size - leads.length))
    }
  }
  if (!leads.length) return { qualified: 0, avgScore: 0, attempted: 0 }

  const { results } = await deadlinePool(leads, 3, deadline, l => qualifyGthLead(l, p.agentConfig, p.agentRunId))
  const ok = results.filter(r => r.ok)
  const errors = results.filter(r => !r.ok && r.error).map(r => r.error!)
  return {
    qualified: ok.length,
    avgScore: ok.length ? Math.round(ok.reduce((s, r) => s + r.score, 0) / ok.length) : 0,
    attempted: results.length,
    ...(errors.length ? { firstError: errors[0], errors: errors.slice(0, 3) } : {}),
  }
}

export interface RescoreResult {
  rescored: number
  hot: number
  warm: number
  cold: number
  skip: number
  failed: number
  remaining: number
  errors?: string[]
}

/** Re-check every lead of a GTH agent not yet on v2. Leads not yet emailed go first. */
export async function rescoreLeads(p: { userId: string; agentConfig: any; deadlineMs?: number; pool?: number }): Promise<RescoreResult> {
  const sb = getAdminClient()
  const deadline = Date.now() + (p.deadlineMs ?? 250_000)
  const { data: all, error } = await sb.from('outreach_leads').select('*')
    .eq('user_id', p.userId).eq('agent_config_id', p.agentConfig.id)
    .order('created_at', { ascending: false }).limit(1000)
  if (error) throw error
  const todo = (all || []).filter(l => !isV2(l))
  const { data: seqs } = todo.length
    ? await sb.from('outreach_sequences').select('lead_id').in('lead_id', todo.map(l => l.id))
    : { data: [] as any[] }
  const emailed = new Set((seqs || []).map((s: any) => s.lead_id))
  todo.sort((a, b) => Number(emailed.has(a.id)) - Number(emailed.has(b.id)))

  const { results, notStarted } = await deadlinePool(todo, p.pool ?? 3, deadline, l => qualifyGthLead(l, p.agentConfig, null))
  const count = (t: QualTier) => results.filter(r => r.ok && r.tier === t).length
  const errors = results.filter(r => !r.ok && r.error).map(r => r.error!)
  return {
    rescored: results.filter(r => r.ok).length,
    hot: count('hot'),
    warm: count('warm'),
    cold: count('cold'),
    skip: count('skip'),
    failed: results.filter(r => !r.ok).length,
    remaining: notStarted + results.filter(r => !r.ok).length,
    ...(errors.length ? { errors: errors.slice(0, 3) } : {}),
  }
}


// ─── Hunt: "Find leads now" ─────────────────────────────────────
// Screen businesses the agent hasn't looked at yet; when there are none,
// search for new ones. Stop when a few qualify (60+) or time runs out.

async function pendingLeads(userId: string, cfg: any, n: number): Promise<any[]> {
  const sb = getAdminClient()
  const { data } = await sb.from('outreach_leads').select('*')
    .eq('user_id', userId).eq('agent_config_id', cfg.id)
    .order('created_at', { ascending: false }).limit(1000)
  const todo = (data || []).filter(l => !isV2(l) && l.enrichment_data?.user_feedback !== 'bad')
  return todo.slice(0, n)
}

export async function huntLeads(p: { userId: string; agentConfig: any; deadlineMs?: number; target?: number }) {
  const deadline = Date.now() + (p.deadlineMs ?? 255_000)
  const target = p.target ?? 3
  let screened = 0, qualified = 0, searches = 0, newFound = 0, dryRuns = 0
  const errors: string[] = []
  while (Date.now() + PER_LEAD_WORST_MS < deadline && qualified < target) {
    const todo = await pendingLeads(p.userId, p.agentConfig, 6)
    if (!todo.length) {
      if (dryRuns >= 3) break
      const r: any = await scrapeRotation({ userId: p.userId, agentRunId: null as any, agentConfig: p.agentConfig, deadlineMs: 45_000 })
      searches++
      newFound += r?.leadsNew || 0
      if (!r?.leadsNew) dryRuns++
      if (r?.note && /quota/i.test(r.note)) { errors.push(r.note); break }
      continue
    }
    const { results } = await deadlinePool(todo, 3, deadline, l => qualifyGthLead(l, p.agentConfig, null))
    if (!results.length) break
    screened += results.length
    qualified += results.filter(r => r.ok && r.score >= 60).length
    for (const r of results) if (!r.ok && r.error) errors.push(r.error)
  }
  const left = (await pendingLeads(p.userId, p.agentConfig, 1000)).length
  return { screened, qualified, searches, newFound, remaining: left, errors: errors.slice(0, 3) }
}
