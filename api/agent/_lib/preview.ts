// Homepage concepts for hot leads.
//
// For a lead scoring 70+, the agent builds a new homepage for that business,
// using their own logo, photos and facts, held to the standard of the sites
// Grow The Hype ships (the source of those sites is kept in preview_refs and
// shown to the designer model as the bar). The page is checked in a real
// browser, reviewed once against screenshots, then published at
// https://growthehype-previews.netlify.app/<slug>/ (a Netlify edge function
// serves the files from Supabase Storage, bucket lead-previews).
//
// It runs in three stages so each fits in one serverless call:
//   kit       → open their site, pull logo, photos, colours and facts
//   generated → the designer model writes the page
//   ready     → screenshots, one review pass with fixes, published
import { getAdminClient } from './supabase-admin'
import { launch } from './browser'

export const PREVIEW_HOST = 'https://growthehype-previews.netlify.app'
const BUCKET = 'lead-previews'
const MODEL_DESIGN = 'claude-opus-5-5'
const MODEL_DESIGN_FALLBACK = 'claude-sonnet-5-5'
export const PREVIEW_MIN_SCORE = 70

export type PreviewStatus = 'kit' | 'generated' | 'scripted' | 'ready' | 'failed'
export interface PreviewState {
  status: PreviewStatus
  slug: string
  url?: string
  attempts: number
  error?: string | null
  started_at?: string
  built_at?: string
  review?: { score?: number; notes?: string[] }
  feedback?: string[]
}

interface Asset { path: string; kind: 'logo' | 'photo'; w: number; h: number; alt: string; note?: string }
interface SiteKit {
  url: string
  title: string
  description: string
  headings: string[]
  nav: string[]
  text: string
  extraPages: { url: string; text: string }[]
  phones: string[]
  emails: string[]
  socials: string[]
  bookingLinks: { text: string; href: string }[]
  address: string | null
  hours: string | null
  testimonials: string[]
  jsonld: string
  colours: string[]
  fonts: string[]
  logo: Asset | null
  logoNote: string | null
  photos: Asset[]
  desktopShot: string | null   // public URL
  mobileShot: string | null
}

// ─── Small helpers ─────────────────────────────────────────────

export function slugify(name: string): string {
  return String(name || 'business').toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'business'
}

function publicUrl(path: string): string {
  const sb = getAdminClient()
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

async function put(path: string, body: Buffer | string, contentType: string) {
  const sb = getAdminClient()
  const { error } = await sb.storage.from(BUCKET).upload(path, typeof body === 'string' ? Buffer.from(body, 'utf-8') : body, { contentType, upsert: true, cacheControl: '60' })
  if (error) throw new Error(`storage upload failed for ${path}: ${error.message}`)
}

async function getText(path: string): Promise<string | null> {
  const sb = getAdminClient()
  const { data, error } = await sb.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return await data.text()
}

async function savePreviewState(leadId: string, patch: Partial<PreviewState>) {
  const sb = getAdminClient()
  const { data: lead } = await sb.from('outreach_leads').select('enrichment_data').eq('id', leadId).single()
  const e = (lead?.enrichment_data || {}) as any
  const preview = { ...(e.preview || {}), ...patch }
  await sb.from('outreach_leads').update({ enrichment_data: { ...e, preview } }).eq('id', leadId)
  return preview as PreviewState
}

async function fetchBuffer(url: string, timeoutMs = 15_000): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', Accept: 'image/avif,image/webp,image/*,*/*' },
      redirect: 'follow',
    })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 800) return null
    return { buf, type: (r.headers.get('content-type') || '').split(';')[0] }
  } catch { return null }
}

// ─── Stage 1: the kit ───────────────────────────────────────────

const EXTRACT = `(() => {
  const abs = u => { try { return new URL(u, location.href).href } catch { return null } }
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 }
  const clean = t => String(t || '').replace(/\\s+/g, ' ').trim()

  const logos = []
  document.querySelectorAll('header img, nav img, [class*="logo" i] img, img[class*="logo" i], img[alt*="logo" i], img[src*="logo" i], a[href="/"] img, .navbar-brand img, [class*="brand" i] img').forEach(img => {
    if (!vis(img)) return
    const r = img.getBoundingClientRect()
    logos.push({ src: abs(img.currentSrc || img.src), w: img.naturalWidth, h: img.naturalHeight, alt: img.alt || '', top: r.top + scrollY, dw: r.width, dh: r.height })
  })
  let logoSvg = null
  const svgEl = document.querySelector('header [class*="logo" i] svg, header svg[class*="logo" i], [class*="logo" i] > svg, header a[href="/"] svg, a[class*="logo" i] svg, a[class*="brand" i] svg')
  if (svgEl) { const r = svgEl.getBoundingClientRect(); if (r.width > 40 && r.height > 12) logoSvg = svgEl.outerHTML.slice(0, 80000) }

  const imgs = []
  for (const i of document.images) {
    if (i.naturalWidth < 480 || i.naturalHeight < 280) continue
    const r = i.getBoundingClientRect()
    imgs.push({ src: abs(i.currentSrc || i.src), w: i.naturalWidth, h: i.naturalHeight, alt: i.alt || '', area: Math.round(r.width * r.height), top: Math.round(r.top + scrollY) })
  }
  document.querySelectorAll('section, div, header, figure, a').forEach(el => {
    const bg = getComputedStyle(el).backgroundImage
    const m = bg && bg.match(/url\\(["']?([^"')]+)["']?\\)/)
    if (!m || /\\.svg/i.test(m[1]) || m[1].startsWith('data:')) return
    const r = el.getBoundingClientRect()
    if (r.width > 480 && r.height > 240) imgs.push({ src: abs(m[1]), w: Math.round(r.width), h: Math.round(r.height), alt: el.getAttribute('aria-label') || '', area: Math.round(r.width * r.height), top: Math.round(r.top + scrollY), bg: true })
  })

  const colours = {}
  const add = (c, w) => { if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return; colours[c] = (colours[c] || 0) + w }
  document.querySelectorAll('a, button, header, nav, footer, h1, h2, h3, [class*="btn" i], [class*="button" i]').forEach(el => {
    if (!vis(el)) return
    const s = getComputedStyle(el); add(s.backgroundColor, 3); add(s.color, 1)
  })
  const fonts = [...new Set(['h1', 'h2', 'body', 'nav a', 'button'].map(q => { const el = document.querySelector(q); return el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null }).filter(Boolean))]

  const headings = [...document.querySelectorAll('h1, h2, h3')].filter(vis).map(h => h.tagName + ': ' + clean(h.innerText)).filter(t => t.length > 4).slice(0, 50)
  const nav = [...document.querySelectorAll('header a, nav a')].filter(vis).map(a => clean(a.innerText)).filter(t => t && t.length < 40)
  const links = [...document.querySelectorAll('a[href]')]
  const phones = [...new Set(links.filter(a => a.href.startsWith('tel:')).map(a => decodeURIComponent(a.href.slice(4)).trim()))].slice(0, 4)
  const emails = [...new Set(links.filter(a => a.href.startsWith('mailto:')).map(a => decodeURIComponent(a.href.slice(7).split('?')[0]).trim()))].slice(0, 4)
  const socials = [...new Set(links.map(a => a.href).filter(h => /facebook\\.com|instagram\\.com|linkedin\\.com|tiktok\\.com|youtube\\.com|x\\.com\\/|twitter\\.com|google\\.[a-z.]+\\/maps|maps\\.app\\.goo|g\\.page/i.test(h)))].slice(0, 8)
  const BOOK = ${'/opentable|resy\\.com|exploretock|toasttab|skipthedishes|doordash|ubereats|square\\.site|calendly|janeapp|jane\\.app|acuityscheduling|squareup\\.com\\/appointments|clinicsense|noterro|cliniko|mindbody|vagaro|fresha|booksy|setmore|simplybook|nexhealth|localmed|carecru|housecallpro|jobber|book\\.dental|opencare/i'}
  const bookingLinks = links.filter(a => BOOK.test(a.href) || /\\b(book|reserve|appointment|schedule|order online)\\b/i.test(a.innerText)).map(a => ({ text: clean(a.innerText).slice(0, 60), href: a.href })).filter(l => l.href.startsWith('http')).slice(0, 6)

  const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join('\\n').slice(0, 6000)
  const footer = document.querySelector('footer')
  const footerText = footer ? clean(footer.innerText).slice(0, 1500) : ''
  const hoursMatch = (document.body.innerText.match(/((mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?[^\\n]{0,60}\\d{1,2}(:\\d{2})?\\s?(am|pm|a\\.m\\.|p\\.m\\.)[^\\n]{0,80}\\n?){1,8}/i) || [])[0] || null
  const testimonials = [...document.querySelectorAll('blockquote, [class*="testimonial" i], [class*="review" i]')].filter(vis).map(el => clean(el.innerText)).filter(t => t.length > 40 && t.length < 700).slice(0, 8)
  const internal = links.map(a => ({ href: a.href.split('#')[0], text: clean(a.innerText).toLowerCase() }))
    .filter(l => l.href.startsWith(location.origin) && l.href !== location.href && /about|service|menu|team|treatment|what we do|our work|practice|who we are|staff|doctor/.test(l.text + ' ' + l.href.toLowerCase()))
  const main = document.querySelector('main') || document.body
  return {
    title: document.title || '',
    description: document.querySelector('meta[name="description"]')?.content || '',
    headings, nav: [...new Set(nav)].slice(0, 14),
    text: clean(main.innerText).slice(0, 9000),
    footerText, phones, emails, socials, bookingLinks, jsonld,
    hours: hoursMatch ? clean(hoursMatch).slice(0, 400) : null,
    testimonials,
    colours: Object.entries(colours).sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x[0]),
    fonts,
    logos: logos.sort((a, b) => a.top - b.top).slice(0, 6),
    logoSvg,
    ogImage: abs(document.querySelector('meta[property="og:image"]')?.content || ''),
    images: imgs,
    internal: [...new Map(internal.map(l => [l.href, l])).values()].slice(0, 4).map(l => l.href),
  }
})()`

const PAGE_TEXT = `(() => { const m = document.querySelector('main') || document.body; return { text: String(m.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 5000) } })()`

async function analyseLogo(buf: Buffer): Promise<{ png: Buffer; w: number; h: number; note: string }> {
  const sharp = (await import('sharp')).default
  const img = sharp(buf, { density: 300 }).trim({ threshold: 6 }).resize({ width: 1400, height: 600, fit: 'inside', withoutEnlargement: true })
  const png = await img.png().toBuffer()
  const meta = await sharp(png).metadata()
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let opaque = 0, transparent = 0, lumSum = 0, edgeLum = 0, edgeN = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    if (a < 20) transparent++
    else { opaque++; lumSum += lum }
    const px = (i / 4) % info.width, py = Math.floor(i / 4 / info.width)
    if ((px < 3 || py < 3 || px > info.width - 4 || py > info.height - 4) && a > 200) { edgeLum += lum; edgeN++ }
  }
  const total = opaque + transparent
  const hasTransparency = transparent / total > 0.08
  const avg = opaque ? lumSum / opaque : 128
  let note: string
  if (hasTransparency) {
    note = avg < 110
      ? 'Transparent PNG with dark artwork. Sits well on light surfaces. For a dark surface, use a white version with CSS filter: brightness(0) invert(1).'
      : avg > 200
        ? 'Transparent PNG with light or white artwork. Needs a dark surface; for a light surface use filter: brightness(0) for a solid dark version.'
        : 'Transparent PNG with mid-tone colour artwork. Works on light surfaces; on dark surfaces keep plenty of contrast or use a white version with filter: brightness(0) invert(1).'
  } else {
    const bgLum = edgeN ? edgeLum / edgeN : 255
    note = bgLum > 225
      ? 'Logo sits on a solid white box (no transparency). Place it on a white or near-white surface, or with mix-blend-mode: multiply on a light surface. Never put the white box on a dark background.'
      : 'Logo is a flat image on a solid coloured box. Treat the box as part of the mark, give it breathing room, never stretch it.'
  }
  return { png, w: meta.width || 0, h: meta.height || 0, note }
}

async function photoToJpeg(buf: Buffer): Promise<{ jpg: Buffer; w: number; h: number } | null> {
  try {
    const sharp = (await import('sharp')).default
    const out = await sharp(buf).rotate().resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    const meta = await sharp(out).metadata()
    if ((meta.width || 0) < 420 || (meta.height || 0) < 260) return null
    return { jpg: out, w: meta.width || 0, h: meta.height || 0 }
  } catch { return null }
}

export async function buildKit(lead: any, slug: string, deadline: number): Promise<SiteKit> {
  let target = String(lead.website || '').trim()
  if (!target) throw new Error('This lead has no website to work from')
  if (!target.startsWith('http')) target = 'https://' + target

  const browser: any = await launch()
  let raw: any
  const extraPages: { url: string; text: string }[] = []
  let desktopShot: Buffer | null = null
  let mobileShot: Buffer | null = null
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
    try { await page.goto(target, { waitUntil: 'networkidle2', timeout: 30_000 }) }
    catch { await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20_000 }) }
    await new Promise(r => setTimeout(r, 1500))
    // Scroll through so lazy images load
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 140)) }
      window.scrollTo(0, 0)
    }).catch(() => {})
    await new Promise(r => setTimeout(r, 1200))
    desktopShot = Buffer.from(await page.screenshot({ type: 'jpeg', quality: 70 }))
    raw = await page.evaluate(EXTRACT)

    for (const href of (raw.internal || []).slice(0, 3)) {
      if (Date.now() > deadline - 60_000) break
      try {
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15_000 })
        await new Promise(r => setTimeout(r, 900))
        const t = await page.evaluate(PAGE_TEXT)
        extraPages.push({ url: href, text: t.text })
        const more = await page.evaluate(`(() => [...document.images].filter(i => i.naturalWidth >= 480 && i.naturalHeight >= 280).map(i => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight, alt: i.alt || '', area: 0, top: 99999 })))()`)
        raw.images.push(...more)
      } catch { /* skip page */ }
    }

    const m = await browser.newPage()
    await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    await m.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')
    try { await m.goto(target, { waitUntil: 'networkidle2', timeout: 20_000 }) } catch { /* use what loaded */ }
    await new Promise(r => setTimeout(r, 800))
    mobileShot = Buffer.from(await m.screenshot({ type: 'jpeg', quality: 70 }))
  } finally {
    await browser.close().catch(() => {})
  }
  if (!raw) throw new Error('Could not read their website')

  // Logo
  let logo: Asset | null = null
  let logoNote: string | null = null
  const logoCands = [...(raw.logos || [])].filter((l: any) => l.src && !/\.gif($|\?)/i.test(l.src))
  if (raw.logoSvg) {
    try {
      const svg = String(raw.logoSvg).includes('xmlns') ? raw.logoSvg : String(raw.logoSvg).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
      const a = await analyseLogo(Buffer.from(svg))
      await put(`${slug}/assets/logo.png`, a.png, 'image/png')
      logo = { path: 'assets/logo.png', kind: 'logo', w: a.w, h: a.h, alt: `${lead.name} logo`, note: a.note }
      logoNote = a.note
    } catch { /* fall through to <img> logos */ }
  }
  for (const c of logoCands) {
    if (logo) break
    const f = await fetchBuffer(c.src)
    if (!f) continue
    try {
      const a = await analyseLogo(f.buf)
      if (a.w < 60) continue
      await put(`${slug}/assets/logo.png`, a.png, 'image/png')
      logo = { path: 'assets/logo.png', kind: 'logo', w: a.w, h: a.h, alt: c.alt || `${lead.name} logo`, note: a.note }
      logoNote = a.note
    } catch { /* try next */ }
  }

  // Photos: biggest first, deduped, no logos or icons
  const seen = new Set<string>()
  const cands = (raw.images || [])
    .filter((i: any) => i.src && !/\.svg($|\?)|sprite|icon|placeholder|spinner|loader|pixel/i.test(i.src))
    .filter((i: any) => !logoCands.some((l: any) => l.src === i.src))
    .sort((a: any, b: any) => (b.area || b.w * b.h / 4) - (a.area || a.w * a.h / 4))
    .filter((i: any) => { const k = i.src.split('?')[0]; if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, 16)
  const photos: Asset[] = []
  for (const c of cands) {
    if (photos.length >= 10 || Date.now() > deadline - 25_000) break
    const f = await fetchBuffer(c.src)
    if (!f) continue
    const j = await photoToJpeg(f.buf)
    if (!j) continue
    const path = `assets/photo-${photos.length + 1}.jpg`
    await put(`${slug}/${path}`, j.jpg, 'image/jpeg')
    photos.push({ path, kind: 'photo', w: j.w, h: j.h, alt: c.alt || '' })
  }

  if (desktopShot) await put(`${slug}/ref/current-desktop.jpg`, desktopShot, 'image/jpeg')
  if (mobileShot) await put(`${slug}/ref/current-mobile.jpg`, mobileShot, 'image/jpeg')

  const kit: SiteKit = {
    url: target,
    title: raw.title,
    description: raw.description,
    headings: raw.headings,
    nav: raw.nav,
    text: raw.text,
    extraPages,
    phones: raw.phones,
    emails: raw.emails,
    socials: raw.socials,
    bookingLinks: raw.bookingLinks,
    address: null,
    hours: raw.hours,
    testimonials: raw.testimonials,
    jsonld: raw.jsonld,
    colours: raw.colours,
    fonts: raw.fonts,
    logo,
    logoNote,
    photos,
    desktopShot: desktopShot ? publicUrl(`${slug}/ref/current-desktop.jpg`) : null,
    mobileShot: mobileShot ? publicUrl(`${slug}/ref/current-mobile.jpg`) : null,
  }
  // Address: schema.org first, then the footer
  const addr = String(raw.jsonld || '').match(/"streetAddress"\s*:\s*"([^"]+)"[\s\S]{0,300}?"addressLocality"\s*:\s*"([^"]+)"/)
  kit.address = addr ? `${addr[1]}, ${addr[2]}` : (lead.address || null)
  ;(kit as any).footerText = raw.footerText
  await put(`${slug}/kit.json`, JSON.stringify(kit), 'application/json')
  return kit
}

// ─── Stage 2: the page ──────────────────────────────────────────

async function streamClaude(body: any, deadline: number): Promise<{ text: string; stop: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
  const run = async (model: string) => {
    const ctrl = new AbortController()
    // Stop a little before the function's time limit and keep what was written
    const timer = setTimeout(() => ctrl.abort(), Math.max(10_000, deadline - Date.now() - 15_000))
    let text = '', stop: string | null = null
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ ...body, model, stream: true }),
      })
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => '')
        return { ok: false as const, status: res.status, err: t.slice(0, 400) }
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try { chunk = await reader.read() } catch (e: any) {
          if (ctrl.signal.aborted) return { ok: true as const, text, stop: 'deadline' }
          throw e
        }
        const { done, value } = chunk
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5))
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text
            else if (ev.type === 'message_delta') stop = ev.delta?.stop_reason || stop
            else if (ev.type === 'error') throw new Error(ev.error?.message || 'stream error')
          } catch (e: any) { if (e?.message && !/JSON/.test(e.message)) throw e }
        }
      }
      return { ok: true as const, text, stop }
    } catch (e: any) {
      if (ctrl.signal.aborted) return { ok: true as const, text, stop: 'deadline' }
      throw e
    } finally { clearTimeout(timer) }
  }
  let r = await run(MODEL_DESIGN)
  if (!r.ok && (r.status === 404 || /not_found|model/i.test(r.err))) r = await run(MODEL_DESIGN_FALLBACK)
  if (!r.ok && (r.status === 429 || r.status === 529 || r.status >= 500)) { await new Promise(x => setTimeout(x, 2000)); r = await run(MODEL_DESIGN) }
  if (!r.ok) throw new Error(`Claude API error (${r.status}): ${r.err}`)
  return { text: r.text, stop: r.stop }
}

async function loadReferences(): Promise<string> {
  const sb = getAdminClient()
  const { data } = await sb.from('preview_refs').select('key, url, content').in('key', ['sumar_home', 'sumar_css', 'sumar_js'])
  const byKey = Object.fromEntries((data || []).map((r: any) => [r.key, r]))
  if (!byKey.sumar_home) return ''
  return [
    `=== index.html (${byKey.sumar_home.url}) ===\n${byKey.sumar_home.content}`,
    byKey.sumar_css ? `=== assets/css/styles.css ===\n${byKey.sumar_css.content}` : '',
    byKey.sumar_js ? `=== assets/js/main.js ===\n${byKey.sumar_js.content}` : '',
  ].filter(Boolean).join('\n\n')
}

const DESIGN_SYSTEM = `You are the design director and lead front-end developer at Grow The Hype, Omar Alladina's agency in Edmonton. Grow The Hype builds custom websites to a standard that would cost a quarter of a million dollars at a top agency. Every site is hand-built HTML, CSS and JavaScript, hosted by Grow The Hype.

THE JOB
You are building a homepage concept for a local business Omar wants to work with. He will email them a link. They have never asked for it. The moment the page loads they must think "that is my business, and it looks better than anything I imagined". If it looks like a template, a theme, or an AI website, it fails and Omar loses the client.

THE BAR
The source of a homepage Grow The Hype shipped is included below. That is the minimum bar: the restraint, the strict 12-column grid, the type scale, the hairline rules, the line-mask hero reveal, the scrubbed statement, the bespoke diagram that explains the business, the themed browser details (selection, caret, focus, scrollbar), the progressive enhancement, the accessibility. Study how it is built. Do not copy its look, colours, layout or copy. Each business gets its own visual world, drawn from its own logo, photography and trade.

VISUAL WORLD
- Derive the palette from their logo and photography: one deep base, one or two neutrals, ONE accent used only for actions and small moments. Desaturate rather than shout. Light or dark is chosen for where their customers are and what they feel (a family dental clinic is rarely black, a cocktail bar rarely white).
- Typography from Google Fonts only, loaded with <link rel="preconnect"> and display=swap. Pick a display face with character and a calm text face. Good options: Schibsted Grotesk, Geist, Instrument Sans, Archivo, Hanken Grotesk, Familjen Grotesk, Bricolage Grotesque, Onest, Funnel Display, Newsreader, Source Serif 4, Literata, Young Serif. Never Inter, Roboto, Arial, Helvetica, Open Sans, Poppins, Montserrat, Lato, Raleway, Playfair Display.
- Headlines: large, tight tracking (-0.03em to -0.04em), line-height about 1.0 to 1.08, text-wrap: balance, sentence case, weight around 400 to 600. No italic or script accent words inside headings. No gradient text.
- Layout: max-width about 1320px with fluid gutters, a real 12-column grid, generous section spacing (clamp(96px, 13vw, 180px)), everything aligned to shared edges. Omar notices uneven lines, ragged column edges and misaligned baselines immediately; columns, rules and text blocks must line up.
- Banned: eyebrow or kicker labels above headings, section numbers (01, 02), three identical icon-plus-text cards as a page structure, nested cards, glassmorphism as decoration, purple or blue AI gradients, emoji, stock icons used as decoration, hard drop shadows, centred-everything layouts, rounded "pill" badges.
- Icons, when needed, are simple hand-written inline SVG strokes in one consistent weight.

ONE SIGNATURE MOMENT
Build one bespoke element that explains this specific business better than words, the way the shipped site turns corporate structure into an animated diagram. It must come from their real services or process. Examples: a clinic's first visit as a calm step path; an accountant's year as a deadline timeline; a restaurant's menu highlights as a photo-led list; a trade's service area or quote process as a clean diagram. Inline SVG and CSS only. Make it beautiful and make it work on a phone.

MOTION (planned by you, coded by a second engineer)
- In <head>, include exactly: the GSAP 3.12.5 and ScrollTrigger scripts from https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js and https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js and Lenis from https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js, all with defer; plus this tiny inline script: <script>(function(d){d.classList.add("js");if(!matchMedia("(prefers-reduced-motion: reduce)").matches)d.classList.add("motion");setTimeout(function(){if(!window.__ready)d.classList.remove("motion")},4000)})(document.documentElement)</script>
- Write NO other JavaScript. Just before </body>, leave exactly one empty tag: <script id="site-js"></script>. Another engineer writes the behaviour from your markup.
- Mark behaviour with data attributes: data-menu-toggle and data-menu for the mobile menu, data-nav for the header (gains .is-solid after scrolling), data-hero-line on each hero headline line wrapper (an overflow-hidden span holding an inner span), data-reveal and data-reveal-group for scroll reveals, data-scrub for a statement revealed word by word, data-form for the form with data-status for its message, and data-signature on the signature element plus any data attributes it needs.
- Style the start states only under html.motion (for example html.motion [data-reveal]{opacity:0;transform:translateY(24px)}) so everything is visible without JavaScript. Respect prefers-reduced-motion.
- Right after <body>, add an HTML comment <!-- MOTION PLAN: ... --> describing, in a few precise lines, the hero moment, the reveals, and exactly how the signature element should animate or respond (states, timing, easing such as cubic-bezier(0.16, 1, 0.3, 1)). Animate transform, opacity and clip-path only.

CONTENT AND TRUTH
- Use ONLY facts from the brief: their services, areas, people, credentials, years, phone, email, address, hours, booking links and reviews. Rewrite their copy so it is clear, warm and specific, in Canadian spelling, in their voice.
- Never invent anything: no statistics, prices, years in business, awards, team members, testimonials, guarantees, review counts or ratings that are not in the brief. If a section would need a fact we do not have, leave the section out. No lorem ipsum, no placeholders, no "[insert]".
- If real testimonials are in the brief, quote them exactly with the name as given. If the brief gives a Google rating and review count, you may state exactly that.
- Headline speaks to their customer's outcome in plain words. No clichés, no "elevate", "seamless", "unlock", "transform", "solutions", "tailored", "cutting-edge", "world-class", "your trusted partner", "look no further". No exclamation marks, no em dashes or en dashes.
- The concept must visibly fix what Omar noticed on their current site (listed in the brief). If booking is missing, make booking effortless; if the phone view is broken, the mobile layout must be outstanding; if the site looks dated, the difference must be obvious within one second.

STRUCTURE (adapt, do not template)
Header with their logo, 3 to 5 anchor links and one primary action; a hero that earns attention (their best real photo used large, or bold typography with the signature visual if their photos are weak); a short statement of what they do and for whom; services presented with care (not identical cards); the signature moment; a clear path to get started or book; trust from real facts only; contact with phone, email, address, hours and a short form; a footer with logo, links, contact, © 2026 and a small credit "Concept by Grow The Hype" linking to https://growthehype.ca.

TECHNICAL
- One self-contained index.html: inline <style> and <script>, semantic HTML, skip link, labels, alt text, visible focus, WCAG AA contrast.
- Responsive from 360px to 1920px with no horizontal scroll; hero uses min-height: 100svh; mobile menu works and traps nothing.
- Images: only the asset paths given in the brief, as relative paths (for example assets/photo-2.jpg), with width and height attributes, object-fit: cover, sensible object-position, loading="lazy" except the hero. Never link to their old website's files and never use stock or placeholder image services.
- Logo: use assets/logo.png following the handling note in the brief. If there is no logo file, set their name in the display face as a wordmark.
- Every link goes somewhere real: tel:, mailto:, their booking link, or an anchor on the page. No href="#".
- The form does not send anything (the script engineer wires it to show: "This is a homepage concept. On your new site, this would go straight to your inbox.").
- <meta name="robots" content="noindex, nofollow">, a proper <title> ("{Business} | Homepage concept by Grow The Hype"), meta description, theme-color.
- Theme the browser surfaces: ::selection, caret-color, :focus-visible, scrollbar colours.

OUTPUT
Return only the complete HTML document inside one \`\`\`html code block. No commentary before or after. Keep it tight: roughly 600 to 900 lines of HTML and CSS, written compactly (one rule per line where sensible), every line earning its place. The page must be finished; never stop mid-document.`

function kitBrief(lead: any, kit: SiteKit, findings: string[], feedback: string[]): string {
  const e = lead.enrichment_data || {}
  const reviews = e.review_count || e.user_rating_count
  const lines = [
    `BUSINESS: ${lead.name}`,
    `TYPE: ${lead.industry || 'local business'}`,
    `AREA: ${lead.location || lead.address || 'Edmonton, Alberta'}`,
    `CURRENT WEBSITE: ${kit.url}`,
    lead.rating ? `GOOGLE: ${lead.rating} stars${reviews ? ` from ${reviews} reviews` : ''} (you may state exactly this)` : '',
    '',
    `WHAT OMAR NOTICED ON THEIR CURRENT SITE (the concept must fix these): ${findings.length ? findings.join('; ') : 'it looks dated next to what their business deserves'}`,
    '',
    `PAGE TITLE: ${kit.title}`,
    `META DESCRIPTION: ${kit.description}`,
    `NAVIGATION: ${kit.nav.join(' | ')}`,
    `HEADINGS ON THEIR SITE:\n${kit.headings.join('\n')}`,
    `HOMEPAGE TEXT:\n${kit.text}`,
    ...kit.extraPages.map(p => `TEXT FROM ${p.url}:\n${p.text}`),
    `FOOTER: ${(kit as any).footerText || ''}`,
    `PHONE: ${kit.phones.join(', ') || 'none found'}`,
    `EMAIL: ${kit.emails.join(', ') || 'none found'}`,
    `ADDRESS: ${kit.address || 'none found'}`,
    `HOURS: ${kit.hours || 'none found'}`,
    `BOOKING / ORDER LINKS: ${kit.bookingLinks.map(b => `${b.text} → ${b.href}`).join(' | ') || 'none (use the contact form and phone)'}`,
    `SOCIAL: ${kit.socials.join(' | ') || 'none'}`,
    `TESTIMONIALS ON THEIR SITE (quote exactly if used): ${kit.testimonials.length ? kit.testimonials.map(t => `"${t}"`).join(' || ') : 'none, so do not show any'}`,
    kit.jsonld ? `STRUCTURED DATA: ${kit.jsonld.slice(0, 2500)}` : '',
    `THEIR CURRENT COLOURS (most used first): ${kit.colours.join(', ')}`,
    `THEIR CURRENT FONTS: ${kit.fonts.join(', ')}`,
    '',
    'ASSETS YOU MAY USE (relative paths):',
    kit.logo ? `- ${kit.logo.path} (logo, ${kit.logo.w}x${kit.logo.h}). Handling: ${kit.logoNote}` : '- No logo file. Set their name as a wordmark in the display face.',
    ...kit.photos.map(p => `- ${p.path} (photo, ${p.w}x${p.h}${p.alt ? `, alt on their site: "${p.alt}"` : ''})`),
    kit.photos.length < 2 ? 'They have few usable photos. Lead with typography and the bespoke signature visual rather than imagery.' : '',
    '',
    'The images attached show: their current homepage on desktop and on a phone, their logo, and each photo in the order listed above. Judge which photos are strong enough to use large; skip weak, blurry or off-topic ones.',
    feedback.length ? `\nTHE PREVIOUS ATTEMPT WAS REJECTED. Fix all of this:\n- ${feedback.join('\n- ')}` : '',
  ]
  return lines.filter(l => l !== '').join('\n')
}

async function imageBlock(url: string | null, maxW = 900): Promise<any | null> {
  if (!url) return null
  const f = await fetchBuffer(url, 12_000)
  if (!f) return null
  try {
    const sharp = (await import('sharp')).default
    const out = await sharp(f.buf).flatten({ background: '#8a8a8a' }).resize({ width: maxW, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer()
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: out.toString('base64') } }
  } catch { return null }
}

function extractHtml(text: string): string | null {
  const m = text.match(/```html\s*([\s\S]*?)```/i)
  let html = (m ? m[1] : text).trim()
  if (!m) {
    const s = html.toLowerCase().indexOf('<!doctype')
    if (s > 0) html = html.slice(s)
  }
  if (!/<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html)) return null
  return html
}

export async function generatePage(lead: any, slug: string, kit: SiteKit, findings: string[], feedback: string[], deadline: number, partial = ''): Promise<{ html: string | null; partial: string }> {
  const refs = await loadReferences()
  const content: any[] = [{ type: 'text', text: kitBrief(lead, kit, findings, feedback) }]
  const shots = await Promise.all([
    imageBlock(kit.desktopShot, 1200),
    imageBlock(kit.mobileShot, 500),
    kit.logo ? imageBlock(publicUrl(`${slug}/${kit.logo.path}`), 700) : Promise.resolve(null),
    ...kit.photos.map(p => imageBlock(publicUrl(`${slug}/${p.path}`), 640)),
  ])
  const labels = ['Their current homepage, desktop', 'Their current homepage, phone', 'Their logo (shown on grey)', ...kit.photos.map(p => p.path)]
  shots.forEach((b, i) => { if (b) content.push({ type: 'text', text: labels[i] }, b) })
  content.push({ type: 'text', text: `Build the homepage concept for ${lead.name} now. Return only the HTML in one code block.` })
  const system = [
    { type: 'text', text: DESIGN_SYSTEM },
    ...(refs ? [{ type: 'text', text: `SOURCE OF A HOMEPAGE GROW THE HYPE SHIPPED (the bar, not a template):\n\n${refs}`, cache_control: { type: 'ephemeral' } }] : []),
  ]
  // A long page can outrun one serverless call: carry on from where it stopped
  const head = partial.replace(/\s+$/, '')
  const messages: any[] = [{ role: 'user', content }]
  if (head) {
    messages.push({ role: 'assistant', content: head })
  }
  let out: { text: string; stop: string | null }
  try {
    out = await streamClaude({ max_tokens: 24000, system, messages }, deadline)
  } catch (err: any) {
    if (!head || !/prefill|assistant/i.test(String(err?.message))) throw err
    out = await streamClaude({
      max_tokens: 24000, system,
      messages: [{ role: 'user', content: [...content, { type: 'text', text: `You already started. Your output so far is below. Continue from exactly where it stops: output only the remaining characters, with no repetition and no commentary.\n\n${head}` }] }],
    }, deadline)
  }
  const full = head ? head + out.text : out.text
  const html = extractHtml(full.includes('```html') && !/```\s*$/.test(full.trim()) ? full + '\n```' : full)
  if (html) return { html, partial: '' }
  if (out.stop === 'deadline' && full.length > 400) return { html: null, partial: full }
  throw new Error(out.stop === 'max_tokens' ? 'The page ran too long and was cut off' : 'The designer did not return a full HTML page')
}

const SCRIPT_SYSTEM = `You are the front-end engineer at Grow The Hype who writes the JavaScript for a homepage the design director just built. The bar is the shipped site's main.js included below: GSAP + ScrollTrigger + Lenis, precise and restrained, progressive enhancement, prefers-reduced-motion respected, no layout thrash.

Write the code that goes inside <script id="site-js"></script>, following the MOTION PLAN comment and the data attributes in the markup:
- Run on DOMContentLoaded. If gsap, ScrollTrigger or Lenis is missing, or reduced motion is on, remove the "motion" class from <html> so everything shows, still wire the menu and form, and stop.
- Set window.__ready = true once motion is initialised.
- Lenis smooth scroll wired to ScrollTrigger (lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0)); anchor links scroll with lenis.scrollTo and the header offset.
- Header: add .is-solid after 40px of scroll; mobile menu toggles aria-expanded, the hidden attribute and body scroll lock, closes on link click and Escape.
- Hero: headline lines rise from their masks with a short stagger, then supporting elements fade up.
- [data-reveal] and [data-reveal-group] children reveal once on scroll; [data-scrub] splits into words and brightens with scroll.
- The signature element behaves exactly as the plan says, and also works by tap on a phone.
- [data-form]: prevent submit, check required fields and email format, show errors inline, then show in [data-status]: "This is a homepage concept. On your new site, this would go straight to your inbox."
- Only reference elements that exist in the markup; guard every query. No console logs, no alerts, no external requests.

Return only the JavaScript inside one \`\`\`js code block.`

async function loadRefScript(): Promise<string> {
  const sb = getAdminClient()
  const { data } = await sb.from('preview_refs').select('content').eq('key', 'sumar_js').maybeSingle()
  return data?.content || ''
}

export async function generateScript(html: string, deadline: number): Promise<string> {
  const ref = await loadRefScript()
  const { text } = await streamClaude({
    max_tokens: 9000,
    system: [
      { type: 'text', text: SCRIPT_SYSTEM },
      ...(ref ? [{ type: 'text', text: `SHIPPED main.js (the bar):\n${ref}`, cache_control: { type: 'ephemeral' } }] : []),
    ],
    messages: [{ role: 'user', content: `Here is the page. Write the script.\n\n${html}` }],
  }, deadline)
  const m = text.match(/```(?:js|javascript)\s*([\s\S]*?)```/i)
  const js = (m ? m[1] : text).trim()
  if (js.length < 200) throw new Error('The script engineer returned nothing usable')
  return js.replace(/<\/script/gi, '<\\/script')
}

function insertScript(html: string, js: string): string {
  const tag = /<script id="site-js">\s*<\/script>/i
  if (tag.test(html)) return html.replace(tag, () => `<script id="site-js">\n${js}\n</script>`)
  return html.replace(/<\/body>/i, () => `<script id="site-js">\n${js}\n</script>\n</body>`)
}

// ─── Stage 3: check, review, publish ────────────────────────────

const BANNED_COPY = /\b(elevate|seamless(ly)?|unlock|transform(ative)?|solutions?|tailored|cutting[- ]edge|world[- ]class|look no further|your trusted partner|game[- ]changer|synergy|leverage|empower|lorem ipsum|placeholder|\[insert)/i

async function renderChecks(html: string, slug: string) {
  const base = publicUrl(`${slug}/`).replace(/\/?$/, '/')
  const withBase = html.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`)
  const browser: any = await launch()
  const shots: { label: string; data: string }[] = []
  const problems: string[] = []
  try {
    const page = await browser.newPage()
    const errors: string[] = []
    const failed: string[] = []
    page.on('pageerror', (e: any) => errors.push(String(e?.message || e).slice(0, 200)))
    page.on('requestfailed', (r: any) => { const u = r.url(); if (!/fonts\.g|google/.test(u)) failed.push(u.slice(0, 160)) })
    await page.setViewport({ width: 1440, height: 900 })
    await page.setContent(withBase, { waitUntil: 'networkidle0', timeout: 45_000 }).catch(() => {})
    await new Promise(r => setTimeout(r, 2500))
    const height: number = await page.evaluate('document.documentElement.scrollHeight')
    const stops = [0, 0.18, 0.36, 0.54, 0.72, 1].map(f => Math.max(0, Math.round((height - 900) * f)))
    for (const [i, y] of [...new Set(stops)].entries()) {
      await page.evaluate(`window.scrollTo(0, ${y})`)
      await new Promise(r => setTimeout(r, 1300))
      const b = await page.screenshot({ type: 'jpeg', quality: 62 })
      shots.push({ label: `Desktop 1440, view ${i + 1}`, data: Buffer.from(b).toString('base64') })
    }
    const metrics: any = await page.evaluate(`(() => ({
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      brokenImgs: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')).slice(0, 8),
      deadLinks: [...document.querySelectorAll('a[href]')].filter(a => { const h = a.getAttribute('href'); return h === '#' || h === '' || /^javascript:/i.test(h) }).length,
      missingAnchors: [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1))).slice(0, 8),
      text: document.body.innerText.slice(0, 20000),
    }))()`)
    if (metrics.overflowX > 2) problems.push(`Desktop scrolls sideways by ${metrics.overflowX}px`)
    if (metrics.brokenImgs.length) problems.push(`Broken images: ${metrics.brokenImgs.join(', ')}`)
    if (metrics.deadLinks) problems.push(`${metrics.deadLinks} links go nowhere (href="#" or empty)`)
    if (metrics.missingAnchors.length) problems.push(`Anchor links with no matching section: ${metrics.missingAnchors.join(', ')}`)
    const bad = String(metrics.text).match(BANNED_COPY)
    if (bad) problems.push(`Banned wording in the copy: "${bad[0]}"`)
    if (/[—–]/.test(metrics.text)) problems.push('The copy uses em or en dashes')
    if (/!/.test(String(metrics.text).replace(/<!--[\s\S]*?-->/g, ''))) problems.push('The copy uses exclamation marks')
    if (errors.length) problems.push(`JavaScript errors: ${errors.slice(0, 3).join(' | ')}`)
    if (failed.length) problems.push(`Files that failed to load: ${failed.slice(0, 5).join(', ')}`)

    const m = await browser.newPage()
    await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    await m.setContent(withBase, { waitUntil: 'networkidle0', timeout: 45_000 }).catch(() => {})
    await new Promise(r => setTimeout(r, 2200))
    const mh: number = await m.evaluate('document.documentElement.scrollHeight')
    const mOver: number = await m.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    if (mOver > 2) problems.push(`Phone layout scrolls sideways by ${mOver}px`)
    for (const [i, f] of [0, 0.3, 0.65].entries()) {
      await m.evaluate(`window.scrollTo(0, ${Math.round(Math.max(0, mh - 844) * f)})`)
      await new Promise(r => setTimeout(r, 1100))
      const b = await m.screenshot({ type: 'jpeg', quality: 62 })
      shots.push({ label: `Phone 390, view ${i + 1}`, data: Buffer.from(b).toString('base64') })
    }
  } finally {
    await browser.close().catch(() => {})
  }
  return { shots, problems }
}

const REVIEW_TOOL = {
  name: 'review_concept',
  description: 'Review the homepage concept and return exact fixes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      score: { type: 'number', description: '1 to 10 against the shipped Grow The Hype site. 8 or more means a business owner would be sold on sight.' },
      verdict: { type: 'string', enum: ['ship', 'fix', 'rebuild'], description: 'ship: publish as is or with the edits; fix: publish after the edits; rebuild: the concept is not good enough and must be redone' },
      issues: { type: 'array', items: { type: 'string' }, description: 'Every problem, specific and visual' },
      edits: {
        type: 'array',
        description: 'Exact search and replace edits to the HTML source that fix the issues. find must be copied character for character from the source and be unique.',
        items: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'] },
      },
    },
    required: ['score', 'verdict', 'issues', 'edits'],
  },
}

export async function reviewPage(lead: any, slug: string, html: string, kit: SiteKit, deadline: number): Promise<{ html: string; score: number; verdict: string; issues: string[] }> {
  const first = await renderChecks(html, slug)
  const content: any[] = [{
    type: 'text',
    text: `Homepage concept for ${lead.name} (${lead.industry || 'local business'}). Below: automated checks, screenshots of the concept on desktop and phone, the facts we collected from their site, then the full HTML source.

AUTOMATED CHECKS: ${first.problems.length ? first.problems.join('; ') : 'all passed'}

FACTS WE HAVE (anything stated on the page that is not here is invented and must be removed): phone ${kit.phones.join(', ') || 'none'}; email ${kit.emails.join(', ') || 'none'}; address ${kit.address || 'none'}; hours ${kit.hours || 'none'}; Google ${lead.rating || 'n/a'}; testimonials ${kit.testimonials.length ? kit.testimonials.join(' || ').slice(0, 1500) : 'none'}; their own text: ${kit.text.slice(0, 3500)}`,
  }]
  for (const s of first.shots) content.push({ type: 'text', text: s.label }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: s.data } })
  content.push({ type: 'text', text: `HTML SOURCE:\n${html}` })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(Math.max(30_000, deadline - Date.now() - 20_000)),
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL_DESIGN,
      max_tokens: 8000,
      system: `You are the creative director at Grow The Hype reviewing a homepage concept before Omar sends it to a prospect. Omar's bar: it must look like a quarter-million-dollar custom build, with nothing that reads as a template or as AI. Be exacting about: alignment (shared edges, columns, baselines; Omar hates uneven lines), type scale and rhythm, spacing, image cropping, logo treatment (never a white box on a dark background, never stretched, always legible), contrast, the phone layout, anything broken or overlapping, banned patterns (eyebrow labels above headings, section numbers, identical icon cards, gradient text, emoji, italic accent words in headings), copy (no invented facts, no clichés, no exclamation marks, no dashes, Canadian spelling), and that every link works. Fix what you can with exact search-and-replace edits on the source. Use verdict "rebuild" only if the concept as a whole is weak (score below 7).`,
      tools: [REVIEW_TOOL],
      tool_choice: { type: 'tool', name: 'review_concept' },
      messages: [{ role: 'user', content }],
    }),
  }).catch((e: any) => ({ ok: false, status: 0, json: async () => ({ error: String(e?.message || e) }) }) as any)
  const data: any = await res.json().catch(() => ({}))
  const tool = (data?.content || []).find((b: any) => b.type === 'tool_use')?.input
  if (!res.ok || !tool) {
    // Review unavailable: publish only if the automated checks passed
    return { html, score: first.problems.length ? 5 : 7, verdict: first.problems.length ? 'fix' : 'ship', issues: first.problems }
  }
  let out = html
  for (const ed of (tool.edits || []) as { find: string; replace: string }[]) {
    if (!ed?.find || ed.find === ed.replace) continue
    const idx = out.indexOf(ed.find)
    if (idx < 0 || out.indexOf(ed.find, idx + ed.find.length) >= 0) continue
    out = out.slice(0, idx) + ed.replace + out.slice(idx + ed.find.length)
  }
  return { html: out, score: Number(tool.score) || 0, verdict: tool.verdict || 'fix', issues: [...first.problems, ...(tool.issues || [])].slice(0, 30) }
}

// ─── Orchestration: advance one stage ───────────────────────────

function findingsFor(lead: any): string[] {
  const q = lead.enrichment_data?.qual || {}
  const out: string[] = []
  for (const f of q.visual?.findings || []) if (f?.issue) out.push(String(f.issue))
  if (q.design?.verdict === 'dated') out.push('the design looks dated')
  return out.slice(0, 8)
}

async function uniqueSlug(lead: any): Promise<string> {
  const sb = getAdminClient()
  const base = slugify(lead.name)
  const { data } = await sb.from('outreach_leads').select('id').neq('id', lead.id).eq('enrichment_data->preview->>slug', base).limit(1)
  if (!data?.length) return base
  const city = slugify(String(lead.location || '').split(',')[0])
  return `${base}-${city || String(lead.id).slice(0, 4)}`.slice(0, 70)
}

/**
 * Do the next stage of the concept for one lead. Returns the new state.
 * Each call fits in one serverless invocation; call again until status is
 * 'ready' or 'failed'.
 */
export async function advancePreview(leadId: string, opts: { deadline: number; rebuild?: boolean; feedback?: string[] }): Promise<PreviewState> {
  const sb = getAdminClient()
  const { data: lead } = await sb.from('outreach_leads').select('*').eq('id', leadId).single()
  if (!lead) throw new Error('Lead not found')
  let state: PreviewState | undefined = lead.enrichment_data?.preview
  if (!state) {
    state = await savePreviewState(leadId, { status: 'kit', slug: await uniqueSlug(lead), attempts: 0, errors: 0, error: null, started_at: new Date().toISOString(), feedback: [] } as any)
  } else if (opts.rebuild) {
    // Keep the kit (their logo, photos, facts); redo the page with Omar's notes
    await sb.storage.from(BUCKET).remove([`${state.slug}/draft.html`])
    state = await savePreviewState(leadId, { status: 'kit', attempts: 0, errors: 0, partial: false, parts: 0, error: null, started_at: new Date().toISOString(), feedback: opts.feedback || [] } as any)
  }
  if ((state.status === 'ready' || state.status === 'failed') && !opts.rebuild) return state
  const slug = state.slug
  try {
    // Stage 1 → kit
    const kitText = await getText(`${slug}/kit.json`)
    if (!kitText) {
      await buildKit(lead, slug, opts.deadline)
      return await savePreviewState(leadId, { status: 'kit', error: null })
    }
    const kit = JSON.parse(kitText) as SiteKit

    // Stage 2 → page draft
    const draft = state.status === 'kit' ? null : await getText(`${slug}/draft.html`)
    if (!draft) {
      if ((state.attempts || 0) >= 3) return await savePreviewState(leadId, { status: 'failed', error: state.error || 'Three attempts did not reach the bar' })
      const partial = (state as any).partial ? (await getText(`${slug}/partial.txt`)) || '' : ''
      const g = await generatePage(lead, slug, kit, findingsFor(lead), state.feedback || [], opts.deadline, partial)
      if (!g.html) {
        const parts = ((state as any).parts || 0) + 1
        if (parts >= 4) {
          return await savePreviewState(leadId, { partial: false, parts: 0, attempts: (state.attempts || 0) + 1, error: 'The page took too long to write; starting over' } as any)
        }
        await put(`${slug}/partial.txt`, g.partial, 'text/plain; charset=utf-8')
        return await savePreviewState(leadId, { partial: true, parts, error: null } as any)
      }
      await put(`${slug}/draft.html`, g.html, 'text/html; charset=utf-8')
      return await savePreviewState(leadId, { status: 'generated', partial: false, parts: 0, attempts: (state.attempts || 0) + 1, error: null } as any)
    }

    // Stage 2b → behaviour
    if (state.status === 'generated') {
      const js = await generateScript(draft, opts.deadline)
      await put(`${slug}/draft.html`, insertScript(draft, js), 'text/html; charset=utf-8')
      return await savePreviewState(leadId, { status: 'scripted', error: null })
    }

    // Stage 3 → review, fix, publish
    const r = await reviewPage(lead, slug, draft, kit, opts.deadline)
    if (r.verdict === 'rebuild' && (state.attempts || 0) < 3) {
      await sb.storage.from(BUCKET).remove([`${slug}/draft.html`])
      return await savePreviewState(leadId, { status: 'kit', feedback: r.issues.slice(0, 15), review: { score: r.score, notes: r.issues.slice(0, 15) }, error: null })
    }
    await put(`${slug}/index.html`, r.html, 'text/html; charset=utf-8')
    return await savePreviewState(leadId, {
      status: 'ready',
      url: `${PREVIEW_HOST}/${slug}/`,
      built_at: new Date().toISOString(),
      review: { score: r.score, notes: r.issues.slice(0, 15) },
      error: null,
    })
  } catch (err: any) {
    const msg = String(err?.message || err).slice(0, 300)
    const errors = ((state as any).errors || 0) + 1
    return await savePreviewState(leadId, { error: msg, status: errors >= 3 ? 'failed' : state.status, errors } as any)
  }
}

/** Hot leads that should get a concept, oldest first. */
export async function leadsNeedingPreview(agentConfigId: string, limit = 5): Promise<any[]> {
  const sb = getAdminClient()
  const { data } = await sb.from('outreach_leads')
    .select('id, name, website, qualification_score, enrichment_data')
    .eq('agent_config_id', agentConfigId)
    .gte('qualification_score', PREVIEW_MIN_SCORE)
    .not('website', 'is', null)
    .order('qualification_score', { ascending: false })
    .limit(50)
  return (data || []).filter((l: any) => {
    const p = l.enrichment_data?.preview
    if (l.enrichment_data?.user_feedback === 'bad') return false
    if (!p) return true
    if (p.status === 'ready' || p.status === 'failed') return false
    return (p.attempts || 0) < 3 && (p.errors || 0) < 3
  }).slice(0, limit)
}
