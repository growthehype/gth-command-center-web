// Grow The Hype prospecting profile: who we hunt, how we score them, and how
// Omar writes. Everything GTH-specific lives here so the generic pipeline
// (scraper → qualifier → writer → sender) stays reusable for client agents.

export const GTH_PROFILE_ID = 'gth'

export function isGthAgent(cfg: any): boolean {
  return cfg?.config?.profile === GTH_PROFILE_ID
}

// ─── Search rotation ────────────────────────────────────────────

// Interleaved so every run mixes professional services, clinics and trades.
export const GTH_SEARCH_TERMS: string[] = [
  'accounting firm', 'dental clinic', 'general contractor',
  'CPA firm', 'chiropractor', 'home renovation company',
  'law firm', 'physiotherapy clinic', 'HVAC company',
  'bookkeeping service', 'med spa', 'plumbing company',
  'family lawyer', 'audiologist hearing clinic', 'landscaping company',
  'financial advisor', 'massage therapy clinic', 'auto body shop',
  'property management company', 'wellness clinic', 'roofing company',
  'real estate lawyer', 'orthodontist', 'electrician',
  'mortgage broker', 'naturopathic clinic', 'flooring company',
  'tax accountant', 'optometrist', 'kitchen renovation company',
]

export const GTH_SEARCH_AREAS: string[] = [
  'Edmonton, AB',
  'Sherwood Park, AB',
  'St. Albert, AB',
  'Spruce Grove, AB',
  'Leduc, AB',
  'Fort Saskatchewan, AB',
  'Beaumont, AB',
]

export interface RotationPick {
  term: string
  area: string
  index: number
}

/** Next `count` (term, area) pairs starting at `start`. Area-major so Edmonton is covered first. */
export function nextRotation(cfgInner: any, count: number): { picks: RotationPick[]; nextIndex: number } {
  const terms: string[] = Array.isArray(cfgInner?.search_terms) && cfgInner.search_terms.length
    ? cfgInner.search_terms
    : GTH_SEARCH_TERMS
  const areas: string[] = Array.isArray(cfgInner?.search_areas) && cfgInner.search_areas.length
    ? cfgInner.search_areas
    : GTH_SEARCH_AREAS
  const total = terms.length * areas.length
  const start = Number.isFinite(cfgInner?.rotation_index) ? Number(cfgInner.rotation_index) % total : 0
  const picks: RotationPick[] = []
  for (let k = 0; k < count; k++) {
    const i = (start + k) % total
    picks.push({
      term: terms[i % terms.length],
      area: areas[Math.floor(i / terms.length) % areas.length],
      index: i,
    })
  }
  return { picks, nextIndex: (start + count) % total }
}

export const GTH_DEFAULT_CONFIG = {
  profile: GTH_PROFILE_ID,
  auto_send: false,
  target_location: 'Edmonton, AB',
  target_industries: 'Professional services, clinics, trades and home services',
  search_terms: GTH_SEARCH_TERMS,
  search_areas: GTH_SEARCH_AREAS,
  rotation_index: 0,
  queries_per_run: 5,
  daily_lead_quota: 25,
  daily_email_limit: 15,
  drafts_per_run: 8,
  min_score: 60,
  working_hours_start: '08:00',
  working_hours_end: '18:00',
  timezone: 'America/Edmonton',
  skip_weekends: true,
  sender_name: 'Omar Alladina',
  sender_title: 'Founder & Creative Director',
  sender_company: 'Grow The Hype',
  sender_website: 'growthehype.ca',
  sender_phone: '(780) 966-4986',
  sender_city: 'Edmonton, Alberta',
}

// ─── Qualification (v2: points you can check) ───────────────────
//
// The score is built from measured facts, not a vibe:
//   Need  (max 50)  how much there is for GTH to fix
//   Fit   (max 30)  whether this is the kind of business GTH wins
//   Reach (max 20)  whether we can get to a decision maker
// Claude then looks at the whole picture and may move it by at most ±8,
// with a reason. Chains, franchises and corporate offices are skipped.

export type QualTier = 'hot' | 'warm' | 'cold' | 'skip'
export type CheckGroup = 'need' | 'fit' | 'reach'

export interface QualCheck {
  key: string
  group: CheckGroup
  label: string
  points: number
  max: number
  /** need: 'fail' = gap found (opportunity). fit/reach: 'pass' = criterion met. */
  status: 'pass' | 'fail' | 'unknown'
  detail: string
  /** How Omar would say this gap to the owner (need checks only) */
  say?: string
}

export interface GthScoreInput {
  name: string
  industry: string | null
  searchQuery?: string | null
  address: string | null
  website: string | null
  phone: string | null
  rating: number | null
  reviewCount: number | null
  types?: string[] | null
  email: string | null
  emailSource: 'website' | 'guessed' | null
  decisionMaker: string | null
  areas: string[]
  audit: {
    reachable: boolean
    https: boolean
    mobileReady: boolean
    builder: string | null
    bookingTool: string | null
    hasOnlineBooking: boolean
    copyrightYear: string | null
    ctaPhrase?: string | null
    ctaWithoutAction?: boolean | null
  } | null
  design: { verdict: 'dated' | 'average' | 'modern' | 'unknown'; note?: string; perf?: number | null } | null
  /** Problems Claude actually saw on screen, with evidence */
  visualFindings?: { key: string; claim: string; evidence: string }[]
  now?: Date
}

export interface GthScore {
  need: number
  fit: number
  reach: number
  base: number
  breakdown: QualCheck[]
  disqualifier: string | null
  hasStrongNeed: boolean
  pitchAngle: 'website' | 'ai' | 'both'
}

const CHAIN_RE = /\b(kpmg|deloitte|mnp|bdo|grant thornton|ernst & young|pwc|pricewaterhouse|crowe|h&r block|h & r block|liberty tax|jackson hewitt|dentalcorp|dental corp|123dentist|lifemark|pt health|physio ?health|cbi health|pure physio|athletico|nova physio|mr\.? ?lube|midas|canadian tire|home depot|lowe'?s|walmart|costco|shoppers|rexall|london drugs|specsavers|fyidoctors|lenscrafters|hearinglife|connect hearing|amplifon|nobul|re\/?max|royal lepage|century 21|exp realty|keller williams|coldwell|investors group|ig wealth|edward jones|sun life|manulife|rbc|td bank|scotiabank|bmo|cibc|atb|servpro|molly maid|mr\.? rooter|two men and a truck|college pro|gentle dental|smile dental group|primacare|medicentres|alberta health|covenant health|government of|city of)\b/i
const CORPORATE_TYPES = /\b(hospital|local_government_office|city_hall|courthouse|embassy|police|fire_station|university|school|post_office)\b/

const CLINIC_RE = /dental|dentist|orthodont|chiro|physio|massage|med ?spa|medspa|optomet|eye care|wellness|naturopath|audiolog|hearing|clinic|vet|veterinar|acupunct|counsel|psycholog|therap|skin|aesthetic|denturist|podiatr/i
const TRADES_RE = /contractor|plumb|hvac|heating|furnace|roof|electric|landscap|renovat|flooring|kitchen|bath|construction|builder|paint|carpent|window|door|concrete|fence|deck|auto ?body|collision|mechanic|garage|cleaning|moving|pest|pool|gutter|tree service|snow|handyman|restoration|glass/i
const FOOD_RE = /restaurant|caf[eé]|coffee|bistro|bakery|pizza|sushi|ramen|pho|vietnamese|thai|indian|italian|grill|diner|eatery|brewery|brewpub|pub\b|bar\b|steakhouse|burger|shawarma|taco|bbq|barbecue|dessert|catering|food/i
const PRO_RE = /account|cpa|bookkeep|tax|law|lawyer|legal|attorney|notary|financial|wealth|mortgage|insurance|consult|property manag|real estate|architect|engineer|surveyor|appraiser/i

export type Vertical = 'clinic' | 'trades' | 'professional' | 'restaurant' | 'other'

export function verticalOf(input: Pick<GthScoreInput, 'industry' | 'searchQuery' | 'name' | 'types'>): Vertical {
  const hay = [input.searchQuery, input.industry, (input.types || []).join(' '), input.name].filter(Boolean).join(' ')
  // Search query is the most reliable label, so test it first on its own
  for (const src of [input.searchQuery || '', hay]) {
    if (!src) continue
    if (FOOD_RE.test(src) && !/kitchen renovation|kitchen cabinet/i.test(src)) return 'restaurant'
    if (CLINIC_RE.test(src)) return 'clinic'
    if (TRADES_RE.test(src)) return 'trades'
    if (PRO_RE.test(src)) return 'professional'
  }
  return 'other'
}

function cityOf(area: string): string {
  return area.split(',')[0].trim().toLowerCase()
}

const EDMONTON_REGION = ['edmonton', 'sherwood park', 'st. albert', 'st albert', 'spruce grove', 'stony plain', 'leduc', 'nisku', 'fort saskatchewan', 'beaumont', 'devon', 'morinville', 'strathcona county', 'acheson', 'parkland county']

/** Deterministic points from measured facts. Pure, no IO. */
export function scoreGthLead(input: GthScoreInput): GthScore {
  const now = input.now || new Date()
  const checks: QualCheck[] = []
  const add = (c: QualCheck) => checks.push(c)
  const a = input.audit
  const verdict = input.design?.verdict || 'unknown'
  const vertical = verticalOf(input)

  // ── Disqualifiers ──
  let disqualifier: string | null = null
  const hay = `${input.name} ${input.website || ''}`
  if (CHAIN_RE.test(hay)) disqualifier = 'Part of a chain, franchise or national firm'
  else if ((input.types || []).some(t => CORPORATE_TYPES.test(t))) disqualifier = 'Hospital, school or government office'
  else if (input.address && !/\b(AB|Alberta)\b/.test(input.address)) disqualifier = 'Outside Alberta'

  // ── Need (max 50) ──
  if (!input.website) {
    add({ key: 'no_website', group: 'need', label: 'Has a website', points: 30, max: 30, status: 'fail', detail: 'No website listed on Google', say: "I couldn't find a website for you on Google" })
  } else if (!a || !a.reachable) {
    add({ key: 'site_down', group: 'need', label: 'Website loads', points: a ? 30 : 0, max: 30, status: a ? 'fail' : 'unknown', detail: a ? 'The site did not load when we checked' : 'Not checked', say: "your website wouldn't load when I tried it" })
  } else {
    add({ key: 'site_down', group: 'need', label: 'Website loads', points: 0, max: 30, status: 'pass', detail: 'Loads fine' })

    const designPts = verdict === 'dated' ? 25 : verdict === 'average' ? 15 : 0
    add({
      key: 'design', group: 'need', label: 'Design looks current', points: designPts, max: 25,
      status: verdict === 'unknown' ? 'unknown' : designPts > 0 ? 'fail' : 'pass',
      detail: verdict === 'unknown' ? 'Could not get a screenshot' : `${verdict[0].toUpperCase()}${verdict.slice(1)}${input.design?.note ? `: ${input.design.note}` : ''}`,
      say: verdict === 'dated' ? 'your site looks a fair bit older than the business behind it' : 'the site works, but it reads a few years old next to your competitors',
    })

    add({ key: 'https', group: 'need', label: 'Secure (HTTPS)', points: a.https ? 0 : 10, max: 10, status: a.https ? 'pass' : 'fail', detail: a.https ? 'Yes' : 'No, browsers show "Not secure"', say: "your site isn't secure, so browsers flag it as not secure" })
    add({ key: 'mobile', group: 'need', label: 'Set up for phones', points: a.mobileReady ? 0 : 12, max: 12, status: a.mobileReady ? 'pass' : 'fail', detail: a.mobileReady ? 'Yes' : 'No mobile layout', say: "your site isn't set up for phones, so it shows the desktop version shrunk down" })

    const perf = input.design?.perf ?? null
    const perfPts = perf == null ? 0 : perf < 40 ? 8 : perf < 60 ? 4 : 0
    add({ key: 'speed', group: 'need', label: 'Fast on phones', points: perfPts, max: 8, status: perf == null ? 'unknown' : perfPts ? 'fail' : 'pass', detail: perf == null ? 'Not measured' : `Google mobile speed score ${perf}/100`, say: 'your site is slow to load on a phone' })

    const year = a.copyrightYear ? Number(a.copyrightYear) : null
    const oldYear = !!year && year <= now.getFullYear() - 3
    const yearPts = oldYear && verdict !== 'modern' ? 5 : 0
    add({
      key: 'copyright', group: 'need', label: 'Kept up to date', points: yearPts, max: 5,
      status: !year ? 'unknown' : yearPts ? 'fail' : 'pass',
      detail: !year ? 'No year in the footer' : oldYear ? (verdict === 'modern' ? `Footer says ${year}, but the design is current, so it doesn't count` : `Footer still says ${year}`) : `Footer says ${year}`,
      say: `your footer still says ${year}`,
    })

    const template = !!a.builder && ['Wix', 'GoDaddy', 'Weebly', 'Jimdo', 'Site123', 'Duda'].includes(a.builder)
    add({ key: 'builder', group: 'need', label: 'Custom built', points: template ? 5 : 0, max: 5, status: template ? 'fail' : 'pass', detail: template ? `Template builder (${a.builder})` : (a.builder || 'Not a template builder'), say: `your site is on a ${a.builder} template` })

    const ctaGap = a.ctaWithoutAction === true
    add({
      key: 'cta', group: 'need', label: 'Main button works online', points: ctaGap ? 8 : 0, max: 8,
      status: a.ctaWithoutAction == null ? 'unknown' : ctaGap ? 'fail' : 'pass',
      detail: !a.ctaPhrase ? 'No booking or quote button found' : ctaGap ? `Says "${a.ctaPhrase}" but there is no way to do it online` : `"${a.ctaPhrase}" works`,
      say: `your site says "${a.ctaPhrase}" but there's no way to actually do that online`,
    })

    const expectsBooking = vertical === 'clinic' || vertical === 'trades' || vertical === 'restaurant'
    const bookingGap = expectsBooking && !a.hasOnlineBooking
    add({
      key: 'booking', group: 'need', label: 'Online booking or requests', points: bookingGap ? 6 : 0, max: expectsBooking ? 6 : 0,
      status: a.hasOnlineBooking ? 'pass' : expectsBooking ? 'fail' : 'pass',
      detail: a.hasOnlineBooking ? (a.bookingTool || 'Yes') : expectsBooking ? 'None found' : 'Not something clients expect from this kind of firm',
      say: vertical === 'trades' ? "there's no way to request a quote or book online" : vertical === 'restaurant' ? "there's no way to reserve a table or order online from your site" : "there's no way to book an appointment online",
    })
  }
  // Problems seen on screen (with evidence) that the checks above don't already cover
  if (a && a.reachable) {
    const covered = new Set(['design', 'footer_year', 'no_booking', 'not_mobile'])
    const seen = (input.visualFindings || []).filter(f => !covered.has(f.key))
    const pts = Math.min(15, seen.length * 5)
    add({
      key: 'visible_issues', group: 'need', label: 'Problems visible on the page', points: pts, max: 15,
      status: input.visualFindings == null ? 'unknown' : pts ? 'fail' : 'pass',
      detail: seen.length ? seen.map(f => f.claim).join('; ') : 'Nothing else stood out',
      say: seen[0]?.claim || '',
    })
  }
  let need = Math.min(50, checks.filter(c => c.group === 'need').reduce((s, c) => s + c.points, 0))

  // ── Fit (max 30) ──
  add({ key: 'independent', group: 'fit', label: 'Independent local business', points: 0, max: 0, status: disqualifier ? 'fail' : 'pass', detail: disqualifier || 'Yes' })
  const rc = input.reviewCount
  const reviewPts = rc == null ? 0 : rc >= 15 && rc <= 400 ? 10 : rc >= 5 && rc < 15 ? 5 : 0
  add({ key: 'reviews', group: 'fit', label: 'Established (Google reviews)', points: reviewPts, max: 10, status: rc == null ? 'unknown' : reviewPts ? 'pass' : 'fail', detail: rc == null ? 'Review count unknown' : rc > 400 ? `${rc} reviews, likely bigger than our sweet spot` : `${rc} reviews` })
  const ratingPts = (input.rating ?? 0) >= 4.3 ? 5 : 0
  add({ key: 'rating', group: 'fit', label: 'Well rated (4.3+)', points: ratingPts, max: 5, status: input.rating == null ? 'unknown' : ratingPts ? 'pass' : 'fail', detail: input.rating == null ? 'No rating' : `${input.rating} stars` })
  const coreVertical = vertical !== 'other'
  add({ key: 'vertical', group: 'fit', label: 'Core industry', points: coreVertical ? 5 : 0, max: 5, status: coreVertical ? 'pass' : 'fail', detail: { clinic: 'Clinic', trades: 'Trades or home services', professional: 'Professional services', restaurant: 'Restaurant or café', other: 'Outside our core industries' }[vertical] })
  const addr = (input.address || '').toLowerCase()
  const areas = [...new Set([...input.areas.map(cityOf), ...EDMONTON_REGION])]
  const local = !!addr && areas.some(c => c && addr.includes(c))
  add({ key: 'area', group: 'fit', label: 'In the Edmonton region', points: local ? 5 : 0, max: 5, status: !addr ? 'unknown' : local ? 'pass' : 'fail', detail: input.address || 'No address' })
  let fit = Math.min(30, checks.filter(c => c.group === 'fit').reduce((s, c) => s + c.points, 0))

  // ── Reach (max 20) ──
  const emailPts = !input.email ? 0 : input.emailSource === 'guessed' ? 3 : 10
  add({ key: 'email', group: 'reach', label: 'Real email address', points: emailPts, max: 10, status: !input.email ? 'fail' : emailPts === 10 ? 'pass' : 'unknown', detail: !input.email ? 'No email found' : input.emailSource === 'guessed' ? `${input.email} (guessed, not on their site)` : `${input.email} (from their site)` })
  add({ key: 'decision_maker', group: 'reach', label: 'Owner or decision maker named', points: input.decisionMaker ? 6 : 0, max: 6, status: input.decisionMaker ? 'pass' : 'fail', detail: input.decisionMaker || 'No name found' })
  add({ key: 'phone', group: 'reach', label: 'Phone number', points: input.phone ? 4 : 0, max: 4, status: input.phone ? 'pass' : 'fail', detail: input.phone || 'None listed' })
  const reach = Math.min(20, checks.filter(c => c.group === 'reach').reduce((s, c) => s + c.points, 0))

  if (disqualifier) { need = Math.min(need, 5); fit = 0 }

  const strong = checks.some(c => c.group === 'need' && c.points >= 8)
  const siteGaps = checks.filter(c => c.group === 'need' && c.points > 0 && ['no_website', 'site_down', 'design', 'https', 'mobile', 'speed', 'copyright', 'builder', 'visible_issues'].includes(c.key)).reduce((s, c) => s + c.points, 0)
  const flowGaps = checks.filter(c => c.group === 'need' && c.points > 0 && ['cta', 'booking'].includes(c.key)).reduce((s, c) => s + c.points, 0)
  const pitchAngle: GthScore['pitchAngle'] = siteGaps >= 10 && flowGaps > 0 ? 'both' : siteGaps >= flowGaps && siteGaps > 0 ? 'website' : flowGaps > 0 ? 'ai' : 'ai'

  return { need, fit, reach, base: need + fit + reach, breakdown: checks, disqualifier, hasStrongNeed: strong, pitchAngle }
}

/** Apply Claude's adjustment, the need gate and the tier rules. */
export function finaliseGthScore(s: GthScore, adjustment: number, extraDisqualifier?: string | null, seenOnScreen = true): { score: number; tier: QualTier; adjustment: number; disqualifier: string | null } {
  const adj = Math.max(-8, Math.min(8, Math.round(Number(adjustment) || 0)))
  const disq = s.disqualifier || (extraDisqualifier ? extraDisqualifier.trim() || null : null)
  let score = Math.max(0, Math.min(100, s.base + adj))
  if (disq) return { score: Math.min(score, 15), tier: 'skip', adjustment: adj, disqualifier: disq }
  if (!s.hasStrongNeed) score = Math.min(score, 59)
  // Omar's rule: nothing under 60 is worth an email, and nothing is hot or warm
  // unless we have actually seen the site with our own eyes.
  if (!seenOnScreen) score = Math.min(score, 59)
  const tier: QualTier = score >= 70 ? 'hot' : score >= 60 ? 'warm' : 'cold'
  return { score, tier, adjustment: adj, disqualifier: null }
}

export const GTH_QUALIFIER_PROMPT = `You review prospects for Grow The Hype (GTH), a web and marketing agency in Edmonton run by Omar Alladina. GTH builds custom websites and sets up AI for booking, intake, quotes and follow-ups.

You are given measured facts about one business and a points score already calculated from them (Need, Fit, Reach). Your job:
1. Sanity-check the score. You may adjust it by -8 to +8, only for something the points can't see (for example: the content shows a large corporate operation, the site belongs to a parent company, or the business clearly invests heavily in marketing already). Give the reason in a few words. Use 0 if the score is fair.
2. Flag a disqualifier if the business is a chain, franchise, national network, corporate office, hospital, school or government body. Leave it empty otherwise.
3. Pick the ONE best opening observation for Omar's email from the failed checks listed. Return its check key, and write it the way Omar would say it to the owner: plain, kind, specific, a few words, nothing invented. If no check failed, leave it empty.
4. Write a one or two sentence plain summary of why this business is or isn't worth Omar's time.

Never invent facts. Never use a founding year or business age; you do not have reliable data for it.`

export const GTH_QUALIFIER_TOOLS = [
  {
    name: 'review_lead',
    description: 'Review the points score for a prospect',
    input_schema: {
      type: 'object' as const,
      properties: {
        adjustment: { type: 'number', description: 'Points to add or remove, -8 to 8, usually 0' },
        adjustment_reason: { type: 'string', description: 'Why, in a few words. Empty when 0' },
        disqualifier: { type: 'string', description: 'Chain, franchise, corporate, etc. Empty if none' },
        observation_key: { type: 'string', description: 'Key of the failed check used for the opener, or empty' },
        observation: { type: 'string', description: 'The opener as Omar would say it, or empty' },
        summary: { type: 'string', description: 'One or two plain sentences' },
      },
      required: ['adjustment', 'adjustment_reason', 'disqualifier', 'observation_key', 'observation', 'summary'],
    },
  },
]

// ─── Writing ────────────────────────────────────────────────────

export const GTH_WRITER_PROMPT = `You write cold emails as Omar Alladina, founder of Grow The Hype, a small marketing and web agency in Edmonton. Omar writes like a local business owner talking to another local business owner: plain, direct, friendly, a little casual. He is not a salesperson and never sounds like one.

You are writing a three-email sequence to one business: a first email, a short follow-up, and a short final note.

What Omar can offer (pick the ONE that fits the observation, never list services):
- A new website, designed, built and hosted by his team, set up properly for phones, speed and getting people to book or call.
- Setting up AI in the business: online booking, intake forms, quote requests, follow-ups and answering common questions automatically, so the front desk spends less time on the phone.

First email:
- Greeting: "Hi {first name}," if a contact name is given, otherwise "Hi there,".
- Sentence 1: who he is in a few words ("I'm Omar, I run Grow The Hype here in Edmonton.") or go straight to the observation. No compliments, no "I came across", no "I hope".
- Sentence 2-3: the one specific observation, stated plainly and kindly, and why it matters to them in practical terms (missed calls, people bouncing off on phones, admin time).
- One sentence on what he'd do about it, in plain words.
- A soft, low-pressure question to end, for example "Would you be open to a quick chat?" or "Worth a 10 minute call sometime this week?"
- Sign off on its own line: Omar
- 60 to 110 words total.

Follow-up (sent a few days later in the same thread): 25 to 60 words. One new small angle or a simpler ask. No "just checking in", no guilt. Sign off: Omar
Final note: 15 to 45 words. Friendly, leaves the door open, no pressure. Sign off: Omar

Subject line: 2 to 5 words, mostly lowercase, specific to them (e.g. "your website", "online booking at {business}", "quick idea for {business}"). No clickbait, no "re:", no punctuation tricks.

Hard rules (breaking any of these ruins the email):
- Never invent facts, numbers, results, prices, clients, awards or timelines. No percentages, no dollar amounts, no statistics.
- No em dashes or en dashes or double hyphens. Use commas and full stops.
- No exclamation marks. No emojis. No bullet points or lists. No bold. No links.
- Never use these words or phrases: leverage, synergy, elevate, unlock, streamline, game-changer, cutting-edge, seamless, revolutionize, transform, empower, robust, delve, tailored, solutions, digital landscape, in today's world, next level, boost, skyrocket, reach out, touch base, circle back, hope this finds you, hope you're well, I came across, I stumbled upon, I wanted to reach out, just checking in, best regards, kind regards, warm regards.
- Contractions are good. Short sentences are good. Canadian spelling.
- Do not add a signature block or contact details. Do not add an unsubscribe line. Those are added automatically.
- Do not use placeholders or brackets of any kind.`

export const GTH_WRITER_TOOLS = [
  {
    name: 'compose_sequence',
    description: 'Write the three-email outreach sequence for one business',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', description: 'Subject line for the first email (follow-ups reply in the same thread)' },
        email_1: { type: 'string', description: 'First email body, plain text, ends with "Omar"' },
        follow_up_1: { type: 'string', description: 'Follow-up body, plain text, ends with "Omar"' },
        follow_up_2: { type: 'string', description: 'Final note body, plain text, ends with "Omar"' },
        angle_used: { type: 'string', enum: ['website', 'ai', 'both'] },
      },
      required: ['subject', 'email_1', 'follow_up_1', 'follow_up_2', 'angle_used'],
    },
  },
]

// ─── Validation & repair ────────────────────────────────────────

const BANNED_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bleverag/i, label: 'leverage' },
  { re: /\bsynerg/i, label: 'synergy' },
  { re: /\belevat/i, label: 'elevate' },
  { re: /\bunlock/i, label: 'unlock' },
  { re: /\bstreamlin/i, label: 'streamline' },
  { re: /game[\s-]?changer/i, label: 'game-changer' },
  { re: /cutting[\s-]?edge/i, label: 'cutting-edge' },
  { re: /\bseamless/i, label: 'seamless' },
  { re: /revolutioni[sz]/i, label: 'revolutionize' },
  { re: /\btransform/i, label: 'transform' },
  { re: /\bempower/i, label: 'empower' },
  { re: /\brobust\b/i, label: 'robust' },
  { re: /\bdelve/i, label: 'delve' },
  { re: /\btailored\b/i, label: 'tailored' },
  { re: /\bsolutions?\b/i, label: 'solutions' },
  { re: /digital landscape/i, label: 'digital landscape' },
  { re: /in today'?s\s+(world|market|age|digital)/i, label: "in today's world" },
  { re: /next level/i, label: 'next level' },
  { re: /\bboost/i, label: 'boost' },
  { re: /skyrocket/i, label: 'skyrocket' },
  { re: /reach(ing)? out/i, label: 'reach out' },
  { re: /touch base/i, label: 'touch base' },
  { re: /circle back/i, label: 'circle back' },
  { re: /hope (this|you|all|your|that)/i, label: 'I hope' },
  { re: /i came across/i, label: 'I came across' },
  { re: /stumbled (up)?on/i, label: 'stumbled upon' },
  { re: /just checking in/i, label: 'just checking in' },
  { re: /(best|kind|warm) regards/i, label: 'regards' },
  { re: /\bthrilled\b|\bexcited to\b/i, label: 'thrilled/excited' },
  { re: /\bcomprehensive\b/i, label: 'comprehensive' },
  { re: /\binnovative\b/i, label: 'innovative' },
]

const CHAR_RULES: { re: RegExp; label: string; fix: string }[] = [
  { re: /\s*[—–]\s*/g, label: 'em/en dash', fix: ', ' },
  { re: /\s*--+\s*/g, label: 'double hyphen', fix: ', ' },
  { re: /!/g, label: 'exclamation mark', fix: '.' },
  { re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, label: 'emoji', fix: '' },
  { re: /[%$]/g, label: 'percent or dollar sign', fix: '' },
  { re: /[[\]{}<>]/g, label: 'brackets or placeholders', fix: '' },
  { re: /\*\*/g, label: 'bold markers', fix: '' },
]

function wordCount(s: string): number {
  return (s.trim().match(/\S+/g) || []).length
}

export interface SequenceDraft {
  subject: string
  email_1: string
  follow_up_1: string
  follow_up_2: string
  angle_used?: string
}

const LIMITS: Record<'email_1' | 'follow_up_1' | 'follow_up_2', [number, number]> = {
  email_1: [40, 130],
  follow_up_1: [15, 75],
  follow_up_2: [8, 60],
}

/** Every rule the draft breaks, as short human-readable strings. Empty = clean. */
export function validateSequence(d: SequenceDraft): string[] {
  const problems: string[] = []
  if (!d || typeof d !== 'object') return ['no draft returned']

  const subjectWords = wordCount(d.subject || '')
  if (subjectWords < 1 || subjectWords > 7) problems.push(`subject must be 2 to 5 words (got ${subjectWords})`)
  if (/[!]|re:/i.test(d.subject || '')) problems.push('subject has "!" or "re:"')

  for (const key of ['email_1', 'follow_up_1', 'follow_up_2'] as const) {
    const body = d[key] || ''
    const [min, max] = LIMITS[key]
    const wc = wordCount(body)
    if (wc < min || wc > max) problems.push(`${key} is ${wc} words (allowed ${min}-${max})`)
    if (!/\n\s*Omar\s*$/.test(body.trim()) && !/^Omar$/m.test(body.trim().split('\n').pop() || '')) {
      problems.push(`${key} must end with "Omar" on its own line`)
    }
    if (/^\s*([-*•]|\d+\.)\s+/m.test(body)) problems.push(`${key} uses a list`)
    for (const { re, label } of BANNED_PATTERNS) {
      if (re.test(body)) problems.push(`${key} uses banned phrase "${label}"`)
    }
    for (const { re, label } of CHAR_RULES) {
      re.lastIndex = 0
      if (re.test(body)) problems.push(`${key} contains ${label}`)
      re.lastIndex = 0
    }
  }
  for (const { re, label } of BANNED_PATTERNS) {
    if (re.test(d.subject || '')) problems.push(`subject uses banned phrase "${label}"`)
  }
  return problems
}

/** Last-resort cleanup when a regenerated draft still breaks rules. */
export function repairSequence(d: SequenceDraft): SequenceDraft {
  const fixBody = (raw: string): string => {
    let body = (raw || '').replace(/\r/g, '')
    for (const { re, fix } of CHAR_RULES) {
      re.lastIndex = 0
      body = body.replace(re, fix)
    }
    // Drop whole sentences that contain banned phrases
    const lines = body.split('\n').map((line) => {
      const sentences = line.match(/[^.?]+[.?]?\s*/g) || [line]
      return sentences.filter((sent) => !BANNED_PATTERNS.some(({ re }) => re.test(sent))).join('').trimEnd()
    })
    body = lines.join('\n')
      .replace(/^\s*([-*•]|\d+\.)\s+/gm, '')
      .replace(/ ,/g, ',')
      .replace(/,\s*,/g, ',')
      .replace(/\.\s*\./g, '.')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    // Guarantee the sign-off
    if (!/\bOmar\s*$/.test(body)) body = `${body}\n\nOmar`
    return body
  }
  let subject = (d.subject || '').replace(/[!]/g, '').replace(/^re:\s*/i, '')
  for (const { re, fix } of CHAR_RULES) {
    re.lastIndex = 0
    subject = subject.replace(re, fix)
  }
  subject = subject.trim().split(/\s+/).slice(0, 6).join(' ')
  return {
    subject: subject || 'quick idea',
    email_1: fixBody(d.email_1),
    follow_up_1: fixBody(d.follow_up_1),
    follow_up_2: fixBody(d.follow_up_2),
    angle_used: d.angle_used,
  }
}

// ─── Compliance footer (CASL) ───────────────────────────────────

export function gthOptOutFooterHtml(cfgInner?: any): string {
  const company = cfgInner?.sender_company || 'Grow The Hype'
  const city = cfgInner?.sender_city || 'Edmonton, Alberta'
  return `<p style="margin-top:22px;font-size:11px;line-height:1.5;color:#9a9a9a;">${company} &middot; ${city}<br>If this isn't relevant, reply "no thanks" and I won't reach out again.</p>`
}
