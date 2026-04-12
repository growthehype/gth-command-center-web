// Vercel serverless: Refresh access token using stored refresh token
import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOOGLE_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim().replace(/\\n/g, '')
  if (!clientSecret) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_SECRET not configured' })
  }

  const refreshToken = req.body?.refresh_token
  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json({ error: 'refresh_token required (must be a string)' })
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    const data = await tokenRes.json()

    if (!tokenRes.ok || !data.access_token) {
      return res.status(tokenRes.status).json({
        error: data.error || 'refresh_failed',
        error_description: data.error_description || '',
      })
    }

    return res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Unknown error' })
  }
}
