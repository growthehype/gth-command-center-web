// Vercel serverless function — proxies Claude API calls so the key never touches the browser
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, incrementCounter } from './agent/_lib/rate-limiter'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
  }

  // ── Auth: require Supabase JWT ──
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

  // ── Request validation ──
  const body = req.body
  if (!body || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: 'Invalid request: messages must be an array' })
  }
  if (body.model && typeof body.model !== 'string') {
    return res.status(400).json({ error: 'Invalid request: model must be a string' })
  }

  // ── Rate limiting: 200 requests per day per user ──
  const rateCheck = await checkRateLimit(user.id, 'ai_proxy', 200)
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Maximum 200 AI requests per day.',
      used: rateCheck.used,
      limit: rateCheck.limit,
    })
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const data = await upstream.json()

    if (!upstream.ok) {
      return res.status(upstream.status).json(data)
    }

    // Increment rate limit counter on success
    await incrementCounter(user.id, 'ai_proxy')

    return res.status(200).json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Proxy error' })
  }
}
