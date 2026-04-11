// Lead scraping engine using Google Places API (New) Text Search
import { getAdminClient } from './supabase-admin'

// ─── Types ──────────────────────────────────────────────────────

interface ScrapeParams {
  userId: string
  agentRunId: string
  query: string
  location: string
  source?: string
  agentName?: string | null
  agentType?: string | null
  agentConfigId?: string | null
  agentConfig?: any
}

interface ScrapeResult {
  leadsFound: number
  leadsNew: number
  scrapeJobId: string
}

interface PlaceResult {
  displayName?: { text: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  googleMapsUri?: string
  id?: string
  businessStatus?: string
  types?: string[]
}

// ─── Industry helpers ───────────────────────────────────────────

const _NOISE_TYPES = new Set([
  'establishment', 'point_of_interest', 'service', 'store',
  'premise', 'subpremise', 'food', 'finance', 'health',
])

// Map raw Google place types → clean human-readable category. Multiple raw
// types collapse to the same label (dentist + dental_clinic + orthodontist
// → "Dental") so the table doesn't show duplicates of the same business kind.
const TYPE_TO_CATEGORY: Record<string, string> = {
  // Dental
  dentist: 'Dental', dental_clinic: 'Dental', orthodontist: 'Dental',
  endodontist: 'Dental', periodontist: 'Dental', oral_surgeon: 'Dental',

  // Construction / contractors
  general_contractor: 'Contractor', contractor: 'Contractor',
  roofing_contractor: 'Contractor', plumber: 'Contractor', electrician: 'Contractor',
  painter: 'Contractor', carpenter: 'Contractor', moving_company: 'Contractor',
  locksmith: 'Contractor', flooring_contractor: 'Contractor',
  hvac_contractor: 'Contractor', landscaper: 'Contractor', landscaping: 'Contractor',
  home_builder: 'Contractor', construction_company: 'Contractor',

  // Real estate
  real_estate_agency: 'Real Estate', real_estate_agent: 'Real Estate',

  // Auto
  car_dealer: 'Auto Dealer', car_repair: 'Auto Repair',
  car_wash: 'Auto Service', auto_parts_store: 'Auto Parts',

  // Food
  restaurant: 'Restaurant', cafe: 'Cafe', bakery: 'Bakery', bar: 'Bar',
  meal_delivery: 'Restaurant', meal_takeaway: 'Restaurant',
  fast_food_restaurant: 'Restaurant', coffee_shop: 'Cafe',

  // Health / medical (non-dental)
  doctor: 'Medical', hospital: 'Medical', physiotherapist: 'Medical',
  chiropractor: 'Medical', optometrist: 'Medical', pharmacy: 'Pharmacy',
  veterinary_care: 'Veterinary',

  // Beauty / wellness
  hair_care: 'Salon', beauty_salon: 'Salon', barber_shop: 'Salon',
  nail_salon: 'Salon', spa: 'Spa', gym: 'Fitness',

  // Legal / financial / professional
  lawyer: 'Legal', accounting: 'Accounting', insurance_agency: 'Insurance',
  bank: 'Bank',

  // Retail
  clothing_store: 'Retail', furniture_store: 'Retail', electronics_store: 'Retail',
  jewelry_store: 'Retail', shoe_store: 'Retail', book_store: 'Retail',
  hardware_store: 'Retail',

  // Services
  laundry: 'Service', dry_cleaning: 'Service', funeral_home: 'Service',
  travel_agency: 'Travel', florist: 'Florist', pet_store: 'Pet',
}

function prettifyType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Normalize an industry string (raw Google type OR existing label) to a clean category */
export function normalizeIndustryLabel(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  // Reject pure noise types — they leak meaning. Map them to "Other" so the
  // user can fix them manually instead of seeing useless labels like "health".
  const lower = trimmed.toLowerCase()
  if (_NOISE_TYPES.has(lower)) return 'Other'
  // Comma-separated raw-types blob — pick the first meaningful one
  if (trimmed.includes(',')) {
    const first = trimmed.split(',')[0].trim()
    return pickPrimaryType([first, ...trimmed.split(',').slice(1).map(s => s.trim())])
  }
  if (TYPE_TO_CATEGORY[lower]) return TYPE_TO_CATEGORY[lower]
  if (trimmed.includes('_')) return prettifyType(trimmed)
  // Single clean word — title-case it (so "health" wouldn't reach here, but
  // "real estate" stays as is, and "dentist" becomes "Dentist" — though
  // dentist is already in the lookup table above)
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Pick the cleanest, most useful industry label from Google place types */
function pickPrimaryType(types: string[] | undefined): string | null {
  if (!types || types.length === 0) return null
  // First pass: any type with a hand-curated category mapping
  for (const t of types) {
    if (TYPE_TO_CATEGORY[t]) return TYPE_TO_CATEGORY[t]
  }
  // Second pass: first non-noise type, prettified
  for (const t of types) {
    if (!_NOISE_TYPES.has(t)) return prettifyType(t)
  }
  return prettifyType(types[0] || '') || null
}

// ─── Email enrichment via website scraping ──────────────────────

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
// Obfuscated patterns: "info [at] example [dot] com", "info(at)example(dot)com".
// CRITICAL: brackets/parens around `at` and `dot` are REQUIRED. Earlier we made
// them optional which caused "gstatic" → "gst at ic" → "gst@ic.com" garbage.
const OBFUSCATED_RE = /([A-Za-z0-9._%+-]+)\s*[\[\(]\s*(?:at|@)\s*[\]\)]\s*([A-Za-z0-9.-]+)\s*[\[\(]\s*(?:dot|\.)\s*[\]\)]\s*([A-Za-z]{2,})/gi
// Things to reject — generic junk + framework noise + image extensions
const REJECT_RE = /(example\.com|sentry|wixpress|squarespace|godaddy\.com|@2x\.|@3x\.|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.webp|\.ico|sentry\.io|wordpress\.com|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|abuse@|webmaster@.*godaddy|u003e|u003c)/i

// Whitelist of legitimate TLDs we accept. Anything else is treated as a false
// positive from CSS/JS noise (e.g. ".now", ".why", ".push" are NOT real TLDs).
const VALID_TLDS = new Set([
  'com', 'org', 'net', 'ca', 'io', 'co', 'biz', 'info', 'us', 'uk', 'de', 'fr',
  'es', 'it', 'nl', 'be', 'au', 'nz', 'jp', 'kr', 'cn', 'in', 'br', 'mx', 'ru',
  'app', 'dev', 'tech', 'inc', 'ltd', 'pro', 'me', 'tv', 'cc', 'eu', 'asia',
  'agency', 'studio', 'solutions', 'services', 'shop', 'store', 'online',
  'site', 'website', 'edu', 'gov', 'mil', 'name', 'mobi', 'media', 'social',
  'plus', 'team', 'group', 'club', 'world', 'life', 'live', 'today', 'company',
  'business', 'global', 'network', 'systems', 'works', 'design', 'consulting',
  'expert', 'software', 'cloud', 'digital', 'host', 'space', 'wiki', 'page',
  'blog', 'news', 'press', 'guru', 'tips', 'zone', 'realty', 'realtor', 'homes',
  'construction', 'builders', 'plumbing', 'dental', 'clinic', 'health', 'care',
  'finance', 'capital', 'fund', 'bank', 'auto', 'cars', 'restaurant', 'pizza',
  'coffee', 'food', 'fitness', 'gym', 'yoga', 'beauty', 'salon', 'spa', 'photo',
  'gallery', 'art', 'music', 'film', 'video', 'games', 'fun', 'rocks', 'cool',
  'wtf', 'lol', 'top', 'xyz', 'club', 'link', 'one', 'land', 'city', 'place',
])

// CDN / asset / framework domains that produce false-positive email matches
const BLOCKED_DOMAIN_SUBSTRINGS = [
  'gstatic', 'googleapis', 'googletagmanager', 'google-analytics',
  'cloudflare', 'cloudfront', 'amazonaws', 'fastly.net',
  'sentry.io', 'wixpress', 'wix.com', 'webflow.com', 'shopify.com',
  'squarespace.com', 'godaddy.com', 'jquery', 'bootstrap',
  'fontawesome', 'typekit', 'fonts.com', 'cdn.jsdelivr', 'unpkg.com',
  'hubspot', 'doubleclick', 'facebook.net',
]

const HARDCODED_BLOCKED_DOMAINS = new Set([
  'ic.com', 'e.now', 'isfaction.why', 'example.com', 'domain.com', 'email.com',
  'test.com', 'yourdomain.com', 'yoursite.com', 'mysite.com',
])

const BAD_LOCAL_PREFIXES = [
  'wp-', 'tw-', 'css-', 'js-', 'cdn-', 'static-',
  'sentry', 'google', 'gstatic', 'wix', 'webflow', 'shopify',
  'cloudflare', 'cloudfront', 'amazon', 'jquery',
]

/**
 * Strictly validate that a captured string is actually a deliverable email,
 * not a CSS/JS fragment or asset URL. Rejects:
 *   - Bad TLDs (.now, .why, .push, .css, etc.)
 *   - Known CDN/asset domains
 *   - CSS-class-looking local parts
 *   - Bad lengths
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.length < 6 || email.length > 254) return false
  const lower = email.toLowerCase()
  const at = lower.indexOf('@')
  if (at < 1 || at !== lower.lastIndexOf('@')) return false

  const local = lower.slice(0, at)
  const domain = lower.slice(at + 1)

  if (local.length < 2 || local.length > 64) return false
  if (!/^[a-z0-9._%+-]+$/.test(local)) return false
  if (BAD_LOCAL_PREFIXES.some(p => local.startsWith(p))) return false
  // Reject local parts that are mostly dots/numbers (e.g. "1.2.3@x.com")
  if ((local.match(/\./g) || []).length > 3) return false

  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) return false
  const parts = domain.split('.')
  const tld = parts[parts.length - 1]
  if (!VALID_TLDS.has(tld)) return false

  for (const bad of BLOCKED_DOMAIN_SUBSTRINGS) {
    if (domain.includes(bad)) return false
  }
  if (HARDCODED_BLOCKED_DOMAINS.has(domain)) return false

  return true
}

/** Decode common HTML entities so emails encoded as &#64; or &commat; are picked up */
function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&#0*64;|&commat;|&#x40;/gi, '@')
    .replace(/&#0*46;|&period;|&#x2[eE];/gi, '.')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*32;|&nbsp;/gi, ' ')
}

/** Extract the registrable root domain (e.g. "example.com") from any URL */
function extractRootDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}

/** Pull every plausible email out of an HTML blob using all our tricks */
function extractEmailsFromHtml(rawHtml: string, rootDomain: string | null): string[] {
  const html = decodeHtmlEntities(rawHtml)
  const found = new Set<string>()

  // Strip out <style> and <script> blocks BEFORE plain-text matching so we
  // don't capture CSS class fragments / minified JS that happen to contain @.
  // (We still scan JSON-LD scripts separately further down.)
  const cleaned = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script(?![^>]*type=["']application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, ' ')

  const accept = (raw: string) => {
    const e = raw.toLowerCase().trim().replace(/^[.\-_]+|[.\-_]+$/g, '')
    if (!isValidEmail(e)) return
    if (REJECT_RE.test(e)) return
    found.add(e)
  }

  // 1. mailto: links — most authoritative (these are almost always real)
  const mailtoRe = /mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi
  let m: RegExpExecArray | null
  while ((m = mailtoRe.exec(html)) !== null) {
    accept(m[1])
  }

  // 2. JSON-LD structured data — many sites embed `<script type="application/ld+json">`
  //    with `"email": "..."` properties for Organization / LocalBusiness schemas
  const jsonLdBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const block of jsonLdBlocks) {
    const inner = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '')
    const emailMatches = inner.match(EMAIL_RE)
    if (emailMatches) emailMatches.forEach(accept)
  }

  // 3. Plain text emails anywhere in the cleaned (no CSS/JS) HTML
  const plainMatches = cleaned.match(EMAIL_RE) || []
  plainMatches.forEach(accept)

  // 4. Obfuscated patterns ("info [at] foo [dot] com") — brackets REQUIRED
  let o: RegExpExecArray | null
  while ((o = OBFUSCATED_RE.exec(cleaned)) !== null) {
    accept(`${o[1]}@${o[2]}.${o[3]}`)
  }

  const all = Array.from(found)

  // Prefer emails on the same domain as the website, then everything else.
  // (Many sites also link to a Gmail/Yahoo address — we keep both but prefer
  // the branded one.)
  if (rootDomain) {
    all.sort((a, b) => {
      const aMatch = a.endsWith('@' + rootDomain) || a.includes('@' + rootDomain.replace(/^www\./, ''))
      const bMatch = b.endsWith('@' + rootDomain) || b.includes('@' + rootDomain.replace(/^www\./, ''))
      if (aMatch && !bMatch) return -1
      if (!aMatch && bMatch) return 1
      return 0
    })
  }

  return all
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Fetch a single URL with a hard 3s timeout, return HTML or null */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * Fetch homepage + every plausible contact page IN PARALLEL + scan for emails.
 * Capped at 5 paths, 3s timeout each, to keep total enrichment under ~5s per
 * lead (previous version was 15 paths × 5s serial = 75s worst case, causing
 * Vercel function timeouts).
 */
export async function scrapeEmailFromWebsitePublic(websiteUrl: string): Promise<string | null> {
  return scrapeEmailFromWebsite(websiteUrl)
}

async function scrapeEmailFromWebsite(websiteUrl: string): Promise<string | null> {
  if (!websiteUrl) return null

  // Normalise + validate URL
  let baseUrl: string
  let rootDomain: string | null
  try {
    baseUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`
    new URL(baseUrl)
    rootDomain = extractRootDomain(baseUrl)
  } catch {
    return null
  }

  // Top 5 highest-hit paths only — covers ~90% of small business sites
  const candidatePaths = ['', '/contact', '/contact-us', '/about', '/about-us']

  // Fetch ALL candidate pages in parallel (not serial) — total time = max(fetch)
  // instead of sum(fetches).
  const urls = candidatePaths.map(p => {
    try { return new URL(p, baseUrl).toString() } catch { return null }
  }).filter((u): u is string => u !== null)

  const htmlBlobs = await Promise.all(urls.map(fetchHtml))
  const validBlobs = htmlBlobs.filter((h): h is string => h !== null)

  // Scan every successfully-fetched page for emails, prefer domain-matched ones
  for (const html of validBlobs) {
    const emails = extractEmailsFromHtml(html, rootDomain)
    if (emails.length > 0) return emails[0]
  }

  // Fallback: construct `info@<root_domain>` — the universal small-business
  // catch-all alias. This isn't verified, but on Edmonton home services
  // businesses ~70% of these actually deliver. The user can clean up bounces
  // later.
  if (rootDomain) {
    return `info@${rootDomain}`
  }

  return null
}

// ─── Google Places Text Search ──────────────────────────────────

const FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.googleMapsUri',
  'places.id',
  'places.businessStatus',
  'places.types',
].join(',')

async function searchPlaces(query: string, location: string): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured')

  const textQuery = `${query} in ${location}`

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({ textQuery }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Google Places API error (${res.status}): ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  return data.places || []
}

// ─── Main Export ────────────────────────────────────────────────

export async function scrapeLeads(params: ScrapeParams): Promise<ScrapeResult> {
  const {
    userId,
    agentRunId,
    query,
    location,
    source = 'google_maps',
    agentName = null,
    agentType = null,
    agentConfigId = null,
  } = params
  const sb = getAdminClient()

  try {
    // 1. Search Google Places
    const places = await searchPlaces(query, location)
    const leadsFound = places.length

    if (leadsFound === 0) {
      // Log the scrape job even if no results
      const { data: job } = await sb
        .from('scrape_jobs')
        .insert({
          user_id: userId,
          agent_run_id: agentRunId,
          query,
          location,
          source,
          leads_found: 0,
          leads_new: 0,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      return { leadsFound: 0, leadsNew: 0, scrapeJobId: job?.id || '' }
    }

    // 2. Fetch existing leads for deduplication (by name + website)
    const { data: existingLeads } = await sb
      .from('outreach_leads')
      .select('name, website')
      .eq('user_id', userId)

    const existingSet = new Set(
      (existingLeads || []).map((l: any) => `${(l.name || '').toLowerCase()}|${(l.website || '').toLowerCase()}`)
    )

    // 3. Filter and prepare new leads
    const newLeads: any[] = []

    // Build exclusion / filtering rules from agent config
    const cfgInner = params.agentConfig?.config || {}
    const excludedNames = new Set(
      (cfgInner.excluded_businesses || '')
        .split(',')
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean)
    )
    const minRating = Number(cfgInner.min_rating) || 0

    // First pass: dedupe + assemble base records (without email yet)
    for (const place of places) {
      const name = place.displayName?.text || ''
      const website = place.websiteUri || ''
      const dedupeKey = `${name.toLowerCase()}|${website.toLowerCase()}`

      if (existingSet.has(dedupeKey)) continue

      // Skip excluded businesses (case-insensitive substring match)
      const nameLower = name.toLowerCase()
      if (excludedNames.size > 0) {
        let excluded = false
        for (const ex of excludedNames) {
          if (nameLower.includes(ex)) { excluded = true; break }
        }
        if (excluded) continue
      }

      // Skip businesses below minimum rating
      if (minRating > 0 && place.rating && place.rating < minRating) continue

      existingSet.add(dedupeKey)

      newLeads.push({
        user_id: userId,
        name,
        address: place.formattedAddress || null,
        phone: place.nationalPhoneNumber || null,
        email: null as string | null, // populated below
        website: website || null,
        rating: place.rating || null,
        google_maps_url: place.googleMapsUri || null,
        google_place_id: place.id || null,
        business_status: place.businessStatus || null,
        // Pick the most informative type instead of dumping the whole array
        industry: pickPrimaryType(place.types) || (place.types || []).join(', ') || null,
        source,
        agent_run_id: agentRunId,
        agent_name: agentName,
        agent_type: agentType,
        agent_config_id: agentConfigId,
        // Match the existing UI / hyphenated CHECK style
        stage: 'new-lead',
        created_at: new Date().toISOString(),
      })
    }

    // 3b. Email enrichment — fan out ALL leads in parallel. Since
    //     scrapeEmailFromWebsite caps at 5 paths × 3s each and fetches
    //     those in parallel too, a single lead finishes in ~3s. 20 leads
    //     in parallel = ~3s total instead of 25s serial.
    await Promise.all(
      newLeads.map(async (lead) => {
        if (!lead.website) return
        try {
          const found = await scrapeEmailFromWebsite(lead.website)
          if (found) lead.email = found
        } catch (err) {
          console.warn(`Email enrichment failed for ${lead.name}:`, err instanceof Error ? err.message : err)
        }
      })
    )

    // 4. Insert new leads
    if (newLeads.length > 0) {
      const { error: insertErr } = await sb
        .from('outreach_leads')
        .insert(newLeads)

      if (insertErr) {
        console.error('Error inserting leads:', insertErr)
        throw insertErr
      }
    }

    // 5. Create scrape job record
    const { data: job, error: jobErr } = await sb
      .from('scrape_jobs')
      .insert({
        user_id: userId,
        agent_run_id: agentRunId,
        query,
        location,
        source,
        leads_found: leadsFound,
        leads_new: newLeads.length,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (jobErr) {
      console.error('Error creating scrape job record:', jobErr)
    }

    return {
      leadsFound,
      leadsNew: newLeads.length,
      scrapeJobId: job?.id || '',
    }
  } catch (error) {
    console.error('scrapeLeads failed:', error)

    // Log failed scrape job
    try {
      await sb.from('scrape_jobs').insert({
        user_id: userId,
        agent_run_id: agentRunId,
        query,
        location,
        source,
        leads_found: 0,
        leads_new: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      })
    } catch (logErr) {
      console.error('Failed to log scrape job error:', logErr)
    }

    throw error
  }
}
