// Vercel serverless: Check if authenticated user has a Gmail refresh token stored
// Used on login to restore Gmail connection state across devices
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\\n/g, '')
  const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/\\n/g, '')
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/\\n/g, '')

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' })
  }

  // Authenticate via JWT
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const jwt = authHeader.slice(7)
  const authClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(jwt)

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const sb = createClient(supabaseUrl, supabaseServiceKey)

  // Check integrations table
  const { data: integration } = await sb
    .from('integrations')
    .select('refresh_token, email')
    .eq('user_id', user.id)
    .eq('provider', 'gmail')
    .single()

  if (integration?.refresh_token) {
    return res.status(200).json({ connected: true, email: integration.email || null })
  }

  // Fallback: check legacy user_google_tokens table
  if (user.email) {
    const { data: legacyRow } = await sb
      .from('user_google_tokens')
      .select('refresh_token')
      .eq('email', user.email)
      .single()

    if (legacyRow?.refresh_token) {
      // Migrate to integrations table
      try {
        await sb.from('integrations').upsert(
          {
            user_id: user.id,
            provider: 'gmail',
            refresh_token: legacyRow.refresh_token,
            email: user.email,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,provider' },
        )
      } catch { /* non-fatal */ }

      return res.status(200).json({ connected: true, email: user.email })
    }
  }

  return res.status(200).json({ connected: false })
}
