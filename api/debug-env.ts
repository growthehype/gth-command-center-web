// Temporary diagnostic — DELETE after confirming
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const clientId = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim().replace(/\\n/g, '')
  const redirectUri = (process.env.APP_URL || 'https://gth-command-center-web-ljda.vercel.app') + '/api/google-callback'

  // Send dummy code to Google to test if credentials are accepted
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: 'test_dummy_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const body = await tokenRes.json()

  res.json({
    secret_length: clientSecret.length,
    secret_starts: clientSecret.slice(0, 6),
    secret_ends: clientSecret.slice(-4),
    redirect_uri: redirectUri,
    google_status: tokenRes.status,
    google_error: body.error,
    google_error_description: body.error_description,
  })
}
