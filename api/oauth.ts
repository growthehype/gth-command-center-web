// OAuth 2.1 for the Claude connector (authorization code + PKCE, dynamic
// client registration). Omar approves the connection while signed in to the
// Command Center; Claude only ever gets short-lived tokens tied to his account.
// Routes (see vercel.json rewrites):
//   /.well-known/oauth-authorization-server  -> ?op=as
//   /.well-known/oauth-protected-resource    -> ?op=resource
//   /api/oauth/register | authorize | approve | token | revoke
import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from './agent/_lib/supabase-admin'
import { origin, redirectAllowed, sha256, randomToken, issueTokens, CODE_TTL_S } from './agent/_lib/oauth-store'

const cors = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version')
  res.setHeader('Cache-Control', 'no-store')
}
const oauthError = (res: VercelResponse, status: number, error: string, description?: string) =>
  res.status(status).json({ error, ...(description ? { error_description: description } : {}) })

function body(req: VercelRequest): Record<string, any> {
  if (req.body && typeof req.body === 'object') return req.body
  const s = typeof req.body === 'string' ? req.body : ''
  if (!s) return {}
  try { return JSON.parse(s) } catch { return Object.fromEntries(new URLSearchParams(s)) }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  const op = String(req.query.op || '')
  const base = origin(req)
  const sb = getAdminClient()

  // ── discovery ──
  if (op === 'as') {
    return res.status(200).json({
      issuer: base,
      authorization_endpoint: `${base}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      revocation_endpoint: `${base}/api/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['crm'],
    })
  }
  if (op === 'resource') {
    return res.status(200).json({ resource: `${base}/api/mcp`, authorization_servers: [base], bearer_methods_supported: ['header'], scopes_supported: ['crm'], resource_name: 'Command Center' })
  }

  // ── dynamic client registration (only Claude's callback URLs are accepted) ──
  if (op === 'register') {
    if (req.method !== 'POST') return oauthError(res, 405, 'invalid_request')
    const b = body(req)
    const uris: string[] = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : []
    if (!uris.length || uris.length > 5 || !uris.every(redirectAllowed)) return oauthError(res, 400, 'invalid_redirect_uri', 'Only Claude can connect to the Command Center.')
    const clientId = 'cc_' + randomToken(18)
    const name = String(b.client_name || 'Claude').slice(0, 80)
    const { error } = await sb.from('mcp_oauth_clients').insert({ client_id: clientId, client_name: name, redirect_uris: uris })
    if (error) return oauthError(res, 500, 'server_error')
    return res.status(201).json({ client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] })
  }

  const checkClient = async (clientId: string, redirectUri: string) => {
    const { data } = await sb.from('mcp_oauth_clients').select('client_id, client_name, redirect_uris').eq('client_id', clientId).maybeSingle()
    if (!data || !(data.redirect_uris as string[]).includes(redirectUri) || !redirectAllowed(redirectUri)) return null
    return data
  }

  // ── authorize: hand off to the approval page, which runs with Omar's CRM sign-in ──
  if (op === 'authorize') {
    const q = req.query as Record<string, string>
    if (q.response_type !== 'code') return oauthError(res, 400, 'unsupported_response_type')
    if (!q.code_challenge || (q.code_challenge_method || 'S256') !== 'S256') return oauthError(res, 400, 'invalid_request', 'PKCE (S256) is required.')
    const client = await checkClient(String(q.client_id || ''), String(q.redirect_uri || ''))
    if (!client) return oauthError(res, 400, 'invalid_client', 'Unknown app or callback address.')
    const params = new URLSearchParams({ client_id: q.client_id, redirect_uri: q.redirect_uri, code_challenge: q.code_challenge, state: q.state || '', app: client.client_name || 'Claude' })
    res.setHeader('Location', `${base}/connect-claude.html?${params}`)
    return res.status(302).end()
  }

  // ── approve: called by the approval page with Omar's CRM session ──
  if (op === 'approve') {
    if (req.method !== 'POST') return oauthError(res, 405, 'invalid_request')
    const auth = String(req.headers.authorization || '')
    if (!auth.startsWith('Bearer ')) return oauthError(res, 401, 'access_denied', 'Sign in to the Command Center first.')
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
    const { data: { user } } = await createClient(url, anon).auth.getUser(auth.slice(7))
    if (!user) return oauthError(res, 401, 'access_denied', 'Your Command Center sign-in has expired. Sign in again.')
    const b = body(req)
    const client = await checkClient(String(b.client_id || ''), String(b.redirect_uri || ''))
    if (!client || !b.code_challenge) return oauthError(res, 400, 'invalid_request')
    const code = randomToken(32)
    const { error } = await sb.from('mcp_oauth_codes').insert({ code_hash: sha256(code), client_id: client.client_id, user_id: user.id, redirect_uri: b.redirect_uri, code_challenge: String(b.code_challenge), expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString() })
    if (error) return oauthError(res, 500, 'server_error')
    await sb.from('activity_log').insert({ user_id: user.id, type: 'security', description: `Claude connected to the Command Center (${client.client_name || 'Claude'})`, timestamp: new Date().toISOString() }).then(() => {}, () => {})
    const to = new URL(String(b.redirect_uri))
    to.searchParams.set('code', code)
    if (b.state) to.searchParams.set('state', String(b.state))
    to.searchParams.set('iss', base)
    return res.status(200).json({ redirect: to.toString() })
  }

  // ── token ──
  if (op === 'token') {
    if (req.method !== 'POST') return oauthError(res, 405, 'invalid_request')
    const b = body(req)
    if (b.grant_type === 'authorization_code') {
      const { data: row } = await sb.from('mcp_oauth_codes').select('*').eq('code_hash', sha256(String(b.code || ''))).maybeSingle()
      if (!row || row.used || new Date(row.expires_at).getTime() < Date.now()) return oauthError(res, 400, 'invalid_grant')
      if (b.client_id && b.client_id !== row.client_id) return oauthError(res, 400, 'invalid_grant')
      if (b.redirect_uri && b.redirect_uri !== row.redirect_uri) return oauthError(res, 400, 'invalid_grant')
      const verifier = String(b.code_verifier || '')
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
      if (!verifier || challenge !== row.code_challenge) return oauthError(res, 400, 'invalid_grant', 'PKCE check failed.')
      // One use only
      const { data: claimed } = await sb.from('mcp_oauth_codes').update({ used: true }).eq('code_hash', row.code_hash).eq('used', false).select('code_hash')
      if (!claimed?.length) return oauthError(res, 400, 'invalid_grant')
      return res.status(200).json(await issueTokens(row.client_id, row.user_id))
    }
    if (b.grant_type === 'refresh_token') {
      const hash = sha256(String(b.refresh_token || ''))
      const { data: row } = await sb.from('mcp_oauth_tokens').select('*').eq('token_hash', hash).eq('kind', 'refresh').maybeSingle()
      if (!row || row.revoked || new Date(row.expires_at).getTime() < Date.now()) return oauthError(res, 400, 'invalid_grant')
      if (b.client_id && b.client_id !== row.client_id) return oauthError(res, 400, 'invalid_grant')
      // Rotate: the old refresh token stops working
      const { data: claimed } = await sb.from('mcp_oauth_tokens').update({ revoked: true }).eq('token_hash', hash).eq('revoked', false).select('token_hash')
      if (!claimed?.length) return oauthError(res, 400, 'invalid_grant')
      return res.status(200).json(await issueTokens(row.client_id, row.user_id))
    }
    return oauthError(res, 400, 'unsupported_grant_type')
  }

  // ── revoke (RFC 7009): always 200 ──
  if (op === 'revoke') {
    const b = body(req)
    if (b.token) await sb.from('mcp_oauth_tokens').update({ revoked: true }).eq('token_hash', sha256(String(b.token)))
    return res.status(200).json({})
  }

  return oauthError(res, 404, 'not_found')
}
