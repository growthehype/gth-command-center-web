// ─── Google Auth: Server-side refresh token flow ───────────────
// Refresh tokens stored server-side (Supabase) for permanent cross-device auth.
// Client only holds short-lived access tokens in localStorage.

import { supabase } from '@/lib/supabase'

const GMAIL_TOKEN_KEY = 'gth_gmail_token'
const GMAIL_EVER_CONNECTED = 'gth_gmail_ever_connected'

// ─── Demo mode isolation guard ──────────────────────────────────
// When the CRM is loaded in demo mode (e.g. ?demo=true or embedded on
// growthehype.ca), the user must NEVER see real data — even if they happen
// to be logged in in the same browser. This guard short-circuits every
// Gmail-related operation to behave as "not connected" when demo mode
// is active, so real emails / tokens never render.
function isDemoActive(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === 'true') return true
  } catch { /* ignore */ }
  try {
    return localStorage.getItem('gth_demo_mode') === 'true'
  } catch { /* ignore */ }
  return false
}

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

function saveToken(token: GmailToken) {
  localStorage.setItem(GMAIL_TOKEN_KEY, JSON.stringify(token))
  localStorage.setItem(GMAIL_EVER_CONNECTED, 'true')
}

function hasServerRefreshToken(): boolean {
  return localStorage.getItem(GMAIL_EVER_CONNECTED) === 'true'
}

// Legacy cleanup
;(() => { localStorage.removeItem('gth_gmail_refresh_token') })()

// ── Helper: get current Supabase JWT for authenticated API calls ──

async function getAuthToken(): Promise<string | null> {
  // Retry a few times — Supabase session may not be hydrated immediately on
  // fresh page loads, causing the first call to return null spuriously.
  for (let i = 0; i < 5; i++) {
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) return data.session.access_token
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 200))
  }
  return null
}

// ── Server-side refresh (sends JWT so server identifies user) ──

let _refreshing = false
let _refreshTimer: ReturnType<typeof setTimeout> | null = null
let _refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  if (_refreshing && _refreshPromise) return _refreshPromise

  if (!hasServerRefreshToken()) return false

  _refreshing = true
  _refreshPromise = (async () => {
    try {
      const jwt = await getAuthToken()
      if (!jwt) return false

      const res = await fetch('/api/google-refresh-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        // If server says no refresh token, clear the local flag
        if (res.status === 401) {
          const body = await res.json().catch(() => ({}))
          if (body.error?.includes('No refresh token')) {
            localStorage.removeItem(GMAIL_EVER_CONNECTED)
          }
        }
        return false
      }
      const data = await res.json()
      const seconds = data.expires_in || 3600
      saveToken({ access_token: data.access_token, expires_at: Date.now() + seconds * 1000 })
      scheduleRefresh(seconds)
      return true
    } catch {
      return false
    } finally {
      _refreshing = false
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

function scheduleRefresh(expiresInSeconds: number) {
  if (_refreshTimer) clearTimeout(_refreshTimer)
  const refreshIn = Math.max((expiresInSeconds - 300) * 1000, 30_000)
  _refreshTimer = setTimeout(() => refreshAccessToken(), refreshIn)
}

// ── Cross-device: check server for existing Gmail connection ──
// Called on login to restore connection state on new devices

export async function restoreGmailConnection(): Promise<boolean> {
  // DEMO ISOLATION: never touch real tokens in demo mode
  if (isDemoActive()) return false
  // If we already know we're connected, just refresh the token
  if (hasServerRefreshToken()) {
    const token = getLocalToken()
    if (token && Date.now() < token.expires_at - 60_000) {
      // Token still valid, schedule refresh
      const remaining = Math.floor((token.expires_at - Date.now()) / 1000)
      scheduleRefresh(remaining)
      return true
    }
    // Try refresh
    return refreshAccessToken()
  }

  // Check server if user has a stored refresh token (cross-device restore)
  try {
    const jwt = await getAuthToken()
    if (!jwt) return false

    const res = await fetch('/api/google-check', {
      headers: { 'Authorization': `Bearer ${jwt}` },
    })
    if (!res.ok) return false
    const data = await res.json()

    if (data.connected) {
      // Server has a refresh token — mark as connected and get a fresh access token
      localStorage.setItem(GMAIL_EVER_CONNECTED, 'true')
      return refreshAccessToken()
    }
  } catch {
    // Non-fatal — user can manually reconnect
  }

  return false
}

// On module load: schedule refresh if we have a token
;(() => {
  const token = getLocalToken()
  if (hasServerRefreshToken() && token) {
    const remaining = Math.floor((token.expires_at - Date.now()) / 1000)
    if (remaining > 300) scheduleRefresh(remaining)
    // Don't eagerly refresh on module load — restoreGmailConnection handles it
  }
})()

// ── Public API ──

export function isGmailConnected(): boolean {
  // DEMO ISOLATION: report disconnected in demo mode so UI shows preview,
  // never real inbox
  if (isDemoActive()) return false
  const token = getLocalToken()
  if (token && Date.now() < token.expires_at - 30_000) return true
  if (hasServerRefreshToken()) return true
  return false
}

export function getGmailToken(): string | null {
  // DEMO ISOLATION: never hand out real access tokens in demo mode
  if (isDemoActive()) return null
  const token = getLocalToken()
  if (!token) return null
  if (Date.now() >= token.expires_at - 300_000 && hasServerRefreshToken()) {
    refreshAccessToken()
  }
  if (Date.now() >= token.expires_at) return null
  return token.access_token
}

export async function ensureToken(): Promise<string | null> {
  // DEMO ISOLATION: block token retrieval in demo mode
  if (isDemoActive()) return null
  const token = getLocalToken()
  if (token && Date.now() < token.expires_at - 30_000) return token.access_token
  if (hasServerRefreshToken()) {
    const ok = await refreshAccessToken()
    if (ok) return getLocalToken()?.access_token || null
  }
  // Fallback: return token even if close to expiry (implicit flow)
  if (token && Date.now() < token.expires_at) return token.access_token
  return null
}

export function connectGmail(): void {
  // DEMO ISOLATION: do nothing in demo mode — OAuth initiation is blocked
  if (isDemoActive()) return
  // Server-side OAuth: gets refresh token for permanent access
  const returnPage = window.location.hash?.replace('#', '') || 'gmail'
  window.location.href = `/api/google-auth?returnPage=${encodeURIComponent(returnPage)}`
}

export function captureGmailToken(): boolean {
  // Server-side flow handles token capture via the callback page
  // Also support implicit flow fallback: #access_token=...&expires_in=...&state=...
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token=')) return false

  try {
    const params = new URLSearchParams(hash.substring(1))
    const accessToken = params.get('access_token')
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10)
    const state = params.get('state') || 'gmail'

    if (!accessToken) return false

    saveToken({
      access_token: accessToken,
      expires_at: Date.now() + expiresIn * 1000,
    })

    window.location.hash = state
    return true
  } catch {
    return false
  }
}

export function disconnectGmail(): void {
  localStorage.removeItem(GMAIL_TOKEN_KEY)
  localStorage.removeItem(GMAIL_EVER_CONNECTED)
  localStorage.removeItem('gth_gmail_refresh_token') // legacy cleanup
  if (_refreshTimer) clearTimeout(_refreshTimer)
}

// ─── Gmail API: Inbox / Messages ────────────────────────────────

export interface GmailAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
  partId: string
}

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
  attachments: GmailAttachment[]
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
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  if (payload.mimeType === 'text/plain' && payload.body?.data && !payload.parts) {
    return decodeBase64Url(payload.body.data)
  }
  // Multipart — look for text/html first, then text/plain
  if (payload.parts) {
    // Check nested multipart first (e.g. multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith('multipart/') && part.parts) {
        const nested = extractBody(part)
        if (nested) return nested
      }
    }
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (htmlPart?.body?.data) return decodeBase64Url(htmlPart.body.data)
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data)
  }
  // Fallback: raw body data
  if (payload.body?.data) return decodeBase64Url(payload.body.data)
  return ''
}

// Collect inline-image parts keyed by Content-ID (cid) — used to resolve
// `<img src="cid:...">` references in HTML bodies into data URIs.
interface InlinePart {
  contentId: string
  attachmentId: string
  mimeType: string
}
function extractInlineParts(payload: any): InlinePart[] {
  const results: InlinePart[] = []
  function walk(parts: any[]) {
    for (const part of parts) {
      const headers = part.headers || []
      const cidHeader = headers.find((h: any) => h.name?.toLowerCase() === 'content-id')
      const dispHeader = headers.find((h: any) => h.name?.toLowerCase() === 'content-disposition')
      const isInlineImage =
        part.mimeType?.startsWith('image/') &&
        part.body?.attachmentId &&
        (cidHeader?.value || dispHeader?.value?.toLowerCase().includes('inline'))
      if (isInlineImage) {
        const rawCid = (cidHeader?.value || '').replace(/^<|>$/g, '').trim()
        if (rawCid) {
          results.push({
            contentId: rawCid,
            attachmentId: part.body.attachmentId,
            mimeType: part.mimeType,
          })
        }
      }
      if (part.parts) walk(part.parts)
    }
  }
  if (payload.parts) walk(payload.parts)
  return results
}

function extractAttachments(payload: any): GmailAttachment[] {
  const attachments: GmailAttachment[] = []

  function walk(parts: any[]) {
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
          partId: part.partId || '',
        })
      }
      if (part.parts) walk(part.parts)
    }
  }

  if (payload.parts) walk(payload.parts)
  return attachments
}

// ─── Concurrency limiter ────────────────────────────────────────
// Gmail API enforces per-user concurrent request limits (typically ~10/sec).
// Firing 25 parallel message detail fetches trips "too many concurrent
// requests" errors, especially when users click folders rapidly. We cap
// concurrency globally so bursts get queued instead of rejected.

const GMAIL_CONCURRENCY_LIMIT = 5
let _gmailActive = 0
const _gmailQueue: Array<() => void> = []

function acquireGmailSlot(): Promise<void> {
  if (_gmailActive < GMAIL_CONCURRENCY_LIMIT) {
    _gmailActive++
    return Promise.resolve()
  }
  return new Promise<void>(resolve => _gmailQueue.push(resolve))
}
function releaseGmailSlot() {
  _gmailActive--
  const next = _gmailQueue.shift()
  if (next) { _gmailActive++; next() }
}

// Batched parallel execution with concurrency limit. Drop-in for Promise.all.
export async function limitedParallel<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit = GMAIL_CONCURRENCY_LIMIT,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let idx = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

async function gmailFetch(path: string, options?: RequestInit, attempt = 0): Promise<any> {
  let token = await ensureToken()
  if (!token) throw new Error('Gmail not connected')

  await acquireGmailSlot()
  let res: Response
  try {
    res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
  } finally {
    releaseGmailSlot()
  }

  // Auto-retry once on 401 with a fresh token
  if (res.status === 401 && hasServerRefreshToken()) {
    const ok = await refreshAccessToken()
    if (ok) {
      token = getLocalToken()?.access_token || null
      if (token) {
        await acquireGmailSlot()
        try {
          res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
            ...options,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...options?.headers,
            },
          })
        } finally {
          releaseGmailSlot()
        }
      }
    }
  }

  // Retry on 429 (rate limit) and 5xx (server errors) with exponential backoff
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10)
    const backoffMs = retryAfter > 0 ? retryAfter * 1000 : (500 * Math.pow(2, attempt)) + Math.random() * 300
    await new Promise(r => setTimeout(r, backoffMs))
    return gmailFetch(path, options, attempt + 1)
  }

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

  // Batch fetch message details with concurrency limit (see gmailFetch comment).
  // This was firing 25 parallel fetches which tripped Gmail's concurrency cap
  // on rapid folder-switching — now capped via limitedParallel.
  const detailed = await limitedParallel(
    list.messages,
    (m: any) => gmailFetch(`messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)
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
    attachments: [],
  }))

  return {
    messages,
    nextPageToken: list.nextPageToken,
    resultSizeEstimate: list.resultSizeEstimate || 0,
  }
}

export async function getMessage(id: string): Promise<GmailMessage> {
  const msg = await gmailFetch(`messages/${id}?format=full`)
  let body = extractBody(msg.payload)

  // Resolve inline `cid:` image references by fetching each referenced
  // attachment and embedding it as a base64 data URI. Without this, the
  // browser shows a broken-image placeholder since `cid:` URLs aren't
  // resolvable over HTTP.
  const inlineParts = extractInlineParts(msg.payload)
  if (inlineParts.length > 0 && /cid:/i.test(body)) {
    await Promise.all(
      inlineParts.map(async (part) => {
        try {
          const data = await gmailFetch(`messages/${id}/attachments/${part.attachmentId}`)
          const b64 = (data.data || '').replace(/-/g, '+').replace(/_/g, '/')
          if (!b64) return
          const dataUri = `data:${part.mimeType};base64,${b64}`
          // Replace src="cid:xxx" and src='cid:xxx' — escape regex chars in CID
          const escCid = part.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const re = new RegExp(`(["'])cid:${escCid}(\\1)`, 'gi')
          body = body.replace(re, `$1${dataUri}$2`)
        } catch { /* non-fatal — leave broken cid in place */ }
      }),
    )
  }

  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet || '',
    labelIds: msg.labelIds || [],
    from: parseHeader(msg.payload?.headers, 'From'),
    to: parseHeader(msg.payload?.headers, 'To'),
    subject: parseHeader(msg.payload?.headers, 'Subject') || '(no subject)',
    date: parseHeader(msg.payload?.headers, 'Date'),
    body,
    isUnread: (msg.labelIds || []).includes('UNREAD'),
    attachments: extractAttachments(msg.payload),
  }
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<string> {
  const data = await gmailFetch(`messages/${messageId}/attachments/${attachmentId}`)
  // Returns base64url-encoded data — convert to standard base64
  return (data.data || '').replace(/-/g, '+').replace(/_/g, '/')
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
  let token = await ensureToken()
  if (!token) throw new Error('Gmail not connected')

  const htmlBody = params.body.replace(/\n/g, '<br>')

  const gthSignature = buildEmailSignature()

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

  let res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  // Auto-retry once on 401
  if (res.status === 401 && hasServerRefreshToken()) {
    const ok = await refreshAccessToken()
    if (ok) {
      token = getLocalToken()?.access_token || null
      if (token) {
        res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
    }
  }

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
  let token = await ensureToken()
  if (!token) throw new Error('Gmail not connected')

  const boundary = 'gth_boundary_' + Date.now()
  const htmlBody = params.body.replace(/\n/g, '<br>')

  const gthSignature = buildEmailSignature()

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

  let res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  })

  // Auto-retry once on 401
  if (res.status === 401 && hasServerRefreshToken()) {
    const ok = await refreshAccessToken()
    if (ok) {
      token = getLocalToken()?.access_token || null
      if (token) {
        res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encoded }),
        })
      }
    }
  }

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
  let token = await ensureToken()
  if (!token) throw new Error('NOT_CONNECTED')

  let res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  // Auto-retry once on 401 with a fresh token
  if (res.status === 401 && hasServerRefreshToken()) {
    const ok = await refreshAccessToken()
    if (ok) {
      token = getLocalToken()?.access_token || null
      if (token) {
        res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || ''
    if (res.status === 401) throw new Error('NOT_CONNECTED')
    if (res.status === 403 && (msg.includes('not been used') || msg.includes('disabled') || msg.includes('accessNotConfigured'))) {
      throw new Error('API_NOT_ENABLED')
    }
    if (res.status === 403) throw new Error('ACCESS_DENIED')
    throw new Error(`Drive API error: ${res.status} — ${msg}`)
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

// ─── Email Signature — per-tenant, generated from settings cache ──────────
// SECURITY / MULTI-TENANT: Previously this was a hardcoded Omar Alladina / GTH
// signature that got stamped on EVERY tenant's outbound email. That would leak
// Omar's PII and brand to every customer's clients. Now we build the signature
// dynamically from the signed-in tenant's settings (synced to localStorage via
// email-sig-cache.ts). If a tenant hasn't filled out their signature fields,
// we send NO signature rather than the wrong one.
function buildEmailSignature(): string {
  let cache: any = null
  try {
    const raw = localStorage.getItem('gth_email_sig_cache')
    if (raw) cache = JSON.parse(raw)
  } catch { return '' }

  if (!cache) return ''

  const name = (cache.name || '').trim()
  const title = (cache.title || '').trim()
  const email = (cache.email || '').trim()
  const phone = (cache.phone || '').trim()
  const website = (cache.website || '').trim()
  const logoUrl = (cache.logoUrl || '').trim()
  const tagline = (cache.tagline || '').trim()
  const companyName = (cache.companyName || '').trim()

  // If nothing meaningful to show, send no signature rather than a broken one
  if (!name && !email && !phone && !website && !companyName) return ''

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  // Helper: strip protocol from website for display, keep it for href
  const websiteDisplay = website.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const websiteHref = website.startsWith('http') ? website : (website ? `https://${website}` : '')

  // Phone href (strip spaces/dashes/parens for tel:)
  const phoneHref = phone.replace(/[^0-9+]/g, '')

  const logoCell = logoUrl
    ? `<td style="width:74px;vertical-align:top;padding:0;">
         ${websiteHref ? `<a href="${esc(websiteHref)}" target="_blank" style="text-decoration:none;border:none;">` : ''}
           <img src="${esc(logoUrl)}" alt="${esc(companyName || name || 'Logo')}" width="60" style="display:block;width:60px;height:auto;border:0;outline:none;" />
         ${websiteHref ? '</a>' : ''}
       </td>
       <td style="width:24px;vertical-align:top;padding:2px 0 0 0;">
         <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:collapse;">
           <tr><td style="width:1px;height:78px;background-color:#D0D0D0;font-size:1px;line-height:1px;">&nbsp;</td></tr>
         </table>
       </td>`
    : ''

  return `
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
    ${logoCell}
    <td style="vertical-align:top;padding:0;">
      ${name ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr><td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#111111;letter-spacing:0.3px;line-height:1.15;padding:0 0 2px 0;">${esc(name)}</td></tr>
      </table>` : ''}
      ${title ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr><td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:11px;font-weight:500;color:#888888;letter-spacing:2.5px;text-transform:uppercase;line-height:1.3;padding:0 0 14px 0;">${esc(title)}</td></tr>
      </table>` : ''}
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        ${email ? `<tr><td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;color:#555555;line-height:1.3;padding:0 0 5px 0;">
          <a href="mailto:${esc(email)}" style="color:#555555;text-decoration:none;">${esc(email)}</a>
        </td></tr>` : ''}
        ${phone ? `<tr><td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;color:#555555;line-height:1.3;padding:0 0 5px 0;">
          <a href="tel:${esc(phoneHref)}" style="color:#555555;text-decoration:none;">${esc(phone)}</a>
        </td></tr>` : ''}
        ${websiteDisplay ? `<tr><td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#111111;line-height:1.3;padding:0;">
          <a href="${esc(websiteHref)}" target="_blank" style="color:#111111;text-decoration:none;">${esc(websiteDisplay)}</a>
        </td></tr>` : ''}
      </table>
    </td>
  </tr>
  ${tagline ? `<tr>
    <td colspan="3" style="padding:20px 0 0 0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr><td style="font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:9px;font-weight:500;color:#BBBBBB;letter-spacing:3px;text-transform:uppercase;line-height:1.3;">${esc(tagline)}</td></tr>
      </table>
    </td>
  </tr>` : ''}
</table>`
}
