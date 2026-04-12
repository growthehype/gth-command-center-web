// Vercel serverless: Refresh access token using Supabase-stored refresh token
// SECURITY: Refresh token never leaves the server — client only gets access tokens
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const GOOGLE_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim().replace(/\\n/g, '')
  if (!clientSecret) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_SECRET not configured' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' })
  }

  const sb = createClient(supabaseUrl.trim().replace(/\\n/g, ''), supabaseKey.trim().replace(/\\n/g, ''))

  // Get the access token from the Authorization header to identify the user
  const authHeader = req.headers.authorization
  let userEmail: string | null = null

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const accessToken = authHeader.slice(7)
    // Use the current (possibly expired) access token to get the user's email from Google
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json()
        userEmail = userInfo.email
      }
    } catch { /* ignore - will try other methods */ }
  }

  // If we couldn't get email from Google, try to find by checking all stored tokens
  // This is a fallback — ideally the frontend sends the user ID
  if (!userEmail) {
    // Try getting email from the request body if provided
    userEmail = req.body?.email || null
  }

  if (!userEmail) {
    return res.status(400).json({ error: 'Could not identify user. Please reconnect Gmail.' })
  }

  // Fetch refresh token from Supabase
  const { data: tokenRow, error: dbErr } = await sb
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('email', userEmail)
    .single()

  if (dbErr || !tokenRow?.refresh_token) {
    return res.status(401).json({ error: 'No refresh token found. Please reconnect Gmail.' })
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: clientSecret,
        refresh_token: tokenRow.refresh_token,
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
