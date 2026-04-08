const GOOGLE_CLIENT_ID = '272925349594-4dtb910g2m3jp2433na7r9eac297hoot.apps.googleusercontent.com'
// Send + Read + Modify + Labels for full inbox experience
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ')
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
  sessionStorage.setItem(GMAIL_STATE_KEY, 'true')
  // Remember which page to return to after OAuth redirect
  const currentHash = window.location.hash?.replace('#', '') || ''
  if (currentHash) sessionStorage.setItem('gth_gmail_return_page', currentHash)
  const redirectUri = window.location.origin
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: GMAIL_SCOPES,
    state: 'gmail',
    include_granted_scopes: 'true',
    prompt: 'consent', // Force consent to get new scopes
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function captureGmailToken(): boolean {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token')) return false

  const params = new URLSearchParams(hash.substring(1))
  const state = params.get('state')
  const pending = sessionStorage.getItem(GMAIL_STATE_KEY)

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
    // Restore the page the user was on before OAuth redirect
    const returnPage = sessionStorage.getItem('gth_gmail_return_page')
    sessionStorage.removeItem('gth_gmail_return_page')
    window.history.replaceState(
      returnPage ? { page: returnPage } : null,
      '',
      returnPage ? `${window.location.pathname}${window.location.search}#${returnPage}` : window.location.pathname + window.location.search
    )
    return true
  }

  return false
}

export function disconnectGmail(): void {
  localStorage.removeItem(GMAIL_TOKEN_KEY)
}

// ─── Gmail API: Inbox / Messages ────────────────────────────────

export interface GmailMessage {
  id: string
  threadId: string
  snippet: string
  labelIds: string[]
  from: string
  to: string
  subject: string
  date: string
  body: string
  isUnread: boolean
}

export interface GmailLabel {
  id: string
  name: string
  type: string
  messagesTotal?: number
  messagesUnread?: number
}

function parseHeader(headers: any[], name: string): string {
  const h = headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
  } catch {
    return str
  }
}

function extractBody(payload: any): string {
  // Simple text/html body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  // Multipart — look for text/html first, then text/plain
  if (payload.parts) {
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (htmlPart?.body?.data) return decodeBase64Url(htmlPart.body.data)
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data)
    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part)
        if (nested) return nested
      }
    }
  }
  return ''
}

async function gmailFetch(path: string, options?: RequestInit) {
  const token = getGmailToken()
  if (!token) throw new Error('Gmail not connected')
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Gmail session expired — please reconnect')
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gmail API error: ${res.status}`)
  }
  return res.json()
}

export async function listMessages(params: {
  query?: string
  labelIds?: string[]
  maxResults?: number
  pageToken?: string
} = {}): Promise<{ messages: GmailMessage[]; nextPageToken?: string; resultSizeEstimate: number }> {
  const q = new URLSearchParams()
  if (params.query) q.set('q', params.query)
  if (params.labelIds?.length) params.labelIds.forEach(l => q.append('labelIds', l))
  q.set('maxResults', String(params.maxResults || 20))
  if (params.pageToken) q.set('pageToken', params.pageToken)

  const list = await gmailFetch(`messages?${q}`)
  if (!list.messages?.length) return { messages: [], resultSizeEstimate: 0 }

  // Batch fetch message details
  const detailed = await Promise.all(
    list.messages.map((m: any) => gmailFetch(`messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`))
  )

  const messages: GmailMessage[] = detailed.map((msg: any) => ({
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet || '',
    labelIds: msg.labelIds || [],
    from: parseHeader(msg.payload?.headers, 'From'),
    to: parseHeader(msg.payload?.headers, 'To'),
    subject: parseHeader(msg.payload?.headers, 'Subject') || '(no subject)',
    date: parseHeader(msg.payload?.headers, 'Date'),
    body: '',
    isUnread: (msg.labelIds || []).includes('UNREAD'),
  }))

  return {
    messages,
    nextPageToken: list.nextPageToken,
    resultSizeEstimate: list.resultSizeEstimate || 0,
  }
}

export async function getMessage(id: string): Promise<GmailMessage> {
  const msg = await gmailFetch(`messages/${id}?format=full`)
  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet || '',
    labelIds: msg.labelIds || [],
    from: parseHeader(msg.payload?.headers, 'From'),
    to: parseHeader(msg.payload?.headers, 'To'),
    subject: parseHeader(msg.payload?.headers, 'Subject') || '(no subject)',
    date: parseHeader(msg.payload?.headers, 'Date'),
    body: extractBody(msg.payload),
    isUnread: (msg.labelIds || []).includes('UNREAD'),
  }
}

export async function markAsRead(id: string): Promise<void> {
  await gmailFetch(`messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  })
}

export async function markAsUnread(id: string): Promise<void> {
  await gmailFetch(`messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
  })
}

export async function archiveMessage(id: string): Promise<void> {
  await gmailFetch(`messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
  })
}

export async function trashMessage(id: string): Promise<void> {
  await gmailFetch(`messages/${id}/trash`, { method: 'POST' })
}

export async function listLabels(): Promise<GmailLabel[]> {
  const data = await gmailFetch('labels')
  return (data.labels || []).map((l: any) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    messagesTotal: l.messagesTotal,
    messagesUnread: l.messagesUnread,
  }))
}

export async function sendEmail(params: {
  to: string
  subject: string
  body: string
  replyToMessageId?: string
  threadId?: string
}): Promise<void> {
  const token = getGmailToken()
  if (!token) throw new Error('Gmail not connected')

  const htmlBody = params.body.replace(/\n/g, '<br>')

  // Dynamic email signature
  const sig = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('gth_email_sig_cache') || '{}')
      return {
        name: s.name || '', title: s.title || '', email: s.email || '',
        phone: s.phone || '', website: s.website || '', logoUrl: s.logoUrl || '',
        tagline: s.tagline || '', companyName: s.companyName || '',
      }
    } catch { return { name: '', title: '', email: '', phone: '', website: '', logoUrl: '', tagline: '', companyName: '' } }
  })()

  const websiteClean = sig.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const websiteFull = sig.website.startsWith('http') ? sig.website : `https://${sig.website}`

  const gthSignature = sig.name ? `
<br><br>
<table cellpadding="0" cellspacing="0" border="0" style="width:460px;max-width:460px;font-family:'Montserrat',Helvetica,Arial,sans-serif;border-collapse:collapse;border:none;">
  <tr><td colspan="3" style="padding:0 0 28px 0;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td style="width:40px;height:2px;background-color:#111111;font-size:1px;line-height:1px;">&nbsp;</td><td style="height:2px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr>
  <tr>
    ${sig.logoUrl ? `<td style="width:74px;vertical-align:top;padding:0;"><a href="${websiteFull}" target="_blank" style="text-decoration:none;border:none;"><img src="${sig.logoUrl}" alt="${sig.companyName}" width="60" height="68" style="display:block;width:60px;height:auto;border:0;outline:none;" /></a></td><td style="width:24px;vertical-align:top;padding:2px 0 0 0;"><table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:collapse;"><tr><td style="width:1px;height:78px;background-color:#D0D0D0;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td>` : ''}
    <td style="vertical-align:top;padding:0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#111111;letter-spacing:0.3px;line-height:1.15;padding:0 0 2px 0;">${sig.name}</td></tr></table>
      ${sig.title ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;font-weight:500;color:#888888;letter-spacing:2.5px;text-transform:uppercase;line-height:1.3;padding:0 0 14px 0;">${sig.title}</td></tr></table>` : ''}
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        ${sig.email ? `<tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;color:#555555;line-height:1.3;padding:0 0 5px 0;"><a href="mailto:${sig.email}" style="color:#555555;text-decoration:none;">${sig.email}</a></td></tr>` : ''}
        ${sig.phone ? `<tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;color:#555555;line-height:1.3;padding:0 0 5px 0;"><a href="tel:${sig.phone.replace(/\D/g, '')}" style="color:#555555;text-decoration:none;">${sig.phone}</a></td></tr>` : ''}
        ${sig.website ? `<tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#111111;line-height:1.3;padding:0;"><a href="${websiteFull}" target="_blank" style="color:#111111;text-decoration:none;">${websiteClean}</a></td></tr>` : ''}
      </table>
    </td>
  </tr>
  ${sig.tagline ? `<tr><td colspan="3" style="padding:20px 0 0 0;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:9px;font-weight:500;color:#BBBBBB;letter-spacing:3px;text-transform:uppercase;line-height:1.3;">${sig.tagline}</td></tr></table></td></tr>` : ''}
</table>` : ''

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
    `<html><body style="font-family: Arial, sans-serif; color: #333;">${htmlBody}${gthSignature}</body></html>`,
  ].join('\r\n')

  const utf8Bytes = new TextEncoder().encode(mimeMessage)
  let binary = ''
  utf8Bytes.forEach(b => { binary += String.fromCharCode(b) })
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const body: any = { raw: encoded }
  if (params.threadId) body.threadId = params.threadId

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = res.status === 401 ? 'Gmail session expired — please reconnect'
      : res.status === 403 ? 'Gmail permission denied — reconnect and grant access'
      : `Failed to send email (${res.status})`
    throw new Error(msg)
  }
}

// ─── Legacy: send with attachment (used by Invoices) ────────────

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

  const sig = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('gth_email_sig_cache') || '{}')
      return {
        name: s.name || '', title: s.title || '', email: s.email || '',
        phone: s.phone || '', website: s.website || '', logoUrl: s.logoUrl || '',
        tagline: s.tagline || '', companyName: s.companyName || '',
      }
    } catch { return { name: '', title: '', email: '', phone: '', website: '', logoUrl: '', tagline: '', companyName: '' } }
  })()

  const websiteClean = sig.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const websiteFull = sig.website.startsWith('http') ? sig.website : `https://${sig.website}`

  const gthSignature = sig.name ? `
<br><br>
<table cellpadding="0" cellspacing="0" border="0" style="width:460px;max-width:460px;font-family:'Montserrat',Helvetica,Arial,sans-serif;border-collapse:collapse;border:none;">
  <tr><td colspan="3" style="padding:0 0 28px 0;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td style="width:40px;height:2px;background-color:#111111;font-size:1px;line-height:1px;">&nbsp;</td><td style="height:2px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr>
  <tr>
    ${sig.logoUrl ? `<td style="width:74px;vertical-align:top;padding:0 0 0 0;"><a href="${websiteFull}" target="_blank" style="text-decoration:none;border:none;"><img src="${sig.logoUrl}" alt="${sig.companyName}" width="60" height="68" style="display:block;width:60px;height:auto;border:0;outline:none;" /></a></td><td style="width:24px;vertical-align:top;padding:2px 0 0 0;"><table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:collapse;"><tr><td style="width:1px;height:78px;background-color:#D0D0D0;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td>` : ''}
    <td style="vertical-align:top;padding:0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#111111;letter-spacing:0.3px;line-height:1.15;padding:0 0 2px 0;">${sig.name}</td></tr></table>
      ${sig.title ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;font-weight:500;color:#888888;letter-spacing:2.5px;text-transform:uppercase;line-height:1.3;padding:0 0 14px 0;">${sig.title}</td></tr></table>` : ''}
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        ${sig.email ? `<tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;color:#555555;line-height:1.3;padding:0 0 5px 0;"><a href="mailto:${sig.email}" style="color:#555555;text-decoration:none;">${sig.email}</a></td></tr>` : ''}
        ${sig.phone ? `<tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;color:#555555;line-height:1.3;padding:0 0 5px 0;"><a href="tel:${sig.phone.replace(/\D/g, '')}" style="color:#555555;text-decoration:none;">${sig.phone}</a></td></tr>` : ''}
        ${sig.website ? `<tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#111111;line-height:1.3;padding:0;"><a href="${websiteFull}" target="_blank" style="color:#111111;text-decoration:none;">${websiteClean}</a></td></tr>` : ''}
      </table>
    </td>
  </tr>
  ${sig.tagline ? `<tr><td colspan="3" style="padding:20px 0 0 0;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:9px;font-weight:500;color:#BBBBBB;letter-spacing:3px;text-transform:uppercase;line-height:1.3;">${sig.tagline}</td></tr></table></td></tr>` : ''}
</table>` : ''

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

  const utf8Bytes = new TextEncoder().encode(mimeMessage)
  let binary = ''
  utf8Bytes.forEach(b => { binary += String.fromCharCode(b) })
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = res.status === 401 ? 'Gmail session expired — please reconnect'
      : res.status === 403 ? 'Gmail permission denied — reconnect and grant send access'
      : `Failed to send email (${res.status})`
    throw new Error(msg)
  }
}

// ─── Google Drive API ───────────────────────────────────────────

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
  iconLink?: string
  webViewLink?: string
  thumbnailLink?: string
  parents?: string[]
}

async function driveFetch(path: string) {
  const token = getGmailToken() // Same token — Drive scope included
  if (!token) throw new Error('Google not connected — please connect Gmail first')
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Google session expired — please reconnect')
    if (res.status === 403) throw new Error('Google Drive access denied — please reconnect Gmail to grant Drive access')
    throw new Error(`Drive API error: ${res.status}`)
  }
  return res.json()
}

export async function listDriveFiles(params: {
  folderId?: string
  query?: string
  pageSize?: number
  pageToken?: string
  orderBy?: string
} = {}): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const q: string[] = []
  if (params.folderId) {
    q.push(`'${params.folderId}' in parents`)
  }
  if (params.query) {
    q.push(`name contains '${params.query.replace(/'/g, "\\'")}'`)
  }
  q.push('trashed = false')

  const urlParams = new URLSearchParams({
    q: q.join(' and '),
    pageSize: String(params.pageSize || 30),
    orderBy: params.orderBy || 'modifiedTime desc',
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink,thumbnailLink,parents)',
  })
  if (params.pageToken) urlParams.set('pageToken', params.pageToken)

  const data = await driveFetch(`files?${urlParams}`)
  return { files: data.files || [], nextPageToken: data.nextPageToken }
}

export async function getDriveFile(fileId: string): Promise<DriveFile> {
  return driveFetch(`files/${fileId}?fields=id,name,mimeType,modifiedTime,size,iconLink,webViewLink,thumbnailLink,parents`)
}

export async function searchDriveFiles(query: string): Promise<DriveFile[]> {
  const { files } = await listDriveFiles({ query, pageSize: 20 })
  return files
}
