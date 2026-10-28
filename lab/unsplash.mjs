import { chromium } from 'playwright'
import fs from 'node:fs'
const qs = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', viewport: { width: 1440, height: 1000 } })
const all = new Map()
for (const q of qs) {
  try {
    await p.goto(`https://unsplash.com/s/photos/${q}?license=free`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    for (let i = 0; i < 12; i++) { await p.waitForTimeout(1500); if (!(await p.title()).includes('Checking')) break }
    await p.waitForTimeout(2500)
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(700) }
    const items = await p.evaluate(() => [...document.querySelectorAll('figure a[href*="/photos/"]')].map(a => {
      const img = a.querySelector('img[src*="images.unsplash.com/photo-"]')
      const fig = a.closest('figure')
      return img ? { href: a.href, src: img.src.split('?')[0], alt: img.alt, plus: /unsplash\+|plus\.unsplash/i.test(fig?.innerHTML || '') } : null
    }).filter(Boolean))
    console.log(q, await p.title(), items.length)
    for (const it of items) if (!it.plus && !all.has(it.src)) all.set(it.src, it)
  } catch (e) { console.log('fail', q, e.message) }
}
fs.writeFileSync('lab/out/unsplash/list.json', JSON.stringify([...all.values()], null, 1))
await b.close()
