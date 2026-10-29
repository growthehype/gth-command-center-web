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
  /** Extra HTML appended after the signature (e.g. CASL opt-out line) */
  footerHtml?: string
  /** Files to attach, e.g. screenshots of the prospect's site */
  attachments?: { filename: string; contentType: string; base64: string }[]
}

/** Build the raw MIME message: HTML body with signature, plus optional attachments. */
function buildMime(params: SendEmailParams): string {
  const htmlBody = linkify(escapeHtml(params.body)).replace(/\n/g, '<br>')
  const html = `<html><body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #222;">${htmlBody}${GTH_EMAIL_SIGNATURE}${params.footerHtml || ''}</body></html>`
  const headers = [
    `To: ${params.to}`,
    `Subject: ${encodeHeader(params.subject)}`,
    'MIME-Version: 1.0',
  ]
  if (params.replyToMessageId) {
    headers.push(`In-Reply-To: ${params.replyToMessageId}`)
    headers.push(`References: ${params.replyToMessageId}`)
  }
  const files = params.attachments || []
  if (!files.length) {
    return [...headers, 'Content-Type: text/html; charset="UTF-8"', '', html].join('\r\n')
  }
  const boundary = `gth_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const wrap = (b64: string) => b64.replace(/(.{76})/g, '$1\r\n')
  const parts = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(Buffer.from(html, 'utf-8').toString('base64')),
  ]
  for (const f of files) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${f.contentType}; name="${f.filename}"`,
      `Content-Disposition: attachment; filename="${f.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap(f.base64),
    )
  }
  parts.push(`--${boundary}--`)
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', ...parts].join('\r\n')
}

/** Turn bare web addresses into links so they are clickable in every mail app. */
function linkify(s: string): string {
  return s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)'"]/g, u => `<a href="${u}" target="_blank" style="color:#1a56db;">${u}</a>`)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** RFC 2047 encode a header value if it contains non-ASCII characters */
function encodeHeader(v: string): string {
  return /[^\x20-\x7E]/.test(v) ? `=?UTF-8?B?${Buffer.from(v, 'utf-8').toString('base64')}?=` : v
}

export async function sendEmail(userId: string, params: SendEmailParams): Promise<{ id: string; threadId: string; rfcMessageId: string | null }> {
  const token = await getAccessToken(userId)
  const mimeMessage = buildMime(params)

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

  // Look up the RFC Message-ID so follow-ups thread for the recipient too
  let rfcMessageId: string | null = null
  try {
    const meta = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${result.id}?format=metadata&metadataHeaders=Message-ID`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (meta.ok) {
      const m = await meta.json()
      const h = (m.payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === 'message-id')
      rfcMessageId = h?.value || null
    }
  } catch { /* threading still works in Omar's mailbox via threadId */ }

  return { id: result.id, threadId: result.threadId, rfcMessageId }
}

// ─── Drafts (Omar sends from Gmail himself) ─────────────────────

/** Put a ready-to-send email into Omar's Gmail Drafts, with his signature. */
export async function createDraft(userId: string, params: SendEmailParams): Promise<{ draftId: string; messageId: string; threadId: string }> {
  const token = await getAccessToken(userId)
  const mime = buildMime(params)
  const message: any = { raw: Buffer.from(mime, 'utf-8').toString('base64url') }
  if (params.threadId) message.threadId = params.threadId

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gmail draft failed (${res.status}): ${JSON.stringify(err)}`)
  }
  const d = await res.json()
  return { draftId: d.id, messageId: d.message?.id, threadId: d.message?.threadId }
}

/** Replace the content of a draft that is still in Omar's Drafts. Returns null if the draft is gone. */
export async function updateDraft(userId: string, draftId: string, params: SendEmailParams): Promise<{ draftId: string; messageId: string; threadId: string } | null> {
  const token = await getAccessToken(userId)
  const message: any = { raw: Buffer.from(buildMime(params), 'utf-8').toString('base64url') }
  if (params.threadId) message.threadId = params.threadId
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: draftId, message }),
  })
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gmail draft update failed (${res.status}): ${JSON.stringify(err)}`)
  }
  const d = await res.json()
  return { draftId: d.id, messageId: d.message?.id, threadId: d.message?.threadId }
}

export interface MessageMeta {
  id: string
  threadId: string
  labelIds: string[]
  from: string
  to: string
  cc: string
  subject: string
  rfcMessageId: string | null
  internalDate: string
  snippet: string
  hasPdf: boolean
}

function metaOf(m: any): MessageMeta {
  const h = (n: string) => (m.payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === n)?.value || ''
  const parts: any[] = []
  const walk = (p: any) => { if (!p) return; parts.push(p); (p.parts || []).forEach(walk) }
  walk(m.payload)
  return {
    id: m.id,
    threadId: m.threadId,
    labelIds: m.labelIds || [],
    from: h('from'),
    to: h('to'),
    cc: h('cc'),
    subject: h('subject'),
    rfcMessageId: h('message-id') || null,
    internalDate: new Date(Number(m.internalDate) || Date.now()).toISOString(),
    snippet: m.snippet || '',
    hasPdf: parts.some(p => /pdf/i.test(p.mimeType || '') || /\.pdf$/i.test(p.filename || '')),
  }
}

/** Every message in a thread, headers only. Null if the thread is gone. */
export async function getThreadMeta(userId: string, threadId: string): Promise<MessageMeta[] | null> {
  const token = await getAccessToken(userId)
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const t = await res.json()
  return (t.messages || []).map(metaOf)
}

/** Search Gmail and return headers for up to max messages (newest first). */
export async function searchMessageMeta(userId: string, q: string, max = 100): Promise<MessageMeta[]> {
  const token = await getAccessToken(userId)
  const ids: string[] = []
  let page: string | undefined
  do {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${Math.min(100, max)}${page ? `&pageToken=${page}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error(`Gmail search failed (${r.status})`)
    const d = await r.json()
    for (const m of d.messages || []) ids.push(m.id)
    page = d.nextPageToken
  } while (page && ids.length < max)
  const out: MessageMeta[] = []
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(ids.slice(i, i + 10).map(async id => {
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID`, { headers: { Authorization: `Bearer ${token}` } })
      return r.ok ? metaOf(await r.json()) : null
    }))
    for (const m of batch) if (m) out.push(m)
  }
  return out
}

/** If the thread now has a message Omar sent, return it (id, time, Message-ID). */
export async function findSentInThread(userId: string, threadId: string, exclude: string[] = []): Promise<{ id: string; sentAt: string; rfcMessageId: string | null } | null> {
  const token = await getAccessToken(userId)
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Message-ID`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (res.status === 404) return null
  if (!res.ok) return null
  const t = await res.json()
  // Newest message Omar sent that isn't one we already recorded (a follow-up
  // draft lives in the same thread as the emails before it)
  const sent = [...(t.messages || [])].reverse().find((m: any) => (m.labelIds || []).includes('SENT') && !(m.labelIds || []).includes('DRAFT') && !exclude.includes(m.id))
  if (!sent) return null
  const h = (sent.payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === 'message-id')
  return { id: sent.id, sentAt: new Date(Number(sent.internalDate) || Date.now()).toISOString(), rfcMessageId: h?.value || null }
}

// ─── List New Messages ──────────────────────────────────────────

interface GmailMessage {
  id: string
  threadId: string
  snippet: string
  internalDate: string
}

export async function listNewMessages(userId: string, query?: string, max = 20): Promise<GmailMessage[]> {
  const token = await getAccessToken(userId)
  const q = query || 'is:unread'
  const out: GmailMessage[] = []
  let page: string | undefined
  do {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${Math.min(100, max)}${page ? `&pageToken=${page}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Gmail list failed (${res.status}): ${JSON.stringify(err)}`)
    }
    const data = await res.json()
    out.push(...(data.messages || []))
    page = data.nextPageToken
  } while (page && out.length < max)
  return out.slice(0, max)
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
