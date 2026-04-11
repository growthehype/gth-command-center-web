// Website content analyzer — scrapes a lead's website to extract
// structured intelligence before AI scoring and email personalization.

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
  const m = html.match(/(?:©|&copy;|copyright)\s*(\d{4})/i)
  return m ? m[1] : null
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

    // Fetch homepage + about page in parallel
    const [homepageHtml, aboutHtml] = await Promise.all([
      fetchPage(origin),
      fetchPage(`${origin}/about`).then(h => h || fetchPage(`${origin}/about-us`)).then(h => h || fetchPage(`${origin}/our-team`)),
    ])

    if (!homepageHtml) return { ...EMPTY_INTEL, websiteQuality: 'none' }

    const combinedHtml = homepageHtml + (aboutHtml || '')
    const homepageText = stripHtml(homepageHtml)
    const aboutText = aboutHtml ? stripHtml(aboutHtml) : ''
    const fullText = homepageText + ' ' + aboutText

    // Extract all signals in parallel (all CPU-bound, no IO)
    const decisionMakers = extractDecisionMakers(combinedHtml)
    const services = extractServices(fullText)
    const techSignals = extractTechSignals(combinedHtml)
    const socialLinks = extractSocialLinks(combinedHtml)
    const copyrightYear = extractCopyrightYear(combinedHtml)
    const websiteQuality = assessQuality(homepageHtml, homepageText, techSignals, socialLinks)

    const hasContactForm = /<form[^>]*>/i.test(combinedHtml) && /(?:contact|message|inquiry|get.in.touch)/i.test(combinedHtml)
    const hasBlog = /\/blog|\/news|\/articles|\/posts/i.test(combinedHtml)

    // Build content snippet for Claude (first 1500 chars of meaningful text)
    const contentSnippet = fullText.slice(0, 1500)

    // Build summary (first 2 sentences of homepage)
    const sentences = homepageText.match(/[^.!?]+[.!?]+/g) || []
    const summary = sentences.slice(0, 3).join(' ').slice(0, 300)

    return {
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
