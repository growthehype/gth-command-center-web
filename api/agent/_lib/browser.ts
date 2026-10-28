// A real headless Chrome that opens a prospect's site like a visitor would:
// does it load, what does it look like on desktop and on a phone, what does
// the footer actually say, is there a form or booking widget on the page.
// Runs on Vercel via @sparticuz/chromium; CHROME_PATH overrides for local tests.

export interface BrowserCapture {
  ok: boolean                // browser launched and tried the page
  loaded: boolean            // the page actually rendered
  status: number | null
  error: string | null
  finalUrl: string | null
  title: string | null
  desktopTop: string | null  // data URIs (jpeg)
  desktopMiddle: string | null
  desktopFooter: string | null
  mobileTop: string | null
  footerText: string | null
  copyrightYear: number | null
  visibleText: string
  forms: number              // real forms with a text/email field
  bookingWidget: string | null
  ctas: { text: string; href: string | null }[]
  viewportMeta: boolean
}

const BOOKING_RE = /opentable|resy\.com|exploretock|toasttab|skipthedishes|doordash|ubereats|clover\.com\/online|square\.site|calendly|janeapp|jane\.app|acuityscheduling|squareup\.com\/appointments|clinicsense|noterro|cliniko|mindbody|vagaro|fresha|booksy|setmore|simplybook|zocdoc|nexhealth|localmed|carecru|housecallpro|jobber|servicetitan|book\.dental|dentalhub|opencare/i

// Pages run in parallel, so none of them may be throttled as a "background tab"
// (otherwise screenshots in the other tabs hang)
const NO_THROTTLE = ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']

let exePath: Promise<string> | null = null

export async function launch() {
  const puppeteer = (await import('puppeteer-core')).default
  if (process.env.CHROME_PATH) {
    return puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', ...NO_THROTTLE] })
  }
  // Vercel runs on Amazon Linux 2023 but doesn't set the Lambda env vars
  // @sparticuz/chromium looks for, so it never unpacks the shared libraries
  // Chrome needs (libnss3 etc). Tell it, before the module loads.
  if (!process.env.AWS_LAMBDA_JS_RUNTIME && !process.env.AWS_EXECUTION_ENV?.includes('nodejs')) {
    process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs22.x'
  }
  const chromium = (await import('@sparticuz/chromium')).default
  // Unpack the binary once; parallel unpacking races ("spawn ETXTBSY")
  if (!exePath) exePath = chromium.executablePath()
  return puppeteer.launch({
    args: [...chromium.args, ...NO_THROTTLE],
    defaultViewport: null,
    executablePath: await exePath,
    headless: true,
  })
}

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

function uri(buf: Uint8Array | Buffer | string) {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'base64') : Buffer.from(buf)
  return `data:image/jpeg;base64,${b.toString('base64')}`
}

export async function captureWithBrowser(url: string, timeoutMs = 25_000): Promise<BrowserCapture> {
  let target = url.trim()
  if (!target.startsWith('http')) target = 'https://' + target
  const empty: BrowserCapture = {
    ok: false, loaded: false, status: null, error: null, finalUrl: null, title: null,
    desktopTop: null, desktopMiddle: null, desktopFooter: null, mobileTop: null,
    footerText: null, copyrightYear: null, visibleText: '', forms: 0, bookingWidget: null, ctas: [], viewportMeta: false,
  }
  let browser: any = null
  try {
    browser = await launch()
  } catch (err: any) {
    exePath = null
    return { ...empty, error: `browser could not start: ${String(err?.message || err).slice(0, 160)}` }
  }

  const opened: any[] = []
  try {
    const page = await browser.newPage()
    opened.push(page)
    // Look like a normal visitor: many small-business hosts block obvious bots
    await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) })
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-CA,en;q=0.9' })
    await page.setUserAgent(UA_DESKTOP)
    await page.setViewport({ width: 1366, height: 860, deviceScaleFactor: 1 })

    // Try twice: some sites are slow or block the first hit
    let resp: any = null
    let navError: string | null = null
    for (const attempt of [0, 1]) {
      try {
        resp = await page.goto(target, { waitUntil: attempt === 0 ? 'networkidle2' : 'domcontentloaded', timeout: timeoutMs })
        navError = null
        break
      } catch (err: any) {
        navError = String(err?.message || err).slice(0, 160)
        if (attempt === 0 && /^https:/.test(target)) { /* retry same url with lighter wait */ }
      }
    }
    if (navError && !resp) {
      // http fallback for sites without TLS
      if (target.startsWith('https://')) {
        try { resp = await page.goto(target.replace('https://', 'http://'), { waitUntil: 'domcontentloaded', timeout: timeoutMs }); navError = null } catch { /* keep error */ }
      }
    }
    const status: number | null = resp ? resp.status() : null
    const textLen: number = await page.evaluate(() => (document.body?.innerText || '').trim().length).catch(() => 0)
    const loaded = !navError && textLen > 80 && (status == null || status < 400)
    if (!loaded) {
      return { ...empty, ok: true, status, error: navError || (status && status >= 400 ? `HTTP ${status}` : 'page was blank'), finalUrl: page.url() }
    }

    // Let lazy content and cookie banners settle, then scroll to trigger lazy images
    await new Promise(r => setTimeout(r, 1200))
    await page.evaluate(async () => {
      const h = document.body.scrollHeight
      for (let y = 0; y < h; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) }
      window.scrollTo(0, 0)
    }).catch(() => {})
    await new Promise(r => setTimeout(r, 600))

    const facts = await page.evaluate((bookingSrc: string) => {
      const bookingRe = new RegExp(bookingSrc, 'i')
      const text = (document.body?.innerText || '').replace(/\s+\n/g, '\n')
      // The real footer is the last <footer> on the page (themes often use
      // "pre-footer" call-to-action blocks); fall back to the end of the page.
      const footers = Array.from(document.querySelectorAll('footer, [role="contentinfo"], [class*="footer" i], [id*="footer" i]')) as HTMLElement[]
      const visibleFooters = footers.filter(f => (f.innerText || '').trim().length > 10)
      const footerEl = visibleFooters.length ? visibleFooters[visibleFooters.length - 1] : null
      const tail = text.slice(-600)
      const footerText = ((footerEl ? footerEl.innerText : '') + (footerEl && /©|copyright/i.test(footerEl.innerText) ? '' : '\n' + tail)).trim().slice(-900)
      const years: number[] = []
      for (const m of (footerText + '\n' + text.slice(-1500)).matchAll(/(?:©|copyright)[^\n]{0,50}/gi)) {
        for (const y of m[0].match(/\b(19|20)\d{2}\b/g) || []) years.push(Number(y))
      }
      const forms = Array.from(document.querySelectorAll('form')).filter(f =>
        f.querySelector('input[type="email"], input[type="tel"], textarea, input[name*="name" i]') &&
        !/search/i.test(f.getAttribute('role') || '') && !f.querySelector('input[type="search"]'),
      ).length
      const frames = Array.from(document.querySelectorAll('iframe, script[src], a[href]')).map(e => (e as any).src || (e as any).href || '')
      const booking = frames.find(s => bookingRe.test(s)) || null
      const ctas = Array.from(document.querySelectorAll('a, button')).map(el => ({
        text: ((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' '),
        href: (el as HTMLAnchorElement).href || null,
      })).filter(c => /book|appointment|schedule|quote|estimate|consult|contact us|get started/i.test(c.text) && c.text.length < 40).slice(0, 8)
      return {
        title: document.title || null,
        text: text.slice(0, 6000),
        footerText,
        year: years.length ? Math.max(...years) : null,
        forms,
        booking,
        ctas,
        viewport: !!document.querySelector('meta[name="viewport"]'),
        height: Math.min(document.body.scrollHeight, 14000),
      }
    }, BOOKING_RE.source)

    // Desktop shots: top, middle and bottom (footer)
    const H = Math.max(860, facts.height)
    const shot = async (y: number) => {
      await page.evaluate((yy: number) => window.scrollTo(0, yy), y)
      await new Promise(r => setTimeout(r, 350))
      return uri(await page.screenshot({ type: 'jpeg', quality: 72 }))
    }
    const desktopTop = await shot(0)
    const desktopMiddle = H > 2600 ? await shot(Math.round(H / 2 - 430)) : null
    const desktopFooter = H > 900 ? await shot(H) : null

    // Phone view
    let mobileTop: string | null = null
    try {
      const m = await browser.newPage()
      opened.push(m)
      await m.setUserAgent(UA_MOBILE)
      await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      await m.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      await new Promise(r => setTimeout(r, 1500))
      mobileTop = uri(await m.screenshot({ type: 'jpeg', quality: 70 }))
    } catch { /* desktop is enough */ }

    const now = new Date().getFullYear()
    return {
      ok: true,
      loaded: true,
      status,
      error: null,
      finalUrl: page.url(),
      title: facts.title,
      desktopTop, desktopMiddle, desktopFooter, mobileTop,
      footerText: facts.footerText || null,
      copyrightYear: facts.year && facts.year > 1990 && facts.year <= now + 1 ? facts.year : null,
      visibleText: facts.text,
      forms: facts.forms,
      bookingWidget: facts.booking,
      ctas: facts.ctas,
      viewportMeta: facts.viewport,
    }
  } catch (err: any) {
    return { ...empty, ok: true, error: String(err?.message || err).slice(0, 160) }
  } finally {
    try { await browser?.close() } catch { /* ignore */ }
  }
}
