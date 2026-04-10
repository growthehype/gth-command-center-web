import { useState } from 'react'
import { Mail, Check, Edit3, X, ExternalLink } from 'lucide-react'
import type { OutreachQueueItem } from '@/hooks/useAgentDashboard'
import EmailPreviewModal from './EmailPreviewModal'

interface OutreachQueueProps {
  queue: OutreachQueueItem[]
  loading?: boolean
  onApprove: (id: string) => void
  onSkip: (id: string) => void
  onUpdate: (id: string, subject: string, body: string) => void
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-dim mono" style={{ fontSize: '11px' }}>--</span>
  const color =
    score >= 80 ? 'text-green-400 bg-green-500/10 border-green-500/20' :
    score >= 60 ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
    score >= 40 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
    'text-dim bg-surface-2 border-border'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border mono ${color}`} style={{ fontSize: '10px', fontWeight: 700 }}>
      {score}
    </span>
  )
}

export default function OutreachQueue({ queue, loading, onApprove, onSkip, onUpdate }: OutreachQueueProps) {
  const [selectedItem, setSelectedItem] = useState<OutreachQueueItem | null>(null)

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 skeleton-shimmer rounded-lg" />
        ))}
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center mx-auto mb-3">
          <Mail size={20} className="text-dim" style={{ opacity: 0.4 }} />
        </div>
        <p className="text-steel font-semibold" style={{ fontSize: '13px' }}>No emails pending review</p>
        <p className="text-dim mt-1 max-w-sm mx-auto" style={{ fontSize: '12px' }}>
          The AI agent will draft emails for qualified leads. They will appear here for your review before sending.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontSize: '12px' }}>
          <thead>
            <tr className="border-b border-border">
              <th className="label px-4 py-3 text-left">Lead</th>
              <th className="label px-4 py-3 text-left hidden md:table-cell">Company</th>
              <th className="label px-4 py-3 text-left hidden lg:table-cell">Industry</th>
              <th className="label px-4 py-3 text-center">Score</th>
              <th className="label px-4 py-3 text-left">Subject</th>
              <th className="label px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.map(item => {
              const lead = item.sequence?.lead
              return (
                <tr
                  key={item.id}
                  className="table-row cursor-pointer"
                  onClick={() => setSelectedItem(item)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-surface-2 border border-border flex items-center justify-center flex-shrink-0">
                        <span className="text-dim" style={{ fontSize: '9px', fontWeight: 800 }}>
                          {(lead?.name || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <span className="text-polar font-semibold truncate" style={{ maxWidth: 120 }}>
                        {lead?.name || 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-steel hidden md:table-cell truncate" style={{ maxWidth: 140 }}>
                    {lead?.company || '--'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {lead?.industry ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-surface-2 border border-border text-steel" style={{ fontSize: '10px', fontWeight: 600 }}>
                        {lead.industry}
                      </span>
                    ) : '--'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={lead?.score ?? null} />
                  </td>
                  <td className="px-4 py-3 text-steel" style={{ maxWidth: 200 }}>
                    <span className="truncate block">{item.subject || 'No subject'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => onApprove(item.id)}
                        className="p-1.5 rounded-md text-green-400 hover:bg-green-500/10 transition-colors"
                        title="Approve & Send"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="p-1.5 rounded-md text-dim hover:bg-surface-2 hover:text-polar transition-colors"
                        title="Preview & Edit"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => onSkip(item.id)}
                        className="p-1.5 rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Skip"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Email Preview Modal */}
      {selectedItem && (
        <EmailPreviewModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onApprove={() => {
            onApprove(selectedItem.id)
            setSelectedItem(null)
          }}
          onSkip={() => {
            onSkip(selectedItem.id)
            setSelectedItem(null)
          }}
          onSave={(subject, body) => {
            onUpdate(selectedItem.id, subject, body)
            setSelectedItem(null)
          }}
        />
      )}
    </>
  )
}
