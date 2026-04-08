const GOOGLE_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const GMAIL_TOKEN_KEY = 'gth_gmail_token'
const GMAIL_STATE_KEY = 'gth_gmail_auth_pending'

interface GmailToken {
  access_token: string
  expires_at: number
}

function getLocalToken(): GmailToken | null {
  try {
    const raw = localStorage.getItem(GMAIL_TOKEN_KEY)
    if (!raw) return null
    return JSON.parse(raw) as GmailToken
  } catch {
    localStorage.removeItem(GMAIL_TOKEN_KEY)
    return null
  }
}

export function isGmailConnected(): boolean {
  const token = getLocalToken()
  return !!token && Date.now() < token.expires_at - 60_000
}

export function getGmailToken(): string | null {
  const token = getLocalToken()
  if (!token || Date.now() >= token.expires_at - 60_000) return null
  return token.access_token
}

export function connectGmail(): void {
  // Store flag so we know this is a gmail auth on return
  sessionStorage.setItem(GMAIL_STATE_KEY, 'true')

  const redirectUri = window.location.origin + window.location.pathname
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: GMAIL_SCOPE,
    state: 'gmail',
    include_granted_scopes: 'true',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function captureGmailToken(): boolean {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token')) return false

  const params = new URLSearchParams(hash.substring(1))
  const state = params.get('state')
  const pending = sessionStorage.getItem(GMAIL_STATE_KEY)

  // Only capture if this was a gmail auth flow
  if (state !== 'gmail' && !pending) return false

  const token = params.get('access_token')
  const expiresIn = params.get('expires_in')

  if (token) {
    const seconds = expiresIn ? parseInt(expiresIn, 10) : 3600
    const stored: GmailToken = {
      access_token: token,
      expires_at: Date.now() + seconds * 1000,
    }
    localStorage.setItem(GMAIL_TOKEN_KEY, JSON.stringify(stored))
    sessionStorage.removeItem(GMAIL_STATE_KEY)
    window.history.replaceState(null, '', window.location.pathname)
    return true
  }

  return false
}

export function disconnectGmail(): void {
  localStorage.removeItem(GMAIL_TOKEN_KEY)
}

export async function sendEmailWithAttachment(params: {
  to: string
  subject: string
  body: string
  attachmentBase64: string
  attachmentName: string
}): Promise<void> {
  const token = getGmailToken()
  if (!token) throw new Error('Gmail not connected')

  const boundary = 'gth_boundary_' + Date.now()

  const htmlBody = params.body.replace(/\n/g, '<br>')

  const mimeMessage = [
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    'MIME-Version: 1.0',
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    `<html><body style="font-family: Arial, sans-serif; color: #333;">${htmlBody}</body></html>`,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${params.attachmentName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${params.attachmentName}"`,
    '',
    params.attachmentBase64,
    '',
    `--${boundary}--`,
  ].join('\r\n')

  // Gmail API requires URL-safe base64 encoding of the entire MIME message
  const encoded = btoa(unescape(encodeURIComponent(mimeMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail send failed (${res.status})`)
  }
}
