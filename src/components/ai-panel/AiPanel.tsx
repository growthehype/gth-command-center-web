import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { X, Sparkles, Send, Key } from 'lucide-react'

export default function AiPanel() {
  const { aiPanelOpen, setAiPanelOpen, settings } = useAppStore()
  const [message, setMessage] = useState('')
  const hasApiKey = !!settings.ai_api_key

  if (!aiPanelOpen) return null

  const suggestedPrompts = [
    'Summarize my week',
    'Draft a follow-up email for overdue invoices',
    'What clients need check-ins?',
    'Help me plan next week',
  ]

  return (
    <div className="h-full border-l border-border bg-surface flex flex-col" style={{ width: '360px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-polar" />
          <span className="font-[700] text-polar" style={{ fontSize: '14px' }}>AI Assist</span>
        </div>
        <button onClick={() => setAiPanelOpen(false)} className="text-dim hover:text-steel transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!hasApiKey ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <Key size={24} className="text-dim" strokeWidth={1.5} />
            <p className="text-steel font-[700]" style={{ fontSize: '14px' }}>API Key Required</p>
            <p className="text-dim" style={{ fontSize: '12px', maxWidth: '240px' }}>
              Add your Claude API key in Settings to enable AI features. Your key is encrypted and stored locally.
            </p>
            <button
              onClick={() => { setAiPanelOpen(false); useAppStore.getState().setCurrentPage('settings') }}
              className="btn-primary mt-2"
            >
              Open Settings
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-dim" style={{ fontSize: '12px' }}>
              AI Assist uses your local data to help with analysis, drafting, and planning. Nothing leaves your machine except API calls.
            </p>
            <div className="flex flex-col gap-2 mt-2">
              <span className="label text-dim">SUGGESTED</span>
              {suggestedPrompts.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => setMessage(prompt)}
                  className="text-left px-3 py-2 border border-border hover:border-dim text-steel hover:text-polar transition-colors"
                  style={{ fontSize: '13px' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <p className="text-dim mt-4" style={{ fontSize: '11px' }}>
              Full AI chat coming in v1.1. Suggested prompts and context builder are active.
            </p>
          </div>
        )}
      </div>

      {/* Input */}
      {hasApiKey && (
        <div className="border-t border-border px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Ask anything..."
              className="flex-1 bg-transparent text-polar outline-none placeholder:text-dim"
              style={{ fontSize: '13px' }}
              onKeyDown={e => { if (e.key === 'Enter' && message.trim()) { /* v1.1 */ } }}
            />
            <button
              className="text-dim hover:text-polar transition-colors"
              disabled={!message.trim()}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
