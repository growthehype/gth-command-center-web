// Token storage for the Claude connector. Only SHA-256 hashes of codes and
// tokens are stored, so a database leak does not expose working tokens.
import crypto from 'node:crypto'
import { getAdminClient } from './supabase-admin'

export const ACCESS_TTL_S = 60 * 60          // 1 hour
export const REFRESH_TTL_S = 60 * 60 * 24 * 60 // 60 days
export const CODE_TTL_S = 5 * 60

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')

/** Allowed hosts this server answers on; anything else falls back to the main domain. */
const HOSTS = ['app.growthehype.ca', 'gth-command-center-web-ljda.vercel.app']
export function origin(req: { headers: Record<string, any> }) {
  const h = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase()
  return `https://${HOSTS.includes(h) ? h : HOSTS[0]}`
}

/** Only Claude's own callback pages, or this computer (Claude Code / desktop), may receive codes. */
export function redirectAllowed(uri: string) {
  try {
    const u = new URL(uri)
    if (u.protocol === 'https:' && ['claude.ai', 'claude.com'].includes(u.hostname) && u.pathname === '/api/mcp/auth_callback') return true
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true
    return false
  } catch { return false }
}

export async function issueTokens(clientId: string, userId: string) {
  const sb = getAdminClient()
  const access = randomToken(32)
  const refresh = randomToken(40)
  const now = Date.now()
  const { error } = await sb.from('mcp_oauth_tokens').insert([
    { token_hash: sha256(access), kind: 'access', client_id: clientId, user_id: userId, expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString() },
    { token_hash: sha256(refresh), kind: 'refresh', client_id: clientId, user_id: userId, expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString() },
  ])
  if (error) throw new Error(error.message)
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: 'crm' }
}

/** Returns the user id for a valid, unexpired, unrevoked access token. */
export async function userForAccessToken(token: string): Promise<string | null> {
  if (!token || token.length < 20) return null
  const sb = getAdminClient()
  const { data } = await sb.from('mcp_oauth_tokens').select('user_id, expires_at, revoked, last_used_at').eq('token_hash', sha256(token)).eq('kind', 'access').maybeSingle()
  if (!data || data.revoked || new Date(data.expires_at).getTime() < Date.now()) return null
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 5 * 60_000) {
    await sb.from('mcp_oauth_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', sha256(token)).then(() => {}, () => {})
  }
  return data.user_id
}
