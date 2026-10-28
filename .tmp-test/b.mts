import * as M from '../api/agent/_lib/browser.ts'
const mod: any = (M as any).captureWithBrowser ? M : (M as any).default
const r = await mod.captureWithBrowser('http://127.0.0.1:8765/')
console.log({ ...r, desktopTop: r.desktopTop?.length, desktopMiddle: r.desktopMiddle?.length, desktopFooter: r.desktopFooter?.length, mobileTop: r.mobileTop?.length, visibleText: r.visibleText.length })
const d = await mod.captureWithBrowser('http://127.0.0.1:9/')
console.log('down:', d.ok, d.loaded, d.error)
