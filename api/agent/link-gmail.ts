// POST /api/agent/link-gmail — Persist Gmail refresh token to Supabase
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { upsertIntegration } from './_lib/supabase-admin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Require JWT auth — extract userId from token
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const token = authHeader.slice(7)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const userId = user.id
  const { refreshToken, accessToken } = req.body ?? {}

  if (!refreshToken) {
    return res.status(400).json({ error: 'Missing refreshToken' })
  }

  try {
    let email: string | undefined

    // If we have an access token, fetch the Google user's email
    if (accessToken) {
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (userInfoRes.ok) {
          const info = await userInfoRes.json()
          email = info.email
        }
      } catch {
        // Non-fatal — we can still store without email
      }
    }

    // Upsert into integrations table
    await upsertIntegration({
      user_id: userId,
      provider: 'gmail',
      refresh_token: refreshToken,
      email,
    })

    return res.status(200).json({ stored: true, email })
  } catch (err: any) {
    console.error('link-gmail error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
