import { chromium } from 'playwright'
import fs from 'node:fs'
const lines = fs.readFileSync('lab/shots.txt', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
fs.mkdirSync('lab/shots', { recursive: true })
const browser = await chromium.launch()
for (const line of lines) {
  const [name, url, mode = 'full'] = line.split(/\s+/)
  try {
    // Desktop: scroll like a visitor so scroll animations run, capture viewport frames
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const p = await ctx.newPage()
    await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
    await p.waitForTimeout(2500)
    await p.screenshot({ path: `lab/shots/${name}-d00.jpg`, type: 'jpeg', quality: 70 })
    const h = await p.evaluate(() => document.documentElement.scrollHeight)
    let y = 0, i = 1
    await p.mouse.move(720, 450)
    while (y < h - 900 && i < 30) {
      for (let k = 0; k < 8; k++) { await p.mouse.wheel(0, 100); await p.waitForTimeout(60) }
      y += 800
      await p.waitForTimeout(1400)
      await p.screenshot({ path: `lab/shots/${name}-d${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 70 })
      i++
    }
    await ctx.close()
    // Phone
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' })
    const mp = await m.newPage()
    await mp.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
    await mp.waitForTimeout(2500)
    const mh = await mp.evaluate(() => document.documentElement.scrollHeight)
    let my = 0, j = 0
    while (my < mh && j < 14) {
      await mp.evaluate(v => window.scrollTo(0, v), my)
      await mp.waitForTimeout(1300)
      await mp.screenshot({ path: `lab/shots/${name}-m${String(j).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 60 })
      my += 760; j++
    }
    await m.close()
    console.log('ok', name)
  } catch (e) { console.log('fail', name, e.message) }
}
await browser.close()
