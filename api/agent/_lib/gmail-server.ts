// Server-side Gmail operations using stored refresh tokens
import { getGmailRefreshToken, getAdminClient } from './supabase-admin'

const GOOGLE_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'

// ─── Access Token ───────────────────────────────────────────────

// In-memory cache: userId -> { token, expiresAt }
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getAccessToken(userId: string): Promise<string> {
  // Check cache
  const cached = tokenCache.get(userId)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token
  }

  const refreshToken = await getGmailRefreshToken(userId)
  if (!refreshToken) throw new Error('No Gmail refresh token found for user')

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientSecret) throw new Error('GOOGLE_CLIENT_SECRET not configured')

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
    throw new Error(`Gmail token refresh failed: ${data.error_description || data.error || 'unknown'}`)
  }

  // Cache the token
  tokenCache.set(userId, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  })

  return data.access_token
}

// ─── Send Email ─────────────────────────────────────────────────

interface SendEmailParams {
  to: string
  subject: string
  body: string
  replyToMessageId?: string
  threadId?: string
}

export async function sendEmail(userId: string, params: SendEmailParams): Promise<{ id: string; threadId: string }> {
  const token = await getAccessToken(userId)
  const htmlBody = params.body.replace(/\n/g, '<br>')

  const headers = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/html; charset="UTF-8"',
    'MIME-Version: 1.0',
  ]
  if (params.replyToMessageId) {
    headers.push(`In-Reply-To: ${params.replyToMessageId}`)
    headers.push(`References: ${params.replyToMessageId}`)
  }

  const mimeMessage = [
    ...headers,
    '',
    `<html><body style="font-family: Arial, sans-serif; color: #333;">${htmlBody}${GTH_EMAIL_SIGNATURE}</body></html>`,
  ].join('\r\n')

  const encoded = Buffer.from(mimeMessage, 'utf-8').toString('base64url')

  const body: any = { raw: encoded }
  if (params.threadId) body.threadId = params.threadId

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gmail send failed (${res.status}): ${JSON.stringify(err)}`)
  }

  const result = await res.json()
  return { id: result.id, threadId: result.threadId }
}

// ─── List New Messages ──────────────────────────────────────────

interface GmailMessage {
  id: string
  threadId: string
  snippet: string
  internalDate: string
}

export async function listNewMessages(userId: string, query?: string): Promise<GmailMessage[]> {
  const token = await getAccessToken(userId)
  const q = query || 'is:unread'

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gmail list failed (${res.status}): ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  return data.messages || []
}

// ─── Get Full Message Content ───────────────────────────────────

interface MessageContent {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  bodyText: string
  bodyHtml: string
}

export async function getMessageContent(userId: string, messageId: string): Promise<MessageContent> {
  const token = await getAccessToken(userId)

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gmail get message failed (${res.status}): ${JSON.stringify(err)}`)
  }

  const msg = await res.json()

  // Extract headers
  const getHeader = (name: string) =>
    msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  // Extract body parts
  let bodyText = ''
  let bodyHtml = ''

  function extractParts(payload: any) {
    if (payload.body?.data) {
      const decoded = Buffer.from(payload.body.data, 'base64url').toString('utf-8')
      if (payload.mimeType === 'text/plain') bodyText = decoded
      if (payload.mimeType === 'text/html') bodyHtml = decoded
    }
    if (payload.parts) {
      for (const part of payload.parts) extractParts(part)
    }
  }

  extractParts(msg.payload)

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    snippet: msg.snippet || '',
    bodyText,
    bodyHtml,
  }
}

// ─── GTH Email Signature (exact copy from gth-signature-HOSTED-FINAL.html) ──

const GTH_EMAIL_SIGNATURE = `
<br><br>
<table cellpadding="0" cellspacing="0" border="0" style="width:460px;max-width:460px;font-family:'Figtree',Helvetica,Arial,sans-serif;border-collapse:collapse;border:none;">
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
          <td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#111111;letter-spacing:0.3px;line-height:1.15;padding:0 0 2px 0;">Omar Alladina</td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:11px;font-weight:500;color:#888888;letter-spacing:2.5px;text-transform:uppercase;line-height:1.3;padding:0 0 14px 0;">Chief Marketing Strategist</td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;color:#555555;line-height:1.3;padding:0 0 5px 0;">
            <a href="mailto:omar@growthehype.ca" style="color:#555555;text-decoration:none;">omar@growthehype.ca</a>
          </td>
        </tr>
        <tr>
          <td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;color:#555555;line-height:1.3;padding:0 0 5px 0;">
            <a href="tel:+17809664986" style="color:#555555;text-decoration:none;">(780) 966-4986</a>
          </td>
        </tr>
        <tr>
          <td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#111111;line-height:1.3;padding:0;">
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
          <td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:9px;font-weight:500;color:#BBBBBB;letter-spacing:3px;text-transform:uppercase;line-height:1.3;">Strategy&nbsp;&nbsp;&middot;&nbsp;&nbsp;Design&nbsp;&nbsp;&middot;&nbsp;&nbsp;Growth</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
