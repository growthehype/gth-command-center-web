// POST /api/agent/link-gmail — Persist Gmail refresh token to Supabase
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { upsertIntegration } from './_lib/supabase-admin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, refreshToken, accessToken } = req.body ?? {}

  // Support two modes:
  // 1. Frontend sends userId + refreshToken (preferred, from agent-api.ts)
  // 2. Callback page sends accessToken + refreshToken (we look up email from Google)

  if (!refreshToken) {
    return res.status(400).json({ error: 'Missing refreshToken' })
  }

  try {
    let resolvedUserId = userId as string | undefined
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

    // If no userId provided, we can't store yet — return the email so frontend can call back
    if (!resolvedUserId) {
      return res.status(200).json({
        stored: false,
        message: 'No userId provided. Frontend should call again with userId.',
        email,
      })
    }

    // Upsert into integrations table
    await upsertIntegration({
      user_id: resolvedUserId,
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
