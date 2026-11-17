// Approval page for connecting Claude to the Command Center. Runs with the
// same sign-in as the CRM, so only a signed-in Command Center user can approve.
import { supabase } from './lib/supabase'

const app = document.getElementById('app')!
const q = new URLSearchParams(location.search)
const appName = (q.get('app') || 'Claude').slice(0, 60)
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const LOGO = '<img class="logo" src="/icons/gth-clear-192.png" alt="Grow The Hype" />'

async function render() {
  if (!q.get('client_id') || !q.get('redirect_uri') || !q.get('code_challenge')) {
    app.innerHTML = `${LOGO}<h1>Nothing to connect</h1><p>Start the connection from Claude: Settings, Connectors, then add the Command Center.</p>`
    return
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    sessionStorage.setItem('gth_connect_return', location.href)
    app.innerHTML = `${LOGO}<h1>Sign in first</h1><p>Sign in to your Command Center, then come back to this tab and refresh it.</p><a class="btn primary" style="margin-top:22px" href="/" target="_blank" rel="noopener">Open Command Center</a>`
    return
  }
  app.innerHTML = `${LOGO}
    <h1>Connect ${esc(appName)}?</h1>
    <p>${esc(appName)} will be able to work in your Command Center from any chat.</p>
    <ul>
      <li>See clients, projects, tasks, invoices and hosting</li>
      <li>Add and update tasks, projects, client details and notes</li>
      <li>Create invoices as drafts for you to review</li>
      <li class="no">It cannot send emails, delete anything or mark invoices paid</li>
    </ul>
    <p class="who">Signed in as ${esc(session.user.email || '')}</p>
    <button class="primary" id="ok">Allow</button>
    <button class="ghost" id="no">Cancel</button>
    <p class="err" id="err" hidden></p>`
  document.getElementById('no')!.onclick = () => {
    const to = new URL(q.get('redirect_uri')!)
    to.searchParams.set('error', 'access_denied')
    if (q.get('state')) to.searchParams.set('state', q.get('state')!)
    location.replace(to.toString())
  }
  const ok = document.getElementById('ok') as HTMLButtonElement
  ok.onclick = async () => {
    ok.disabled = true; ok.textContent = 'Connecting…'
    const err = document.getElementById('err')!
    try {
      const { data: { session: fresh } } = await supabase.auth.getSession()
      const res = await fetch('/api/oauth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fresh?.access_token || ''}` },
        body: JSON.stringify({ client_id: q.get('client_id'), redirect_uri: q.get('redirect_uri'), code_challenge: q.get('code_challenge'), state: q.get('state') || '' }),
      })
      const j = await res.json()
      if (!res.ok || !j.redirect) throw new Error(j.error_description || 'Could not connect. Start again from Claude.')
      app.innerHTML = `${LOGO}<h1>Connected</h1><p>Taking you back to ${esc(appName)}…</p>`
      location.replace(j.redirect)
    } catch (e: any) {
      err.hidden = false; err.textContent = e.message
      ok.disabled = false; ok.textContent = 'Allow'
    }
  }
}
render()
