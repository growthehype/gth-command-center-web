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

  const redirectUri = window.location.origin
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

  // GTH Email Signature — Omar Alladina
  const gthSignature = `
<br><br>
<table cellpadding="0" cellspacing="0" border="0" style="width:460px;max-width:460px;font-family:'Montserrat',Helvetica,Arial,sans-serif;border-collapse:collapse;border:none;">
  <tr>
    <td colspan="3" style="padding:0 0 28px 0;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:40px;height:2px;background-color:#111111;font-size:1px;line-height:1px;">&nbsp;</td>
          <td style="height:2px;font-size:1px;line-height:1px;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="width:74px;vertical-align:top;padding:0 0 0 0;">
      <a href="https://growthehype.ca" target="_blank" style="text-decoration:none;border:none;">
        <img src="https://i.imgur.com/69I8Ojh.png" alt="Grow The Hype" width="60" height="68" style="display:block;width:60px;height:auto;border:0;outline:none;" />
      </a>
    </td>
    <td style="width:24px;vertical-align:top;padding:2px 0 0 0;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:collapse;">
        <tr>
          <td style="width:1px;height:78px;background-color:#D0D0D0;font-size:1px;line-height:1px;">&nbsp;</td>
        </tr>
      </table>
    </td>
    <td style="vertical-align:top;padding:0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#111111;letter-spacing:0.3px;line-height:1.15;padding:0 0 2px 0;">Omar Alladina</td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;font-weight:500;color:#888888;letter-spacing:2.5px;text-transform:uppercase;line-height:1.3;padding:0 0 14px 0;">Chief Marketing Strategist</td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;color:#555555;line-height:1.3;padding:0 0 5px 0;">
            <a href="mailto:omar@growthehype.ca" style="color:#555555;text-decoration:none;">omar@growthehype.ca</a>
          </td>
        </tr>
        <tr>
          <td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;color:#555555;line-height:1.3;padding:0 0 5px 0;">
            <a href="tel:+17809664986" style="color:#555555;text-decoration:none;">(780) 966-4986</a>
          </td>
        </tr>
        <tr>
          <td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#111111;line-height:1.3;padding:0;">
            <a href="https://growthehype.ca" target="_blank" style="color:#111111;text-decoration:none;">growthehype.ca</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="3" style="padding:20px 0 0 0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:9px;font-weight:500;color:#BBBBBB;letter-spacing:3px;text-transform:uppercase;line-height:1.3;">Strategy&nbsp;&nbsp;&middot;&nbsp;&nbsp;Design&nbsp;&nbsp;&middot;&nbsp;&nbsp;Growth</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`

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
    `<html><body style="font-family: Arial, sans-serif; color: #333;">${htmlBody}${gthSignature}</body></html>`,
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
  const utf8Bytes = new TextEncoder().encode(mimeMessage)
  let binary = ''
  utf8Bytes.forEach(b => { binary += String.fromCharCode(b) })
  const encoded = btoa(binary)
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
    console.error('Gmail API error:', err)
    const msg = res.status === 401 ? 'Gmail session expired — please reconnect'
      : res.status === 403 ? 'Gmail permission denied — reconnect and grant send access'
      : `Failed to send email (${res.status})`
    throw new Error(msg)
  }
}
