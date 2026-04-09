// Vercel serverless: Start Google OAuth with authorization code flow
import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOOGLE_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ')

export default function handler(req: VercelRequest, res: VercelResponse) {
  const host = req.headers.host || ''
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${protocol}://${host}`
  const returnPage = (req.query.returnPage as string) || ''

  const redirectUri = `${baseUrl}/api/google-callback`

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',     // This gives us a refresh_token
    prompt: 'consent',           // Required to get refresh_token
    state: returnPage || 'gmail',
    include_granted_scopes: 'true',
  })

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
