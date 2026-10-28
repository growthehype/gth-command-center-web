// Website content analyzer — scrapes a lead's website to extract
// structured intelligence before AI scoring and email personalization.
import { askClaude, extractToolUse } from './claude'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

// ─── Types ──────────────────────────────────────────────────────

export interface WebsiteIntel {
  summary: string
  services: string[]
  decisionMakers: { name: string; title: string }[]
  techSignals: string[]
  hasContactForm: boolean
  hasBlog: boolean
  copyrightYear: string | null
  socialLinks: string[]
  contentSnippet: string
  websiteQuality: 'professional' | 'basic' | 'template' | 'none'
  audit?: WebsiteAudit
}

export interface WebsiteAudit {
  reachable: boolean
  https: boolean
  mobileReady: boolean
  loadMs: number | null
  pageKb: number | null
  builder: string | null
  bookingTool: string | null
  hasOnlineBooking: boolean
  hasQuoteForm: boolean
  chatWidget: boolean
  copyrightYear: string | null
  /** A working contact or enquiry form (not a search box), incl. embedded form tools */
  hasForm?: boolean
  /** e.g. "Book a free consultation" found on the homepage */
  ctaPhrase?: string | null
  /** true = the CTA leads nowhere online (phone/email only); false = it works; null = couldn't tell */
  ctaWithoutAction?: boolean | null
  issues: string[]
}

const EMPTY_INTEL: WebsiteIntel = {
  summary: '',
  services: [],
  decisionMakers: [],
  techSignals: [],
  hasContactForm: false,
  hasBlog: false,
  copyrightYear: null,
  socialLinks: [],
  contentSnippet: '',
  websiteQuality: 'none',
}

// ─── Fetch ──────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null
    return await res.text()
  } catch {
    return null
  }
}

// ─── HTML → Text ────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Decision Maker Extraction ──────────────────────────────────

const TITLE_RE = /\b(CEO|President|Founder|Owner|Principal|Director|Managing\s+Partner|General\s+Manager|Partner)\b/gi

function extractDecisionMakers(html: string): { name: string; title: string }[] {
  const results: { name: string; title: string }[] = []

  // Pattern 1: JSON-LD Person/Organization
  const ldMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const m of ldMatches) {
    try {
      const jsonStr = m.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim()
      const data = JSON.parse(jsonStr)
      const people = Array.isArray(data) ? data : [data]
      for (const p of people) {
        if (p['@type'] === 'Person' && p.name) {
          results.push({ name: p.name, title: p.jobTitle || 'Owner' })
        }
        // Check founder/employee arrays
        for (const key of ['founder', 'employee', 'member']) {
          const arr = Array.isArray(p[key]) ? p[key] : p[key] ? [p[key]] : []
          for (const person of arr) {
            if (person.name) {
              results.push({ name: person.name, title: person.jobTitle || key })
            }
          }
        }
      }
    } catch { /* malformed JSON-LD */ }
  }

  // Pattern 2: Look for title keywords near names in plain text
  // Match patterns like "John Smith, CEO" or "CEO - Jane Doe" or "Owner: Bob Jones"
  const text = stripHtml(html)
  const nameNearTitle = /([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[,\-–|]\s*(CEO|President|Founder|Owner|Principal|Director|Managing Partner|General Manager)/gi
  const titleNearName = /(CEO|President|Founder|Owner|Principal|Director|Managing Partner|General Manager)\s*[,\-–|:]\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/gi

  let match
  while ((match = nameNearTitle.exec(text)) !== null) {
    if (match[1].length < 40) results.push({ name: match[1].trim(), title: match[2].trim() })
  }
  while ((match = titleNearName.exec(text)) !== null) {
    if (match[2].length < 40) results.push({ name: match[2].trim(), title: match[1].trim() })
  }

  // Dedupe by name
  const seen = new Set<string>()
  return results.filter(r => {
    const key = r.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 5) // cap at 5
}

// ─── Service Extraction ─────────────────────────────────────────

function extractServices(text: string): string[] {
  const services: string[] = []
  // Look for bulleted/listed service items (common patterns)
  const servicePatterns = [
    /(?:our |we offer |services include |we (?:provide|specialize in) )([^.]{10,120})/gi,
  ]
  for (const re of servicePatterns) {
    let m
    while ((m = re.exec(text)) !== null) {
      const items = m[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 3 && s.length < 60)
      services.push(...items)
    }
  }
  return [...new Set(services)].slice(0, 10)
}

// ─── Tech / Platform Signals ────────────────────────────────────

function extractTechSignals(html: string): string[] {
  const signals: string[] = []
  const lower = html.toLowerCase()

  if (lower.includes('shopify') || lower.includes('myshopify.com')) signals.push('Shopify')
  if (lower.includes('wordpress') || lower.includes('wp-content')) signals.push('WordPress')
  if (lower.includes('squarespace')) signals.push('Squarespace')
  if (lower.includes('wix.com') || lower.includes('wixpress')) signals.push('Wix')
  if (lower.includes('godaddy')) signals.push('GoDaddy')
  if (lower.includes('webflow')) signals.push('Webflow')
  if (lower.includes('react') && lower.includes('__next')) signals.push('Next.js')
  if (lower.includes('hubspot')) signals.push('HubSpot')
  if (lower.includes('salesforce')) signals.push('Salesforce')
  if (lower.includes('mailchimp')) signals.push('Mailchimp')
  if (lower.includes('weebly')) signals.push('Weebly')
  if (lower.includes('jimdo')) signals.push('Jimdo')
  if (lower.includes('duda') || lower.includes('dudamobile')) signals.push('Duda')
  if (lower.includes('site123')) signals.push('Site123')

  return signals
}

// ─── Social Links ───────────────────────────────────────────────

function extractSocialLinks(html: string): string[] {
  const socials: string[] = []
  const socialRe = /href=["'](https?:\/\/(?:www\.)?(?:linkedin|facebook|instagram|twitter|x)\.com\/[^"']+)["']/gi
  let m
  while ((m = socialRe.exec(html)) !== null) {
    socials.push(m[1])
  }
  return [...new Set(socials)].slice(0, 6)
}

// ─── Website Quality Assessment ─────────────────────────────────

function assessQuality(html: string, text: string, techSignals: string[], socialLinks: string[]): 'professional' | 'basic' | 'template' | 'none' {
  let score = 0

  // Content depth
  if (text.length > 1000) score += 2
  else if (text.length > 300) score += 1

  // Has real navigation
  if (html.includes('<nav')) score += 1

  // Social presence
  if (socialLinks.length >= 2) score += 1

  // Professional CMS
  if (techSignals.includes('WordPress') || techSignals.includes('Webflow') || techSignals.includes('Next.js')) score += 1

  // Template builders (lower quality signal)
  if (techSignals.includes('Wix') || techSignals.includes('GoDaddy') || techSignals.includes('Squarespace')) {
    return text.length > 500 ? 'basic' : 'template'
  }

  // Meta description present
  if (/<meta[^>]*name=["']description["']/i.test(html)) score += 1

  // SSL / canonical
  if (/<link[^>]*rel=["']canonical["']/i.test(html)) score += 1

  if (score >= 5) return 'professional'
  if (score >= 2) return 'basic'
  return 'template'
}

// ─── Copyright Year ─────────────────────────────────────────────

function extractCopyrightYear(html: string): string | null {
  // Only visible page text: theme CSS/JS files and comments carry their own
  // copyright years (that is how "2011" ended up in an email). Take the
  // latest year in any copyright line, e.g. "2011 - 2024" means 2024.
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&copy;|&#169;/gi, '©')
  const years: number[] = []
  for (const m of visible.matchAll(/(?:©|copyright)[^.\n]{0,40}/gi)) {
    for (const y of m[0].match(/\b(19|20)\d{2}\b/g) || []) years.push(Number(y))
  }
  const now = new Date().getFullYear()
  const ok = years.filter(y => y > 1990 && y <= now + 1)
  return ok.length ? String(Math.max(...ok)) : null
}

// ─── GTH audit: concrete, checkable gaps ────────────────────────

const BOOKING_TOOLS: [RegExp, string][] = [
  [/janeapp|jane\.app/i, 'Jane App'],
  [/calendly/i, 'Calendly'],
  [/acuityscheduling|squareup\.com\/appointments|square appointments/i, 'Acuity/Square'],
  [/clinicsense|noterro|cliniko|mindbody|vagaro|fresha|booksy|setmore|simplybook|zocdoc|dentrix|dentalhub|book\.dental|nexhealth|localmed|carecru/i, 'online booking platform'],
  [/housecallpro|jobber|servicetitan|getjobber/i, 'field-service booking'],
]

function auditSite(html: string, finalUrl: string, loadMs: number | null, copyrightYear: string | null, techSignals: string[]): WebsiteAudit {
  const lower = html.toLowerCase()
  const https = finalUrl.startsWith('https://')
  const mobileReady = /<meta[^>]+name=["']viewport["'][^>]*width=device-width/i.test(html)
  const pageKb = Math.round(html.length / 1024)
  const builder = techSignals.find(t => ['Wix', 'GoDaddy', 'Squarespace', 'Weebly', 'Jimdo', 'Duda', 'Site123', 'WordPress', 'Webflow', 'Shopify'].includes(t)) || null
  let bookingTool: string | null = null
  for (const [re, name] of BOOKING_TOOLS) {
    if (re.test(lower)) { bookingTool = name; break }
  }
  const hasForm = detectForm(html)
  // Booking only counts when something actually takes the booking: a booking
  // tool, a booking page link, or a form about appointments. A "Book now"
  // sentence on its own is a call to action, not a way to book.
  const bookingLink = /href=["'][^"']*\/(book|booking|bookings|appointments?|schedule|request-an-appointment)(\/|["'?#])/i.test(html)
  const bookingForm = hasForm && /<form[\s\S]{0,4000}?(appointment|booking|preferred (date|time))/i.test(html)
  const hasOnlineBooking = !!bookingTool || bookingLink || bookingForm
  const hasQuoteForm = hasForm && /(free )?(quote|estimate)/i.test(html)
  const chatWidget = /intercom|drift\.com|tawk\.to|livechat|crisp\.chat|zendesk|tidio|hubspot-messages|olark/i.test(lower)

  const issues: string[] = []
  if (!https) issues.push('site is not on HTTPS (browsers show "Not secure")')
  if (!mobileReady) issues.push('no mobile viewport, the site is not set up for phones')
  if (copyrightYear && Number(copyrightYear) <= new Date().getFullYear() - 3) issues.push(`footer copyright still says ${copyrightYear}`)
  if (loadMs && loadMs > 3500) issues.push(`homepage took about ${Math.round(loadMs / 100) / 10}s to respond`)
  if (!hasOnlineBooking) issues.push('no online booking found')
  if (builder && ['Wix', 'GoDaddy', 'Weebly', 'Jimdo', 'Site123', 'Duda'].includes(builder)) issues.push(`built on a template builder (${builder})`)
  if (/<table[^>]+(width|cellpadding)=/i.test(html) && /<font\b/i.test(html)) issues.push('old table and font-tag layout')
  if (/jquery[.-]1\.[0-9]/i.test(lower)) issues.push('very old jQuery 1.x scripts')

  return {
    reachable: true,
    https,
    mobileReady,
    loadMs,
    pageKb,
    builder,
    bookingTool,
    hasOnlineBooking,
    hasQuoteForm,
    chatWidget,
    copyrightYear,
    hasForm,
    ctaPhrase: null,
    ctaWithoutAction: null,
    issues,
  }
}

// ─── Forms and calls to action ──────────────────────────────────

const FORM_TOOLS = /hsforms|hbspt\.forms|gform_|gravityforms|wpcf7|contact-form-7|wpforms|ninja-forms|formidable|formspree|jotform|typeform|cognitoforms|wufoo|elementor-form|fluentform|forminator|squarespace-form|wixforms|form-block|calendly|janeapp/i

/** A real contact/enquiry form, not a search or newsletter box. */
export function detectForm(html: string): boolean {
  if (FORM_TOOLS.test(html)) return true
  const forms = html.match(/<form[\s\S]*?<\/form>/gi) || []
  return forms.some(f => /<textarea/i.test(f) || (/type=["']?(email|tel)/i.test(f) && /name=["']?[^"'>]*(name|message|phone)/i.test(f)))
}

const CTA_RE = /\b(book (?:a |an |your )?(?:free )?(?:consultation|appointment|call|session|visit|assessment)|book now|book online|schedule (?:a |an |your )?(?:free )?(?:consultation|appointment|call)|get (?:a |your )?(?:free )?(?:quote|estimate)|request (?:a |an )?(?:free )?(?:quote|estimate|consultation|appointment)|free (?:quote|estimate|consultation))\b/i

/**
 * Find the homepage's main call to action and check whether it actually
 * leads somewhere you can act online. Follows the CTA link one hop.
 */
async function checkCta(html: string, baseUrl: string, audit: WebsiteAudit): Promise<{ phrase: string | null; without: boolean | null }> {
  const text = stripHtml(html)
  const m = text.match(CTA_RE)
  if (!m) return { phrase: null, without: null }
  const phrase = m[0].replace(/\s+/g, ' ').trim()
  if (audit.bookingTool || audit.hasOnlineBooking || audit.hasForm) return { phrase, without: false }

  // Find an <a> whose text carries the CTA and follow it
  const anchors = html.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]{0,300}?<\/a>/gi) || []
  const hit = anchors.find(a => CTA_RE.test(stripHtml(a)))
  if (!hit) return { phrase, without: null }
  const href = (hit.match(/href=["']([^"']+)["']/i) || [])[1] || ''
  if (/^(tel:|mailto:)/i.test(href)) return { phrase, without: true }
  if (/^#/.test(href)) return { phrase, without: null }
  let target: string
  try { target = new URL(href, baseUrl).toString() } catch { return { phrase, without: null } }
  if (!target.startsWith(new URL(baseUrl).origin)) {
    // Off-site booking or form tool counts as working
    return { phrase, without: false }
  }
  const page = await fetchPage(target)
  if (!page) return { phrase, without: null }
  const lower = page.toLowerCase()
  const works = detectForm(page) || BOOKING_TOOLS.some(([re]) => re.test(lower))
  return { phrase, without: !works }
}

async function fetchHomepageTimed(url: string): Promise<{ html: string | null; finalUrl: string; ms: number | null }> {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(6000) })
    const ms = Date.now() - t0
    if (!res.ok) return { html: null, finalUrl: res.url || url, ms }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return { html: null, finalUrl: res.url || url, ms }
    return { html: await res.text(), finalUrl: res.url || url, ms }
  } catch {
    return { html: null, finalUrl: url, ms: null }
  }
}

// ─── Main Export ────────────────────────────────────────────────

export async function analyzeWebsite(websiteUrl: string | null | undefined): Promise<WebsiteIntel> {
  if (!websiteUrl) return EMPTY_INTEL

  try {
    // Normalize URL
    let base = websiteUrl.trim()
    if (!base.startsWith('http')) base = 'https://' + base
    const url = new URL(base)
    const origin = url.origin

    // Fetch homepage (timed, follows redirects) + about page in parallel.
    // Try the URL as given first so http-only sites are detected honestly.
    const [home, aboutHtml] = await Promise.all([
      fetchHomepageTimed(websiteUrl.trim().startsWith('http') ? websiteUrl.trim() : origin),
      fetchPage(`${origin}/about`).then(h => h || fetchPage(`${origin}/about-us`)).then(h => h || fetchPage(`${origin}/our-team`)),
    ])

    const homepageHtml = home.html
    if (!homepageHtml) {
      return {
        ...EMPTY_INTEL,
        websiteQuality: 'none',
        audit: {
          reachable: false, https: false, mobileReady: false, loadMs: home.ms, pageKb: null,
          builder: null, bookingTool: null, hasOnlineBooking: false, hasQuoteForm: false,
          chatWidget: false, copyrightYear: null, hasForm: false, ctaPhrase: null, ctaWithoutAction: null,
          issues: ['website did not load when we checked it'],
        },
      }
    }

    const combinedHtml = homepageHtml + (aboutHtml || '')
    const homepageText = stripHtml(homepageHtml)
    const aboutText = aboutHtml ? stripHtml(aboutHtml) : ''
    const fullText = homepageText + ' ' + aboutText

    // Extract all signals in parallel (all CPU-bound, no IO)
    const decisionMakers = extractDecisionMakers(combinedHtml)
    const services = extractServices(fullText)
    const techSignals = extractTechSignals(combinedHtml)
    const socialLinks = extractSocialLinks(combinedHtml)
    const copyrightYear = extractCopyrightYear(homepageHtml)
    const websiteQuality = assessQuality(homepageHtml, homepageText, techSignals, socialLinks)

    const hasContactForm = /<form[^>]*>/i.test(combinedHtml) && /(?:contact|message|inquiry|get.in.touch)/i.test(combinedHtml)
    const hasBlog = /\/blog|\/news|\/articles|\/posts/i.test(combinedHtml)

    // Build content snippet for Claude (first 1500 chars of meaningful text)
    const contentSnippet = fullText.slice(0, 1500)

    // Build summary (first 2 sentences of homepage)
    const sentences = homepageText.match(/[^.!?]+[.!?]+/g) || []
    const summary = sentences.slice(0, 3).join(' ').slice(0, 300)

    const audit = auditSite(homepageHtml, home.finalUrl, home.ms, copyrightYear, techSignals)
    try {
      const cta = await checkCta(homepageHtml, home.finalUrl || origin, audit)
      audit.ctaPhrase = cta.phrase
      audit.ctaWithoutAction = cta.without
      if (cta.without) audit.issues.push(`homepage says "${cta.phrase}" but there is no way to do it online`)
    } catch { /* CTA check is best effort */ }

    return {
      audit,
      summary,
      services,
      decisionMakers,
      techSignals,
      hasContactForm,
      hasBlog,
      copyrightYear,
      socialLinks,
      contentSnippet,
      websiteQuality,
    }
  } catch (err) {
    console.warn('Website analysis failed:', err instanceof Error ? err.message : err)
    return EMPTY_INTEL
  }
}


// ─── Visual check: PageSpeed Insights + Claude looking at the site ──

export interface PageSpeedResult {
  perf: number | null
  seo: number | null
  accessibility: number | null
  screenshot: string | null // data:image/jpeg;base64,...
}

/** Lighthouse via PageSpeed Insights (mobile). Never throws; null on failure. */
export async function runPageSpeed(url: string, timeoutMs = 35_000): Promise<PageSpeedResult | null> {
  let target = url.trim()
  if (!target.startsWith('http')) target = 'https://' + target
  const base = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
  const qs = `url=${encodeURIComponent(target)}&strategy=mobile&category=performance&category=seo&category=accessibility`
  const key = process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PLACES_API_KEY || ''

  const attempt = async (withKey: boolean) => {
    const res = await fetch(`${base}?${qs}${withKey && key ? `&key=${encodeURIComponent(key)}` : ''}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data: any = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  }

  try {
    let r = await attempt(true)
    // Key not enabled for PageSpeed (403/400): try the keyless quota once
    if (!r.ok && key && (r.status === 403 || r.status === 400)) r = await attempt(false)
    if (!r.ok || !r.data?.lighthouseResult) return null
    const lh = r.data.lighthouseResult
    const pct = (v: any) => (typeof v === 'number' ? Math.round(v * 100) : null)
    return {
      perf: pct(lh.categories?.performance?.score),
      seo: pct(lh.categories?.seo?.score),
      accessibility: pct(lh.categories?.accessibility?.score),
      screenshot: lh.audits?.['final-screenshot']?.details?.data || null,
    }
  } catch {
    return null
  }
}

export type DesignVerdict = 'dated' | 'average' | 'modern'

const DESIGN_TOOL = [{
  name: 'rate_design',
  description: 'Judge how current the website looks from the screenshot',
  input_schema: {
    type: 'object' as const,
    properties: {
      verdict: { type: 'string', enum: ['dated', 'average', 'modern'] },
      note: { type: 'string', description: 'One short plain sentence about what you see, e.g. "small grey text and clip-art icons, looks around 2012"' },
    },
    required: ['verdict', 'note'],
  },
}]

const DESIGN_PROMPT = `You look at a screenshot of a small business homepage (as seen on a phone) and judge how current the design looks to a customer today.
- "modern": clean, current layout, good type and imagery, would not embarrass the business in 2026.
- "average": works and is tidy but generic or a few years old; nothing a customer would notice as broken.
- "dated": clearly old or neglected: cramped or tiny text, desktop layout squeezed onto a phone, stock clip-art, heavy gradients or bevels, broken images, cookie-cutter template that looks a decade old.
Judge only what is visible. If the screenshot is blank, a cookie banner or an error page, say "average" and note that you could not see the page.`

/** Ask Claude to judge the screenshot. Null when it can't. */
export async function judgeDesign(screenshotDataUri: string, businessName: string): Promise<{ verdict: DesignVerdict; note: string } | null> {
  const m = screenshotDataUri.match(/^data:(image\/[a-z]+);base64,(.+)$/)
  if (!m) return null
  try {
    const response = await askClaude({
      systemPrompt: DESIGN_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: `Homepage of ${businessName}. Rate it with rate_design.` },
        ],
      }],
      tools: DESIGN_TOOL,
      tier: 'write',
      maxTokens: 300,
    })
    const tool = extractToolUse(response)
    const v = tool?.input?.verdict
    if (v !== 'dated' && v !== 'average' && v !== 'modern') return null
    return { verdict: v, note: String(tool.input.note || '').trim().slice(0, 200) }
  } catch {
    return null
  }
}
