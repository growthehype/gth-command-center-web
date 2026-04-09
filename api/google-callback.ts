// Vercel serverless: Exchange authorization code for tokens
import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOOGLE_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string
  const state = (req.query.state as string) || ''
  const error = req.query.error as string
  const host = req.headers.host || ''
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const origin = `${protocol}://${host}`

  const baseUrl = process.env.APP_URL || origin

  if (error) {
    return res.redirect(`${baseUrl}/#gmail?error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return res.redirect(`${baseUrl}/#gmail?error=no_code`)
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientSecret) {
    return res.redirect(`${baseUrl}/#gmail?error=server_missing_secret`)
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
      return res.redirect(`${baseUrl}/#gmail?error=${encodeURIComponent(tokens.error || 'token_exchange_failed')}`)
    }

    // Build a response that the frontend will read
    // Pass tokens via a temporary page that stores them and redirects
    const returnPage = state || 'gmail'
    const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000

    // Serve a small HTML page that saves tokens to localStorage and redirects
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
    if (tokenData.refresh_token) {
      localStorage.setItem('gth_gmail_refresh_token', tokenData.refresh_token);
    }
    localStorage.setItem('gth_gmail_ever_connected', 'true');

    // Verify it saved
    var saved = localStorage.getItem('gth_gmail_token');
    if (!saved) throw new Error('localStorage save failed');

    document.getElementById('spinner').style.display = 'none';
    document.getElementById('status').innerHTML = '<div class="success">Connected successfully! Redirecting...</div>';
    setTimeout(function() { window.location.href = '${appHome}'; }, 1000);
  } catch(e) {
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('status').innerHTML = '<div class="error">Error: ' + e.message + '</div><br><a href="${appHome}">Go back to app</a>';
  }
</script>
<noscript>JavaScript required. Please enable JavaScript and try again.</noscript>
</body></html>`)
  } catch (err: any) {
    return res.redirect(`${baseUrl}/#gmail?error=${encodeURIComponent(err.message || 'unknown')}`)
  }
}
