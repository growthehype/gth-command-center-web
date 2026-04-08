import { useEffect, useState, useCallback } from 'react'
import { Mail, Search, RefreshCw, Archive, Trash2, MailOpen, Eye, Send, ArrowLeft, ChevronLeft, ChevronRight, Inbox, Star, Clock, AlertCircle, X, Paperclip } from 'lucide-react'
import { isGmailConnected, connectGmail, listMessages, getMessage, markAsRead, markAsUnread, archiveMessage, trashMessage, sendEmail, type GmailMessage } from '@/lib/gmail'
import { showToast } from '@/components/ui/Toast'
import { formatDistanceToNow, format } from 'date-fns'

// ── Folder definitions ──

const FOLDERS = [
  { id: 'INBOX', label: 'Inbox', icon: Inbox },
  { id: 'STARRED', label: 'Starred', icon: Star },
  { id: 'SENT', label: 'Sent', icon: Send },
  { id: 'DRAFT', label: 'Drafts', icon: Paperclip },
  { id: 'SPAM', label: 'Spam', icon: AlertCircle },
  { id: 'TRASH', label: 'Trash', icon: Trash2 },
]

// ── Helper: extract sender name ──

function senderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</)
  return match ? match[1].trim() : from.split('@')[0]
}

function senderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1] : from
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86400000) return formatDistanceToNow(d, { addSuffix: true })
    if (diff < 604800000) return format(d, 'EEE h:mm a')
    return format(d, 'MMM d')
  } catch {
    return dateStr
  }
}

// ── Compose Modal ──

function ComposeModal({ onClose, onSent, replyTo }: {
  onClose: () => void
  onSent: () => void
  replyTo?: GmailMessage | null
}) {
  const [to, setTo] = useState(replyTo ? senderEmail(replyTo.from) : '')
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` : '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!to.trim()) { showToast('Enter a recipient', 'warn'); return }
    setSending(true)
    try {
      await sendEmail({
        to: to.trim(),
        subject,
        body,
        threadId: replyTo?.threadId,
      })
      showToast('Email sent!', 'success')
      onSent()
      onClose()
    } catch (err: any) {
      showToast(err.message || 'Failed to send', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-xl mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-polar font-[700]" style={{ fontSize: '14px' }}>{replyTo ? 'Reply' : 'New Email'}</h3>
          <button onClick={onClose} className="text-dim hover:text-polar"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-dim block mb-1" style={{ fontSize: '11px', fontWeight: 600 }}>To</label>
            <input
              type="email" value={to} onChange={e => setTo(e.target.value)}
              className="w-full bg-cell border border-border rounded px-3 py-2 text-polar"
              style={{ fontSize: '12.5px' }}
              placeholder="recipient@example.com"
              autoFocus={!replyTo}
            />
          </div>
          <div>
            <label className="text-dim block mb-1" style={{ fontSize: '11px', fontWeight: 600 }}>Subject</label>
            <input
              type="text" value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full bg-cell border border-border rounded px-3 py-2 text-polar"
              style={{ fontSize: '12.5px' }}
              placeholder="Subject"
            />
          </div>
          <div>
            <label className="text-dim block mb-1" style={{ fontSize: '11px', fontWeight: 600 }}>Message</label>
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              className="w-full bg-cell border border-border rounded px-3 py-2 text-polar resize-none"
              style={{ fontSize: '12.5px', minHeight: '160px' }}
              placeholder="Write your message..."
              autoFocus={!!replyTo}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: '12px', padding: '7px 16px' }}>Cancel</button>
          <button onClick={handleSend} disabled={sending} className="btn-primary flex items-center gap-1.5" style={{ fontSize: '12px', padding: '7px 20px' }}>
            <Send size={13} /> {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Message Detail View ──

function MessageDetail({ message, onBack, onRefresh }: {
  message: GmailMessage
  onBack: () => void
  onRefresh: () => void
}) {
  const [full, setFull] = useState<GmailMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [replying, setReplying] = useState(false)

  useEffect(() => {
    setLoading(true)
    getMessage(message.id)
      .then(m => {
        setFull(m)
        if (m.isUnread) markAsRead(m.id).catch(() => {})
      })
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [message.id])

  const handleArchive = async () => {
    try {
      await archiveMessage(message.id)
      showToast('Archived', 'success')
      onBack()
      onRefresh()
    } catch (err: any) { showToast(err.message, 'error') }
  }

  const handleTrash = async () => {
    try {
      await trashMessage(message.id)
      showToast('Moved to trash', 'success')
      onBack()
      onRefresh()
    } catch (err: any) { showToast(err.message, 'error') }
  }

  const msg = full || message

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-shrink-0">
        <button onClick={onBack} className="btn-ghost flex items-center gap-1" style={{ fontSize: '11px', padding: '5px 10px' }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex-1" />
        <button onClick={() => setReplying(true)} className="btn-primary flex items-center gap-1" style={{ fontSize: '11px', padding: '5px 12px' }}>
          <Send size={12} /> Reply
        </button>
        <button onClick={handleArchive} className="btn-ghost flex items-center gap-1" style={{ fontSize: '11px', padding: '5px 10px' }}>
          <Archive size={12} /> Archive
        </button>
        <button onClick={handleTrash} className="btn-ghost text-err flex items-center gap-1" style={{ fontSize: '11px', padding: '5px 10px' }}>
          <Trash2 size={12} /> Delete
        </button>
      </div>

      {/* Message content */}
      <div className="flex-1 overflow-y-auto p-5">
        <h2 className="text-polar font-[700] mb-3" style={{ fontSize: '18px' }}>{msg.subject}</h2>
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-[700] flex-shrink-0" style={{ fontSize: '12px' }}>
            {senderName(msg.from).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-polar font-[600]" style={{ fontSize: '13px' }}>{senderName(msg.from)}</span>
              <span className="text-dim" style={{ fontSize: '11px' }}>&lt;{senderEmail(msg.from)}&gt;</span>
            </div>
            <div className="text-dim" style={{ fontSize: '11px' }}>
              to {msg.to ? senderEmail(msg.to) : 'me'} · {formatDate(msg.date)}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-dim text-center py-12" style={{ fontSize: '12.5px' }}>Loading message...</div>
        ) : full?.body ? (
          <div
            className="email-body prose prose-invert max-w-none"
            style={{ fontSize: '13px', lineHeight: '1.65', color: 'var(--color-steel)' }}
            dangerouslySetInnerHTML={{ __html: full.body }}
          />
        ) : (
          <p className="text-steel" style={{ fontSize: '13px', lineHeight: '1.65' }}>{msg.snippet}</p>
        )}
      </div>

      {replying && <ComposeModal onClose={() => setReplying(false)} onSent={onRefresh} replyTo={msg} />}
    </div>
  )
}

// ── Main Gmail Inbox Page ──

export default function GmailInbox() {
  const [connected, setConnected] = useState(isGmailConnected())
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFolder, setActiveFolder] = useState('INBOX')
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null)
  const [composing, setComposing] = useState(false)
  const [pageToken, setPageToken] = useState<string | undefined>()
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [pageHistory, setPageHistory] = useState<string[]>([])

  const loadMessages = useCallback(async (folder?: string, query?: string, token?: string) => {
    setLoading(true)
    try {
      const f = folder || activeFolder
      const result = await listMessages({
        labelIds: [f],
        query: query || searchQuery || undefined,
        maxResults: 20,
        pageToken: token,
      })
      setMessages(result.messages)
      setNextPageToken(result.nextPageToken)
    } catch (err: any) {
      if (err.message?.includes('expired') || err.message?.includes('not connected')) {
        setConnected(false)
      }
      showToast(err.message || 'Failed to load messages', 'error')
    } finally {
      setLoading(false)
    }
  }, [activeFolder, searchQuery])

  // Load on mount and folder change
  useEffect(() => {
    if (connected) {
      setSelectedMessage(null)
      setPageToken(undefined)
      setPageHistory([])
      loadMessages(activeFolder, searchQuery)
    }
  }, [connected, activeFolder]) // eslint-disable-line

  // Re-check connection on mount (token may have been refreshed)
  useEffect(() => {
    setConnected(isGmailConnected())
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPageToken(undefined)
    setPageHistory([])
    loadMessages(activeFolder, searchQuery)
  }

  const handleNextPage = () => {
    if (!nextPageToken) return
    setPageHistory(prev => [...prev, pageToken || ''])
    setPageToken(nextPageToken)
    loadMessages(activeFolder, searchQuery, nextPageToken)
  }

  const handlePrevPage = () => {
    const prev = [...pageHistory]
    const prevToken = prev.pop()
    setPageHistory(prev)
    setPageToken(prevToken || undefined)
    loadMessages(activeFolder, searchQuery, prevToken || undefined)
  }

  const handleAction = async (msg: GmailMessage, action: 'read' | 'unread' | 'archive' | 'trash') => {
    try {
      switch (action) {
        case 'read': await markAsRead(msg.id); break
        case 'unread': await markAsUnread(msg.id); break
        case 'archive': await archiveMessage(msg.id); break
        case 'trash': await trashMessage(msg.id); break
      }
      showToast(action === 'archive' ? 'Archived' : action === 'trash' ? 'Trashed' : `Marked as ${action}`, 'success')
      loadMessages()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  // ── Not connected state ──
  if (!connected) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <Mail size={28} className="text-red-400" />
        </div>
        <h1 className="text-polar font-[800] mb-2" style={{ fontSize: '22px' }}>Connect Gmail</h1>
        <p className="text-dim mb-6" style={{ fontSize: '13px', maxWidth: 360, margin: '0 auto' }}>
          Connect your Gmail account to read, send, and manage emails directly from your CRM.
        </p>
        <button onClick={() => connectGmail()} className="btn-primary" style={{ fontSize: '13px', padding: '10px 28px' }}>
          Connect with Google
        </button>
        <p className="text-dim mt-4" style={{ fontSize: '10.5px' }}>
          Grants read, send, and organize permissions. You can disconnect anytime.
        </p>
      </div>
    )
  }

  // ── Message detail view ──
  if (selectedMessage) {
    return (
      <div className="max-w-5xl mx-auto h-full">
        <MessageDetail
          message={selectedMessage}
          onBack={() => setSelectedMessage(null)}
          onRefresh={() => loadMessages()}
        />
      </div>
    )
  }

  // ── Inbox view ──
  return (
    <div className="max-w-5xl mx-auto space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-polar font-[800] flex items-center gap-2" style={{ fontSize: '22px', letterSpacing: '-0.02em' }}>
          <Mail size={22} /> Gmail
        </h1>
        <div className="flex gap-2">
          <button onClick={() => loadMessages()} disabled={loading} className="btn-ghost flex items-center gap-1.5" style={{ fontSize: '11px', padding: '6px 12px' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setComposing(true)} className="btn-primary flex items-center gap-1.5" style={{ fontSize: '11px', padding: '6px 16px' }}>
            <Send size={12} /> Compose
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Folder sidebar */}
        <div className="hidden md:block w-36 flex-shrink-0 space-y-0.5">
          {FOLDERS.map(f => {
            const Icon = f.icon
            const active = f.id === activeFolder
            return (
              <button
                key={f.id}
                onClick={() => setActiveFolder(f.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${active ? 'bg-surface-2 text-polar' : 'text-dim hover:text-steel hover:bg-surface/50'}`}
                style={{ fontSize: '12px', fontWeight: active ? 700 : 500 }}
              >
                <Icon size={14} /> {f.label}
              </button>
            )
          })}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Mobile folder tabs */}
          <div className="flex md:hidden gap-1 mb-3 overflow-x-auto pb-1">
            {FOLDERS.slice(0, 4).map(f => {
              const active = f.id === activeFolder
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFolder(f.id)}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap ${active ? 'bg-accent text-white' : 'bg-surface-2 text-dim'}`}
                  style={{ fontSize: '11px', fontWeight: 600 }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search emails..."
                className="w-full bg-cell border border-border rounded-lg pl-9 pr-3 py-2 text-polar"
                style={{ fontSize: '12px' }}
              />
            </div>
          </form>

          {/* Message list */}
          {loading && messages.length === 0 ? (
            <div className="text-dim text-center py-16" style={{ fontSize: '12.5px' }}>
              <RefreshCw size={16} className="animate-spin mx-auto mb-2" /> Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-dim text-center py-16" style={{ fontSize: '12.5px' }}>
              No messages found
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-border">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  onClick={() => setSelectedMessage(msg)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-surface-2/50 group ${msg.isUnread ? 'bg-accent/[0.03]' : ''}`}
                >
                  {/* Unread indicator */}
                  <div className="w-2 flex-shrink-0">
                    {msg.isUnread && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>

                  {/* Sender avatar */}
                  <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-dim flex-shrink-0" style={{ fontSize: '11px', fontWeight: 700 }}>
                    {senderName(msg.from).charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`truncate ${msg.isUnread ? 'text-polar font-[700]' : 'text-steel font-[500]'}`} style={{ fontSize: '12.5px' }}>
                        {senderName(msg.from)}
                      </span>
                      <span className="text-dim flex-shrink-0" style={{ fontSize: '10.5px' }}>{formatDate(msg.date)}</span>
                    </div>
                    <div className={`truncate ${msg.isUnread ? 'text-steel font-[600]' : 'text-dim'}`} style={{ fontSize: '12px' }}>
                      {msg.subject}
                    </div>
                    <div className="truncate text-dim" style={{ fontSize: '11px' }}>
                      {msg.snippet}
                    </div>
                  </div>

                  {/* Quick actions (on hover) */}
                  <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {msg.isUnread ? (
                      <button onClick={() => handleAction(msg, 'read')} className="p-1.5 rounded hover:bg-surface-2 text-dim hover:text-steel" title="Mark as read">
                        <MailOpen size={13} />
                      </button>
                    ) : (
                      <button onClick={() => handleAction(msg, 'unread')} className="p-1.5 rounded hover:bg-surface-2 text-dim hover:text-steel" title="Mark as unread">
                        <Eye size={13} />
                      </button>
                    )}
                    <button onClick={() => handleAction(msg, 'archive')} className="p-1.5 rounded hover:bg-surface-2 text-dim hover:text-steel" title="Archive">
                      <Archive size={13} />
                    </button>
                    <button onClick={() => handleAction(msg, 'trash')} className="p-1.5 rounded hover:bg-surface-2 text-dim hover:text-err" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {(pageHistory.length > 0 || nextPageToken) && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={handlePrevPage}
                disabled={pageHistory.length === 0}
                className="btn-ghost flex items-center gap-1"
                style={{ fontSize: '11px', padding: '5px 12px' }}
              >
                <ChevronLeft size={13} /> Newer
              </button>
              <button
                onClick={handleNextPage}
                disabled={!nextPageToken}
                className="btn-ghost flex items-center gap-1"
                style={{ fontSize: '11px', padding: '5px 12px' }}
              >
                Older <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {composing && <ComposeModal onClose={() => setComposing(false)} onSent={() => loadMessages()} />}
    </div>
  )
}
