import { useEffect, useState, useCallback, useRef } from 'react'
import { Mail, Search, RefreshCw, Archive, Trash2, MailOpen, Eye, Send, ArrowLeft, ChevronLeft, ChevronRight, Inbox, Star, Clock, AlertCircle, X, Paperclip, Reply, Forward, MoreHorizontal, CheckCheck, LogOut } from 'lucide-react'
import { isGmailConnected, connectGmail, disconnectGmail, listMessages, getMessage, markAsRead, markAsUnread, archiveMessage, trashMessage, sendEmail, type GmailMessage } from '@/lib/gmail'
import { showToast } from '@/components/ui/Toast'
import { formatDistanceToNow, format, isToday, isYesterday, isThisYear } from 'date-fns'
import DOMPurify from 'dompurify'

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

function smartDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isToday(d)) return format(d, 'h:mm a')
    if (isYesterday(d)) return 'Yesterday'
    if (isThisYear(d)) return format(d, 'MMM d')
    return format(d, 'MMM d, yyyy')
  } catch {
    return dateStr
  }
}

function fullDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'EEE, MMM d, yyyy \'at\' h:mm a')
  } catch {
    return dateStr
  }
}

// Deterministic color from name
function avatarColor(name: string): string {
  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

// ── Compose Modal ──

function ComposeModal({ onClose, onSent, replyTo, forwardMsg }: {
  onClose: () => void
  onSent: () => void
  replyTo?: GmailMessage | null
  forwardMsg?: GmailMessage | null
}) {
  const [to, setTo] = useState(replyTo ? senderEmail(replyTo.from) : '')
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` :
    forwardMsg ? `Fwd: ${forwardMsg.subject.replace(/^Fwd:\s*/i, '')}` : ''
  )
  const [body, setBody] = useState(
    forwardMsg ? `\n\n---------- Forwarded message ----------\nFrom: ${forwardMsg.from}\nDate: ${fullDate(forwardMsg.date)}\nSubject: ${forwardMsg.subject}\n\n${forwardMsg.snippet}` : ''
  )
  const [sending, setSending] = useState(false)
  const toRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (replyTo) bodyRef.current?.focus()
    else toRef.current?.focus()
  }, [replyTo])

  const handleSend = async () => {
    if (!to.trim()) { showToast('Enter a recipient', 'warn'); return }
    if (!subject.trim() && !body.trim()) { showToast('Add a subject or message', 'warn'); return }
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

  // Ctrl+Enter to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSend()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-t-xl sm:rounded-xl shadow-2xl w-full max-w-2xl sm:mx-4" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-polar font-[700]" style={{ fontSize: '14px' }}>
            {replyTo ? 'Reply' : forwardMsg ? 'Forward' : 'New Email'}
          </h3>
          <button onClick={onClose} className="text-dim hover:text-polar transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-dim flex-shrink-0" style={{ fontSize: '12px', fontWeight: 600, width: 40 }}>To</label>
            <input
              ref={toRef}
              type="email" value={to} onChange={e => setTo(e.target.value)}
              className="flex-1 bg-cell border border-border rounded px-3 py-2 text-polar focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              style={{ fontSize: '12.5px' }}
              placeholder="recipient@example.com"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-dim flex-shrink-0" style={{ fontSize: '12px', fontWeight: 600, width: 40 }}>Subj</label>
            <input
              type="text" value={subject} onChange={e => setSubject(e.target.value)}
              className="flex-1 bg-cell border border-border rounded px-3 py-2 text-polar focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              style={{ fontSize: '12.5px' }}
              placeholder="Subject"
            />
          </div>
          <textarea
            ref={bodyRef}
            value={body} onChange={e => setBody(e.target.value)}
            className="w-full bg-cell border border-border rounded px-3 py-2 text-polar resize-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
            style={{ fontSize: '12.5px', minHeight: '200px' }}
            placeholder="Write your message..."
          />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-dim" style={{ fontSize: '10px' }}>Ctrl+Enter to send</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost" style={{ fontSize: '12px', padding: '7px 16px' }}>Discard</button>
            <button onClick={handleSend} disabled={sending} className="btn-primary flex items-center gap-1.5" style={{ fontSize: '12px', padding: '7px 20px' }}>
              <Send size={13} /> {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
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
  const [forwarding, setForwarding] = useState(false)

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
  const color = avatarColor(senderName(msg.from))

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border flex-shrink-0">
        <button onClick={onBack} className="btn-ghost flex items-center gap-1" style={{ fontSize: '11px', padding: '5px 10px' }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex-1" />
        <button onClick={() => setReplying(true)} className="btn-ghost flex items-center gap-1" style={{ fontSize: '11px', padding: '5px 10px' }} title="Reply">
          <Reply size={13} /> Reply
        </button>
        <button onClick={() => setForwarding(true)} className="btn-ghost flex items-center gap-1" style={{ fontSize: '11px', padding: '5px 10px' }} title="Forward">
          <Forward size={13} /> Forward
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button onClick={handleArchive} className="btn-ghost flex items-center gap-1" style={{ fontSize: '11px', padding: '5px 10px' }} title="Archive">
          <Archive size={13} />
        </button>
        <button onClick={handleTrash} className="btn-ghost text-err flex items-center gap-1" style={{ fontSize: '11px', padding: '5px 10px' }} title="Delete">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Message content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-5">
          <h2 className="text-polar font-[700] mb-5" style={{ fontSize: '20px', lineHeight: 1.3 }}>{msg.subject}</h2>

          {/* Sender card */}
          <div className="flex items-start gap-3 mb-6 p-4 rounded-lg bg-surface-2/40">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-[700] flex-shrink-0 text-white" style={{ fontSize: '13px', backgroundColor: color }}>
              {senderName(msg.from).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-polar font-[700]" style={{ fontSize: '13.5px' }}>{senderName(msg.from)}</span>
                <span className="text-dim" style={{ fontSize: '11px' }}>{senderEmail(msg.from)}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-dim" style={{ fontSize: '11px' }}>
                  to {msg.to ? senderEmail(msg.to) : 'me'}
                </span>
                <span className="text-dim" style={{ fontSize: '10px' }}>·</span>
                <span className="text-dim" style={{ fontSize: '11px' }}>{fullDate(msg.date)}</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-dim text-center py-16" style={{ fontSize: '12.5px' }}>
              <RefreshCw size={14} className="animate-spin mx-auto mb-2" /> Loading message...
            </div>
          ) : full?.body ? (
            <div
              className="email-body"
              style={{ fontSize: '13.5px', lineHeight: '1.7', color: 'var(--color-steel)' }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(full.body, { ADD_ATTR: ['target'] }) }}
            />
          ) : (
            <p className="text-steel" style={{ fontSize: '13.5px', lineHeight: '1.7' }}>{msg.snippet}</p>
          )}

          {/* Quick reply bar */}
          <div className="mt-8 pt-5 border-t border-border">
            <button
              onClick={() => setReplying(true)}
              className="w-full text-left px-4 py-3 rounded-lg border border-border text-dim hover:text-steel hover:border-accent/30 transition-colors cursor-text"
              style={{ fontSize: '12.5px' }}
            >
              Click here to reply...
            </button>
          </div>
        </div>
      </div>

      {replying && <ComposeModal onClose={() => setReplying(false)} onSent={onRefresh} replyTo={msg} />}
      {forwarding && <ComposeModal onClose={() => setForwarding(false)} onSent={onRefresh} forwardMsg={msg} />}
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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  const loadMessages = useCallback(async (folder?: string, query?: string, token?: string) => {
    setLoading(true)
    try {
      const f = folder || activeFolder
      const result = await listMessages({
        labelIds: [f],
        query: query || searchQuery || undefined,
        maxResults: 25,
        pageToken: token,
      })
      setMessages(result.messages)
      setNextPageToken(result.nextPageToken)
      setCheckedIds(new Set())
    } catch (err: any) {
      if (err.message?.includes('expired') || err.message?.includes('not connected')) {
        setConnected(false)
      }
      showToast(err.message || 'Failed to load messages', 'error')
    } finally {
      setLoading(false)
    }
  }, [activeFolder, searchQuery])

  useEffect(() => {
    if (connected) {
      setSelectedMessage(null)
      setPageToken(undefined)
      setPageHistory([])
      loadMessages(activeFolder, searchQuery)
    }
  }, [connected, activeFolder]) // eslint-disable-line

  // Re-check connection on mount (catches OAuth callback redirect) and on focus
  useEffect(() => {
    const check = () => {
      const nowConnected = isGmailConnected()
      setConnected(prev => (prev !== nowConnected) ? nowConnected : prev)
    }
    check()
    // Delayed re-check in case localStorage was just written by callback page
    const t = setTimeout(check, 500)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', check)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
    return () => {
      clearTimeout(t)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', check)
    }
  }, [])

  // Keyboard: Escape to deselect, C to compose, R to refresh
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) { setComposing(true); e.preventDefault() }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) { loadMessages(); e.preventDefault() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [loadMessages])

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

  // Bulk actions
  const handleBulkAction = async (action: 'read' | 'archive' | 'trash') => {
    const ids = Array.from(checkedIds)
    if (!ids.length) return
    try {
      await Promise.all(ids.map(id => {
        switch (action) {
          case 'read': return markAsRead(id)
          case 'archive': return archiveMessage(id)
          case 'trash': return trashMessage(id)
        }
      }))
      showToast(`${action === 'read' ? 'Marked as read' : action === 'archive' ? 'Archived' : 'Trashed'} (${ids.length})`, 'success')
      loadMessages()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const unreadCount = messages.filter(m => m.isUnread).length

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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-polar font-[800] flex items-center gap-2" style={{ fontSize: '22px', letterSpacing: '-0.02em' }}>
            <Mail size={22} /> Gmail
          </h1>
          {unreadCount > 0 && (
            <p className="text-dim mt-0.5" style={{ fontSize: '11.5px' }}>{unreadCount} unread message{unreadCount !== 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { disconnectGmail(); setConnected(false) }}
            className="btn-ghost flex items-center gap-1.5 text-dim"
            style={{ fontSize: '10px', padding: '5px 10px' }}
            title="Disconnect Gmail"
          >
            <LogOut size={11} />
          </button>
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
        <div className="hidden md:flex flex-col w-40 flex-shrink-0 gap-0.5">
          {FOLDERS.map(f => {
            const Icon = f.icon
            const active = f.id === activeFolder
            return (
              <button
                key={f.id}
                onClick={() => setActiveFolder(f.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${active ? 'bg-accent/10 text-accent border border-accent/20' : 'text-dim hover:text-steel hover:bg-surface-2/50 border border-transparent'}`}
                style={{ fontSize: '12px', fontWeight: active ? 700 : 500 }}
              >
                <Icon size={14} /> {f.label}
              </button>
            )
          })}
          <div className="mt-3 px-3">
            <p className="text-dim" style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.05em' }}>
              Press C to compose · R to refresh
            </p>
          </div>
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
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${active ? 'bg-accent text-white' : 'bg-surface-2 text-dim'}`}
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
                placeholder="Search emails... (try: from:someone, has:attachment, is:unread)"
                className="w-full bg-cell border border-border rounded-lg pl-9 pr-3 py-2.5 text-polar focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                style={{ fontSize: '12px' }}
              />
            </div>
          </form>

          {/* Bulk action bar */}
          {checkedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
              <span className="text-accent font-[600]" style={{ fontSize: '11.5px' }}>{checkedIds.size} selected</span>
              <div className="flex-1" />
              <button onClick={() => handleBulkAction('read')} className="btn-ghost flex items-center gap-1" style={{ fontSize: '11px', padding: '4px 10px' }}>
                <CheckCheck size={12} /> Mark Read
              </button>
              <button onClick={() => handleBulkAction('archive')} className="btn-ghost flex items-center gap-1" style={{ fontSize: '11px', padding: '4px 10px' }}>
                <Archive size={12} /> Archive
              </button>
              <button onClick={() => handleBulkAction('trash')} className="btn-ghost text-err flex items-center gap-1" style={{ fontSize: '11px', padding: '4px 10px' }}>
                <Trash2 size={12} /> Delete
              </button>
              <button onClick={() => setCheckedIds(new Set())} className="btn-ghost" style={{ fontSize: '11px', padding: '4px 10px' }}>
                Clear
              </button>
            </div>
          )}

          {/* Message list */}
          {loading && messages.length === 0 ? (
            <div className="text-dim text-center py-16" style={{ fontSize: '12.5px' }}>
              <RefreshCw size={16} className="animate-spin mx-auto mb-2" /> Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-dim text-center py-16" style={{ fontSize: '12.5px' }}>
              <Mail size={24} className="mx-auto mb-3 opacity-30" />
              {searchQuery ? 'No emails matching your search' : 'No messages in this folder'}
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-border/60">
              {messages.map(msg => {
                const color = avatarColor(senderName(msg.from))
                const checked = checkedIds.has(msg.id)
                return (
                  <div
                    key={msg.id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all group ${msg.isUnread ? 'bg-accent/[0.03]' : ''} ${checked ? 'bg-accent/[0.08]' : 'hover:bg-surface-2/40'}`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCheck(msg.id)}
                      className="accent-accent flex-shrink-0 cursor-pointer"
                      onClick={e => e.stopPropagation()}
                    />

                    {/* Unread dot */}
                    <div className="w-2 flex-shrink-0">
                      {msg.isUnread && <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
                    </div>

                    {/* Click area for opening message */}
                    <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => setSelectedMessage(msg)}>
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: color }}>
                        {senderName(msg.from).charAt(0).toUpperCase()}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`truncate ${msg.isUnread ? 'text-polar font-[700]' : 'text-steel font-[500]'}`} style={{ fontSize: '12.5px', maxWidth: '180px' }}>
                            {senderName(msg.from)}
                          </span>
                          <span className="text-dim flex-shrink-0 ml-auto" style={{ fontSize: '10.5px' }}>{smartDate(msg.date)}</span>
                        </div>
                        <div className={`truncate ${msg.isUnread ? 'text-polar font-[600]' : 'text-steel'}`} style={{ fontSize: '12px' }}>
                          {msg.subject}
                        </div>
                        <div className="truncate text-dim" style={{ fontSize: '11px', marginTop: '1px' }}>
                          {msg.snippet}
                        </div>
                      </div>
                    </div>

                    {/* Quick actions (hover) */}
                    <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {msg.isUnread ? (
                        <button onClick={() => handleAction(msg, 'read')} className="p-1.5 rounded-md hover:bg-surface-2 text-dim hover:text-steel transition-colors" title="Mark as read">
                          <MailOpen size={13} />
                        </button>
                      ) : (
                        <button onClick={() => handleAction(msg, 'unread')} className="p-1.5 rounded-md hover:bg-surface-2 text-dim hover:text-steel transition-colors" title="Mark as unread">
                          <Eye size={13} />
                        </button>
                      )}
                      <button onClick={() => handleAction(msg, 'archive')} className="p-1.5 rounded-md hover:bg-surface-2 text-dim hover:text-steel transition-colors" title="Archive">
                        <Archive size={13} />
                      </button>
                      <button onClick={() => handleAction(msg, 'trash')} className="p-1.5 rounded-md hover:bg-surface-2 text-dim hover:text-err transition-colors" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {(pageHistory.length > 0 || nextPageToken) && (
            <div className="flex items-center justify-between mt-4 px-1">
              <button
                onClick={handlePrevPage}
                disabled={pageHistory.length === 0}
                className="btn-ghost flex items-center gap-1"
                style={{ fontSize: '11px', padding: '5px 12px' }}
              >
                <ChevronLeft size={13} /> Newer
              </button>
              <span className="text-dim" style={{ fontSize: '10.5px' }}>
                Page {pageHistory.length + 1}
              </span>
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
