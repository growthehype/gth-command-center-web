# live mobile check of invoice modal X (run 2)
mkdir -p lab/out && cd lab/out && npm init -y >/dev/null && npm i -s playwright@1.48.2 >/dev/null && npx playwright install --with-deps chromium >/dev/null 2>&1
cat > x.mjs <<'J'
import { chromium } from 'playwright'
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})
await p.goto('https://gth-command-center-web-ljda.vercel.app/'); await p.evaluate(()=>{localStorage.gth_demo_mode='true';localStorage.gth_onboarded='true'}); await p.reload(); await p.waitForTimeout(3000)
const scripts=await p.evaluate(()=>[...document.scripts].map(s=>s.src).join(' ')); console.log('scripts',scripts)
await p.evaluate(()=>[...document.querySelectorAll('.sb-item-label')].find(e=>e.textContent.trim()==='Invoices')?.click()); await p.waitForTimeout(2000)
await p.evaluate(()=>[...document.querySelectorAll('button')].find(e=>/New Invoice/.test(e.textContent))?.click()); await p.waitForTimeout(1500)
await p.screenshot({path:'live-top.png'})
console.log('parent', await p.evaluate(()=>document.querySelector('.modal-backdrop')?.parentElement?.tagName))
const box=await p.locator('.modal-close-btn').first().boundingBox(); console.log('box',JSON.stringify(box))
console.log('top el', await p.evaluate(b=>{const e=document.elementFromPoint(b.x+22,b.y+22);return e?.outerHTML.slice(0,120)},box))
await b.close()
J
node x.mjs > probe.txt 2>&1
