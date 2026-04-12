// Vercel serverless: Exchange authorization code for tokens
import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOOGLE_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'

function errorPage(res: VercelResponse, title: string, detail: string, homeUrl: string) {
  res.setHeader('Content-Type', 'text/html')
  return res.send(`<!DOCTYPE html>
<html><head><title>Connection Error</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f0f0f; color: #fff; }
  .card { text-align: center; padding: 2rem; max-width: 500px; }
  .title { color: #ef4444; font-size: 1.3rem; margin-bottom: 0.5rem; }
  .detail { color: #999; font-size: 0.9rem; margin-bottom: 1.5rem; word-break: break-all; }
  a { color: #6366f1; text-decoration: none; padding: 0.6rem 1.5rem; border: 1px solid #6366f1; border-radius: 8px; display: inline-block; }
  a:hover { background: #6366f1; color: #fff; }
</style>
</head><body>
<div class="card">
  <div class="title">${title}</div>
  <div class="detail">${detail}</div>
  <a href="${homeUrl}/#gmail">Back to App</a>
</div>
</body></html>`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const PRODUCTION_URL = 'https://gth-command-center-web-ljda.vercel.app'
  const code = req.query.code as string
  const state = (req.query.state as string) || ''
  const error = req.query.error as string

  const baseUrl = process.env.APP_URL || PRODUCTION_URL

  if (error) {
    return errorPage(res, 'Google denied access', error, baseUrl)
  }
  if (!code) {
    return errorPage(res, 'No authorization code', 'Google did not return a code. Please try again.', baseUrl)
  }

  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim().replace(/\\n/g, '')
  if (!clientSecret) {
    return errorPage(res, 'Server configuration error', 'GOOGLE_CLIENT_SECRET is not set in Vercel environment variables.', baseUrl)
  }

  const redirectUri = `${baseUrl}/api/google-callback`

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()

    if (!tokenRes.ok || !tokens.access_token) {
      return errorPage(
        res,
        'Token exchange failed',
        `Google returned: ${tokens.error || 'unknown'} — ${tokens.error_description || 'no description'}. redirect_uri used: ${redirectUri}`,
        baseUrl,
      )
    }

    // Success — serve page that saves tokens to localStorage and redirects
    const ALLOWED_PAGES = ['gmail', 'dashboard', 'inbox', 'drive', 'integrations-settings', 'settings', 'agents', 'briefing']
    const returnPage = ALLOWED_PAGES.includes(state) ? state : 'gmail'
    const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000
    const appHome = `${baseUrl}/#${returnPage.replace(/'/g, "\\'")}`

    res.setHeader('Content-Type', 'text/html')
    res.send(`<!DOCTYPE html>
<html><head><title>Connecting...</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f0f0f; color: #fff; }
  .card { text-align: center; padding: 2rem; }
  .spinner { width: 40px; height: 40px; border: 3px solid #333; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .success { color: #22c55e; font-size: 1.1rem; }
  .error { color: #ef4444; font-size: 1rem; margin-top: 1rem; }
  a { color: #6366f1; }
</style>
</head>
<body>
<div class="card">
  <div class="spinner" id="spinner"></div>
  <div id="status">Connecting your Google account...</div>
</div>
<script>
  try {
    var tokenData = {
      access_token: ${JSON.stringify(tokens.access_token)},
      refresh_token: ${JSON.stringify(tokens.refresh_token || '')},
      expires_at: ${expiresAt}
    };
    localStorage.setItem('gth_gmail_token', JSON.stringify({
      access_token: tokenData.access_token,
      expires_at: tokenData.expires_at
    }));
    // SECURITY: Refresh token is stored SERVER-SIDE ONLY (Supabase)
    // Never put refresh_token in localStorage — XSS could steal permanent access
    localStorage.setItem('gth_gmail_ever_connected', 'true');

    // Persist refresh token server-side for agent use AND for token refresh
    if (tokenData.refresh_token && tokenData.access_token) {
      fetch('/api/agent/link-gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: tokenData.refresh_token,
          accessToken: tokenData.access_token
        })
      }).catch(function() {}); // fire and forget
    }

    // Verify it saved
    var saved = localStorage.getItem('gth_gmail_token');
    if (!saved) throw new Error('localStorage save failed');

    document.getElementById('spinner').style.display = 'none';
    document.getElementById('status').innerHTML = '<div class="success">Connected successfully! Redirecting...</div>';
    setTimeout(function() { window.location.href = '${appHome}'; }, 1500);
  } catch(e) {
    var safeMsg = (e.message || 'Unknown error').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('status').innerHTML = '<div class="error">Error: ' + safeMsg + '</div><br><br><a href="${appHome}">Go back to app</a>';
  }
</script>
<noscript>JavaScript required. Please enable JavaScript and try again.</noscript>
</body></html>`)
  } catch (err: any) {
    return errorPage(res, 'Unexpected error', err.message || 'Unknown error during token exchange', baseUrl)
  }
}
