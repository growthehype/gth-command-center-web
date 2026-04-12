// Vercel serverless: Refresh access token using Supabase-stored refresh token
// SECURITY: Refresh token never leaves the server — client only gets access tokens
// Uses authenticated user ID (JWT) to look up refresh token from integrations table
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

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\\n/g, '')
  const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/\\n/g, '')
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/\\n/g, '')

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' })
  }

  // ── Authenticate the user via Supabase JWT ──
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const jwt = authHeader.slice(7)
  const authClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(jwt)

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' })
  }

  // ── Look up refresh token from integrations table by user ID ──
  const sb = createClient(supabaseUrl, supabaseServiceKey)

  // Primary: integrations table (where link-gmail saves it)
  const { data: integration } = await sb
    .from('integrations')
    .select('refresh_token')
    .eq('user_id', user.id)
    .eq('provider', 'gmail')
    .single()

  let refreshToken = integration?.refresh_token || null

  // Fallback: user_google_tokens table (legacy)
  if (!refreshToken) {
    const { data: legacyRow } = await sb
      .from('user_google_tokens')
      .select('refresh_token')
      .eq('email', user.email)
      .single()

    refreshToken = legacyRow?.refresh_token || null

    // If found in legacy table, migrate to integrations table for future lookups
    if (refreshToken) {
      await sb.from('integrations').upsert(
        {
          user_id: user.id,
          provider: 'gmail',
          refresh_token: refreshToken,
          email: user.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' },
      ).catch(() => { /* non-fatal */ })
    }
  }

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token found. Please reconnect Gmail.' })
  }

  // ── Exchange refresh token for a new access token ──
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
      // If Google says the refresh token is revoked/invalid, clean up
      if (data.error === 'invalid_grant') {
        await sb.from('integrations').delete().eq('user_id', user.id).eq('provider', 'gmail').catch(() => {})
      }
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
