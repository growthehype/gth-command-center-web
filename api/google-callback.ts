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
    res.setHeader('Content-Type', 'text/html')
    res.send(`<!DOCTYPE html>
<html><head><title>Connecting...</title></head>
<body>
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
    window.location.href = '/#${returnPage.replace(/'/g, "\\'")}';
  } catch(e) {
    document.body.textContent = 'Error: ' + e.message;
  }
</script>
<noscript>JavaScript required. Please enable JavaScript and try again.</noscript>
</body></html>`)
  } catch (err: any) {
    return res.redirect(`${baseUrl}/#gmail?error=${encodeURIComponent(err.message || 'unknown')}`)
  }
}
