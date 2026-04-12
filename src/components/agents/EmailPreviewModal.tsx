import { useState } from 'react'
import DOMPurify from 'dompurify'
import { X, Send, Save, Ban, Edit3, User, Building, Globe, MapPin, Sparkles } from 'lucide-react'
import type { OutreachQueueItem } from '@/hooks/useAgentDashboard'

interface EmailPreviewModalProps {
  item: OutreachQueueItem
  onClose: () => void
  onApprove: () => void
  onSkip: () => void
  onSave: (subject: string, body: string) => void
}

export default function EmailPreviewModal({ item, onClose, onApprove, onSkip, onSave }: EmailPreviewModalProps) {
  const lead = item.sequence?.lead
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(item.subject || '')
  const [body, setBody] = useState(item.body || '')

  const handleSave = () => {
    onSave(subject, body)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="modal-container bg-cell w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Send size={14} className="text-purple-400" />
            </div>
            <div>
              <p className="text-polar font-semibold" style={{ fontSize: '14px' }}>Email Preview</p>
              <p className="text-dim" style={{ fontSize: '11px' }}>Review and approve before sending</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col lg:flex-row">
            {/* Email Content */}
            <div className="flex-1 p-6 border-b lg:border-b-0 lg:border-r border-border">
              {/* To Field */}
              <div className="mb-4">
                <p className="label mb-1">To</p>
                <div className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-md">
                  <User size={12} className="text-dim" />
                  <span className="text-steel" style={{ fontSize: '12px' }}>
                    {lead?.email || 'No email available'}
                  </span>
                </div>
              </div>

              {/* Subject */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="label">Subject</p>
                  {!editing && (
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1 text-dim hover:text-polar transition-colors"
                      style={{ fontSize: '10px', fontWeight: 600 }}
                    >
                      <Edit3 size={10} />
                      Edit
                    </button>
                  )}
                </div>
                {editing ? (
                  <input
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar"
                    style={{ fontSize: '13px' }}
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <div className="px-3 py-2 bg-surface border border-border rounded-md">
                    <p className="text-polar font-semibold" style={{ fontSize: '13px' }}>{subject || 'No subject'}</p>
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="mb-4">
                <p className="label mb-1">Body</p>
                {editing ? (
                  <textarea
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-polar resize-none"
                    style={{ fontSize: '13px', minHeight: 200, lineHeight: 1.6 }}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                  />
                ) : (
                  <div
                    className="px-4 py-3 bg-surface border border-border rounded-md text-steel"
                    style={{ fontSize: '13px', lineHeight: 1.7, minHeight: 150 }}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body.replace(/\n/g, '<br/>') || '<span class="text-dim">No content</span>') }}
                  />
                )}
              </div>

              {/* AI Confidence Note */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-indigo-500/5 border border-indigo-500/15 rounded-lg">
                <Sparkles size={13} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <p className="text-indigo-300/80" style={{ fontSize: '11px', lineHeight: 1.5 }}>
                  This email was personalized for <strong className="text-indigo-300">{lead?.name || 'this lead'}</strong>
                  {lead?.industry && <> based on their <strong className="text-indigo-300">{lead.industry}</strong> business</>}
                  {lead?.location && <> in <strong className="text-indigo-300">{lead.location}</strong></>}
                  .
                </p>
              </div>
            </div>

            {/* Lead Info Sidebar */}
            <div className="lg:w-64 p-5 bg-surface/30">
              <p className="label mb-4">Lead Information</p>

              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <User size={13} className="text-dim flex-shrink-0" />
                  <div>
                    <p className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Name</p>
                    <p className="text-polar font-semibold" style={{ fontSize: '13px' }}>{lead?.name || '--'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <Building size={13} className="text-dim flex-shrink-0" />
                  <div>
                    <p className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Company</p>
                    <p className="text-steel" style={{ fontSize: '12px' }}>{lead?.company || '--'}</p>
                  </div>
                </div>

                {lead?.industry && (
                  <div className="flex items-center gap-2.5">
                    <Building size={13} className="text-dim flex-shrink-0" />
                    <div>
                      <p className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Industry</p>
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-surface-2 border border-border text-steel" style={{ fontSize: '10px', fontWeight: 600 }}>
                        {lead.industry}
                      </span>
                    </div>
                  </div>
                )}

                {lead?.score !== null && lead?.score !== undefined && (
                  <div className="flex items-center gap-2.5">
                    <Sparkles size={13} className="text-dim flex-shrink-0" />
                    <div>
                      <p className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Score</p>
                      <span className={`mono font-bold ${
                        lead.score >= 80 ? 'text-green-400' :
                        lead.score >= 60 ? 'text-blue-400' :
                        lead.score >= 40 ? 'text-amber-400' :
                        'text-dim'
                      }`} style={{ fontSize: '14px' }}>
                        {lead.score}/100
                      </span>
                    </div>
                  </div>
                )}

                {lead?.source && (
                  <div className="flex items-center gap-2.5">
                    <Globe size={13} className="text-dim flex-shrink-0" />
                    <div>
                      <p className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Source</p>
                      <p className="text-steel" style={{ fontSize: '12px' }}>{lead.source}</p>
                    </div>
                  </div>
                )}

                {lead?.website && (
                  <div className="flex items-center gap-2.5">
                    <Globe size={13} className="text-dim flex-shrink-0" />
                    <div>
                      <p className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Website</p>
                      <a
                        href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info hover:underline flex items-center gap-1"
                        style={{ fontSize: '12px' }}
                      >
                        {lead.website.replace(/https?:\/\//, '').replace(/\/$/, '')}
                        <ExternalLink size={9} />
                      </a>
                    </div>
                  </div>
                )}

                {lead?.location && (
                  <div className="flex items-center gap-2.5">
                    <MapPin size={13} className="text-dim flex-shrink-0" />
                    <div>
                      <p className="text-dim" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Location</p>
                      <p className="text-steel" style={{ fontSize: '12px' }}>{lead.location}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface/30">
          <button
            onClick={onSkip}
            className="btn-ghost flex items-center gap-2 rounded-lg"
            style={{ fontSize: '11px', padding: '6px 14px' }}
          >
            <Ban size={12} />
            Reject
          </button>

          <div className="flex items-center gap-2">
            {editing && (
              <button
                onClick={handleSave}
                className="btn-ghost flex items-center gap-2 rounded-lg"
                style={{ fontSize: '11px', padding: '6px 14px' }}
              >
                <Save size={12} />
                Save Edits
              </button>
            )}
            <button
              onClick={onApprove}
              className="flex items-center gap-2 rounded-lg text-white font-semibold"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '8px 18px',
                background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                boxShadow: '0 1px 3px rgba(34, 197, 94, 0.2)',
              }}
            >
              <Send size={12} />
              Approve & Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
