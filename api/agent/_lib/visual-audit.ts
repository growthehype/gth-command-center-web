// Looks at a prospect's website the way Omar would: real screenshots of the
// live page (phone and desktop, top to footer), read by Claude. Anything the
// agent says about a site must be visible here first.
import { askClaude, extractToolUse } from './claude'
import { getAdminClient } from './supabase-admin'
import { captureWithBrowser, type BrowserCapture } from './browser'

export interface SiteShots {
  mobileTop: string | null      // data URI
  desktopTop: string | null
  desktopFooter: string | null
  desktopMiddle: string | null
  perfMobile: number | null
  perfDesktop: number | null
  seo: number | null
  accessibility: number | null
  /** What a real browser saw (null if it couldn't start) */
  browser: BrowserCapture | null
  /** True when at least one method actually rendered the page */
  loaded: boolean
  /** True only when every method tried and the page would not load */
  confirmedDown: boolean
  source: 'browser' | 'pagespeed' | 'none'
  captureError?: string | null
}

export interface VisualFinding {
  key: 'design' | 'footer_year' | 'no_booking' | 'no_form' | 'cta_dead_end' | 'not_mobile' | 'broken' | 'placeholder' | 'other'
  claim: string      // how Omar would say it to the owner
  evidence: string   // exactly what is visible, quoted, and where
}

export interface VisualAudit {
  checked: boolean
  design_verdict: 'dated' | 'average' | 'modern' | 'unknown'
  design_note: string
  footer_text: string | null
  footer_year: number | null
  booking_visible: 'yes' | 'no' | 'unclear'
  form_visible: 'yes' | 'no' | 'unclear'
  main_cta: string | null
  findings: VisualFinding[]
  urls: { mobile_top?: string | null; desktop_top?: string | null; desktop_footer?: string | null; desktop_middle?: string | null }
  checked_at: string
}

// ─── Capture ────────────────────────────────────────────────────

async function psi(url: string, strategy: 'mobile' | 'desktop', timeoutMs: number): Promise<any | null> {
  let target = url.trim()
  if (!target.startsWith('http')) target = 'https://' + target
  const key = process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PLACES_API_KEY || ''
  const qs = `url=${encodeURIComponent(target)}&strategy=${strategy}&category=performance&category=seo&category=accessibility`
  const go = async (withKey: boolean) => {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}${withKey && key ? `&key=${encodeURIComponent(key)}` : ''}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) }
  }
  try {
    let r = await go(true)
    if (!r.ok && key && (r.status === 403 || r.status === 400)) r = await go(false)
    if (!r.ok) lastPsiError = `PageSpeed ${r.status}: ${String(r.data?.error?.message || '').slice(0, 140)}`
    return r.ok ? r.data?.lighthouseResult || null : null
  } catch (err: any) {
    lastPsiError = `PageSpeed: ${String(err?.message || err).slice(0, 140)}`
    return null
  }
}
let lastPsiError: string | null = null

/** Diagnose both capture methods for one URL (used by the agent's self-test). */
export async function diagnoseCapture(url: string) {
  lastPsiError = null
  const t0 = Date.now()
  const browser = await captureWithBrowser(url).catch((err: any) => ({ ok: false, loaded: false, error: String(err?.message || err) } as any))
  const t1 = Date.now()
  const mob = await psi(url, 'mobile', 40_000)
  return {
    browser: { ok: browser.ok, loaded: browser.loaded, error: browser.error, ms: t1 - t0, footer: browser.footerText?.slice(0, 120) || null, shots: !!browser.desktopTop },
    pagespeed: { ok: !!mob, error: lastPsiError, ms: Date.now() - t1 },
  }
}

/** Crop the top, middle and bottom of a full-page screenshot so text stays readable. */
export async function sliceFullPage(dataUri: string): Promise<{ top: string | null; middle: string | null; footer: string | null }> {
  const m = dataUri.match(/^data:image\/[a-z]+;base64,(.+)$/)
  if (!m) return { top: null, middle: null, footer: null }
  try {
    const sharp = (await import('sharp')).default
    const buf = Buffer.from(m[1], 'base64')
    const meta = await sharp(buf).metadata()
    const W = meta.width || 0
    const H = meta.height || 0
    if (!W || !H) return { top: null, middle: null, footer: null }
    const tileH = Math.min(H, Math.round(W * 1.1))
    const cut = async (top: number) => {
      const t = Math.max(0, Math.min(top, H - tileH))
      const out = await sharp(buf).extract({ left: 0, top: t, width: W, height: tileH })
        .resize({ width: Math.min(W, 1280) }).jpeg({ quality: 78 }).toBuffer()
      return `data:image/jpeg;base64,${out.toString('base64')}`
    }
    const footer = await cut(H - tileH)
    const top = await cut(0)
    const middle = H > tileH * 2.2 ? await cut(Math.round(H / 2 - tileH / 2)) : null
    return { top, middle, footer }
  } catch {
    return { top: null, middle: null, footer: null }
  }
}

export async function captureSite(url: string, timeoutMs = 40_000): Promise<SiteShots> {
  const pct = (v: any) => (typeof v === 'number' ? Math.round(v * 100) : null)
  // Real browser first (accurate), PageSpeed alongside for speed scores and as a backup view
  const [browser, mob] = await Promise.all([
    captureWithBrowser(url).catch((err: any) => ({ ok: false, loaded: false, error: String(err?.message || err) } as BrowserCapture)),
    psi(url, 'mobile', timeoutMs),
  ])
  const psiLoaded = !!mob?.audits?.['final-screenshot']?.details?.data

  if (browser?.loaded) {
    return {
      mobileTop: browser.mobileTop || mob?.audits?.['final-screenshot']?.details?.data || null,
      desktopTop: browser.desktopTop,
      desktopMiddle: browser.desktopMiddle,
      desktopFooter: browser.desktopFooter,
      perfMobile: pct(mob?.categories?.performance?.score),
      perfDesktop: null,
      seo: pct(mob?.categories?.seo?.score),
      accessibility: pct(mob?.categories?.accessibility?.score),
      browser, loaded: true, confirmedDown: false, source: 'browser',
    }
  }

  // Browser couldn't render it: fall back to PageSpeed's own render
  const desk = psiLoaded ? await psi(url, 'desktop', timeoutMs) : null
  const full = desk?.fullPageScreenshot?.screenshot?.data || null
  const slices = full ? await sliceFullPage(full) : { top: null, middle: null, footer: null }
  return {
    mobileTop: mob?.audits?.['final-screenshot']?.details?.data || null,
    desktopTop: slices.top || desk?.audits?.['final-screenshot']?.details?.data || null,
    desktopMiddle: slices.middle,
    desktopFooter: slices.footer,
    perfMobile: pct(mob?.categories?.performance?.score),
    perfDesktop: pct(desk?.categories?.performance?.score),
    seo: pct(mob?.categories?.seo?.score),
    accessibility: pct(mob?.categories?.accessibility?.score),
    browser: browser || null,
    loaded: psiLoaded,
    // Only call a site down when a real browser opened it and failed twice AND Google couldn't render it either
    confirmedDown: !!browser?.ok && !browser.loaded && !psiLoaded,
    source: psiLoaded ? 'pagespeed' : 'none',
    captureError: [browser?.error, lastPsiError].filter(Boolean).join(' | ') || null,
  }
}

// ─── Storage ────────────────────────────────────────────────────

let bucketReady = false
export async function uploadShot(path: string, dataUri: string | null): Promise<string | null> {
  if (!dataUri) return null
  const m = dataUri.match(/^data:(image\/[a-z]+);base64,(.+)$/)
  if (!m) return null
  try {
    const sb = getAdminClient()
    if (!bucketReady) {
      await sb.storage.createBucket('lead-screenshots', { public: true }).catch(() => {})
      bucketReady = true
    }
    const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg'
    const full = `${path}.${ext}`
    const { error } = await sb.storage.from('lead-screenshots').upload(full, Buffer.from(m[2], 'base64'), { contentType: m[1], upsert: true })
    if (error) return null
    const { data } = sb.storage.from('lead-screenshots').getPublicUrl(full)
    return data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : null
  } catch {
    return null
  }
}

/** Fetch a stored screenshot back as a data URI (for fact-checking drafts later). */
export async function fetchShot(url?: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return null
    const type = r.headers.get('content-type') || 'image/jpeg'
    const b = Buffer.from(await r.arrayBuffer())
    return `data:${type.split(';')[0]};base64,${b.toString('base64')}`
  } catch {
    return null
  }
}

export function imageBlocks(labelled: [string, string | null][]): any[] {
  const out: any[] = []
  for (const [label, uri] of labelled) {
    const m = uri?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/)
    if (!m) continue
    out.push({ type: 'text', text: label })
    out.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } })
  }
  return out
}

// ─── Read the screenshots ───────────────────────────────────────

const AUDIT_PROMPT = `You review a local business website from screenshots, the way a careful web designer would before emailing the owner. Accuracy matters more than anything: the owner will check every word against their own site.

Rules:
- Only report what you can actually see in the screenshots. Quote visible text exactly in "evidence" and say which screenshot it is in.
- Never infer something from absence unless the relevant part of the page is clearly in view. A booking button you cannot see might just be off-screen: say "unclear", not "no".
- Footer text: read the copyright line in the footer screenshot exactly as printed. If it is not legible, return null.
- Design: "modern" means clean and current in 2026. "average" means tidy but generic or a few years old. "dated" means clearly old or neglected (tiny text, desktop squeezed onto a phone, clip art, heavy gradients, broken layout).
- Findings are only real, visible problems an owner would agree with on sight. Two or three at most. If the site looks good, return no findings. Do not pad.
- Write each "claim" plainly, as Omar would say it to the owner, without exaggeration.`

const AUDIT_TOOL = [{
  name: 'report_site',
  description: 'Report what is visible on the website screenshots',
  input_schema: {
    type: 'object' as const,
    properties: {
      design_verdict: { type: 'string', enum: ['dated', 'average', 'modern'] },
      design_note: { type: 'string', description: 'One plain sentence about how the site looks' },
      footer_text: { type: 'string', description: 'The copyright line exactly as printed, or empty if not legible' },
      footer_year: { type: 'number', description: 'The latest year printed in the copyright line, or 0 if not legible' },
      booking_visible: { type: 'string', enum: ['yes', 'no', 'unclear'], description: 'Is there a visible way to book or request an appointment/quote online?' },
      form_visible: { type: 'string', enum: ['yes', 'no', 'unclear'], description: 'Is a contact or request form visible?' },
      main_cta: { type: 'string', description: 'Text of the main call-to-action button, or empty' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: ['design', 'footer_year', 'no_booking', 'no_form', 'cta_dead_end', 'not_mobile', 'broken', 'placeholder', 'other'] },
            claim: { type: 'string' },
            evidence: { type: 'string' },
          },
          required: ['key', 'claim', 'evidence'],
        },
      },
    },
    required: ['design_verdict', 'design_note', 'footer_text', 'footer_year', 'booking_visible', 'form_visible', 'main_cta', 'findings'],
  },
}]

export async function auditVisually(name: string, shots: SiteShots, uploadKey: string): Promise<VisualAudit> {
  const now = new Date().toISOString()
  const labelled: [string, string | null][] = [
    ['Screenshot A: phone, top of homepage', shots.mobileTop],
    ['Screenshot B: desktop, top of homepage', shots.desktopTop],
    ['Screenshot C: desktop, middle of homepage', shots.desktopMiddle],
    ['Screenshot D: desktop, bottom of homepage including the footer', shots.desktopFooter],
  ]
  const blocks = imageBlocks(labelled)
  const [mobile_top, desktop_top, desktop_footer, desktop_middle] = await Promise.all([
    uploadShot(`${uploadKey}/mobile-top`, shots.mobileTop),
    uploadShot(`${uploadKey}/desktop-top`, shots.desktopTop),
    uploadShot(`${uploadKey}/desktop-footer`, shots.desktopFooter),
    uploadShot(`${uploadKey}/desktop-middle`, shots.desktopMiddle),
  ])
  const urls = { mobile_top, desktop_top, desktop_footer, desktop_middle }
  const empty: VisualAudit = {
    checked: false, design_verdict: 'unknown', design_note: '', footer_text: null, footer_year: null,
    booking_visible: 'unclear', form_visible: 'unclear', main_cta: null, findings: [], urls, checked_at: now,
  }
  if (blocks.length === 0) return empty

  try {
    const response = await askClaude({
      systemPrompt: AUDIT_PROMPT,
      messages: [{ role: 'user', content: [...blocks, { type: 'text', text: `Business: ${name}. Report what you see with report_site.` }] }],
      tools: AUDIT_TOOL,
      tier: 'write',
      maxTokens: 6000,
    })
    const t = extractToolUse(response)?.input
    if (!t) return empty
    const year = Number(t.footer_year) || null
    return {
      checked: true,
      design_verdict: ['dated', 'average', 'modern'].includes(t.design_verdict) ? t.design_verdict : 'unknown',
      design_note: String(t.design_note || '').trim(),
      footer_text: String(t.footer_text || '').trim() || null,
      footer_year: year && year > 1990 && year <= new Date().getFullYear() + 1 ? year : null,
      booking_visible: ['yes', 'no', 'unclear'].includes(t.booking_visible) ? t.booking_visible : 'unclear',
      form_visible: ['yes', 'no', 'unclear'].includes(t.form_visible) ? t.form_visible : 'unclear',
      main_cta: String(t.main_cta || '').trim() || null,
      findings: (Array.isArray(t.findings) ? t.findings : [])
        .filter((f: any) => f?.claim && f?.evidence)
        .slice(0, 3)
        .map((f: any) => ({ key: f.key || 'other', claim: String(f.claim).trim(), evidence: String(f.evidence).trim() })),
      urls,
      checked_at: now,
    }
  } catch {
    return empty
  }
}

// ─── Fact-check a draft against the screenshots ─────────────────

const CHECK_PROMPT = `You fact-check a cold email before it is sent to a business owner. You have screenshots of their live website and a list of verified facts.

For every statement in the emails about the recipient's business or website, decide if it is supported by the screenshots or the verified facts. Compliments and general statements about Grow The Hype are fine and need no checking.

If anything is not clearly supported, rewrite only the affected emails so they no longer make that claim, keeping the same voice, length and structure. Do not add new claims. Keep "Omar" as the last line of each email. No dashes, no exclamation marks.`

const CHECK_TOOL = [{
  name: 'fact_check',
  description: 'Verify every claim about the recipient and return corrected emails if needed',
  input_schema: {
    type: 'object' as const,
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            supported: { type: 'boolean' },
            basis: { type: 'string', description: 'Where you saw it, or why it is not supported' },
          },
          required: ['text', 'supported', 'basis'],
        },
      },
      email_1: { type: 'string', description: 'Corrected first email, or empty if no change needed' },
      follow_up_1: { type: 'string', description: 'Corrected follow-up, or empty if no change needed' },
      follow_up_2: { type: 'string', description: 'Corrected final note, or empty if no change needed' },
    },
    required: ['claims', 'email_1', 'follow_up_1', 'follow_up_2'],
  },
}]

export interface FactCheck {
  status: 'verified' | 'revised' | 'unverified'
  removed: { text: string; basis: string }[]
  claims: { text: string; supported: boolean; basis: string }[]
  draft: { email_1: string; follow_up_1: string; follow_up_2: string }
}

export async function factCheckDraft(params: {
  draft: { subject: string; email_1: string; follow_up_1: string; follow_up_2: string }
  shots: [string, string | null][]
  facts: string[]
}): Promise<FactCheck> {
  const blocks = imageBlocks(params.shots)
  const d = params.draft
  if (blocks.length === 0) {
    return { status: 'unverified', removed: [], claims: [], draft: { email_1: d.email_1, follow_up_1: d.follow_up_1, follow_up_2: d.follow_up_2 } }
  }
  const text = [
    `Verified facts:\n- ${params.facts.length ? params.facts.join('\n- ') : 'none'}`,
    `Subject: ${d.subject}`,
    `FIRST EMAIL:\n${d.email_1}`,
    `FOLLOW-UP:\n${d.follow_up_1}`,
    `FINAL NOTE:\n${d.follow_up_2}`,
    'Check it with fact_check.',
  ].join('\n\n')
  try {
    const response = await askClaude({
      systemPrompt: CHECK_PROMPT,
      messages: [{ role: 'user', content: [...blocks, { type: 'text', text }] }],
      tools: CHECK_TOOL,
      tier: 'write',
      maxTokens: 8000,
    })
    const t = extractToolUse(response)?.input
    if (!t) return { status: 'unverified', removed: [], claims: [], draft: { email_1: d.email_1, follow_up_1: d.follow_up_1, follow_up_2: d.follow_up_2 } }
    const claims = (Array.isArray(t.claims) ? t.claims : []).map((c: any) => ({ text: String(c.text || ''), supported: !!c.supported, basis: String(c.basis || '') }))
    const removed = claims.filter((c: any) => !c.supported).map((c: any) => ({ text: c.text, basis: c.basis }))
    const pick = (v: any, fallback: string) => (typeof v === 'string' && v.trim().length > 20 ? v.trim() : fallback)
    const out = {
      email_1: removed.length ? pick(t.email_1, d.email_1) : d.email_1,
      follow_up_1: removed.length ? pick(t.follow_up_1, d.follow_up_1) : d.follow_up_1,
      follow_up_2: removed.length ? pick(t.follow_up_2, d.follow_up_2) : d.follow_up_2,
    }
    return { status: removed.length ? 'revised' : 'verified', removed, claims, draft: out }
  } catch {
    return { status: 'unverified', removed: [], claims: [], draft: { email_1: d.email_1, follow_up_1: d.follow_up_1, follow_up_2: d.follow_up_2 } }
  }
}
