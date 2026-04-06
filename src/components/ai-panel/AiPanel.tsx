import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { tasks as tasksApi, projects as projectsApi, invoices as invoicesApi, activity as activityApi, timeEntries as timeEntriesApi } from '@/lib/api'
import { createGoogleEvent, isGoogleConnected } from '@/lib/google-calendar'
import { X, Sparkles, Send, Key, Trash2, CheckCircle, AlertCircle, Loader2, Mic, MicOff } from 'lucide-react'

// ── Types ──

interface ApiMessage {
  role: 'user' | 'assistant'
  content: any
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  toolName?: string
  toolResult?: string
  isError?: boolean
  isLoading?: boolean
}

// ── Tool definitions ──

const tools = [
  {
    name: 'create_task',
    description: 'Create a new task in the CRM',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Task title/description' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Task priority' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        client_id: { type: 'string', description: 'Client ID to associate with (optional)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'create_event',
    description: 'Create a new event on Google Calendar',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Event title' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        startTime: { type: 'string', description: 'Start time in HH:MM format (24hr)' },
        endTime: { type: 'string', description: 'End time in HH:MM format (24hr)' },
        description: { type: 'string', description: 'Event description (optional)' },
      },
      required: ['title', 'date', 'startTime', 'endTime'],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project in the CRM',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Project title' },
        description: { type: 'string', description: 'Project description' },
        client_id: { type: 'string', description: 'Client ID (optional)' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
        status: { type: 'string', enum: ['backlog', 'progress', 'review', 'done'] },
        due_date: { type: 'string', description: 'Due date YYYY-MM-DD' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_invoice',
    description: 'Create a new invoice',
    input_schema: {
      type: 'object' as const,
      properties: {
        num: { type: 'string', description: 'Invoice number' },
        client_id: { type: 'string', description: 'Client ID' },
        amount: { type: 'number', description: 'Invoice amount' },
        due_date: { type: 'string', description: 'Due date YYYY-MM-DD' },
        status: { type: 'string', enum: ['draft', 'sent', 'paid'], description: 'Invoice status' },
      },
      required: ['num', 'amount'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as complete',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The task ID to complete' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'get_crm_data',
    description: 'Get current CRM data for analysis. Returns clients, tasks, projects, invoices, events, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['clients', 'tasks', 'projects', 'invoices', 'events', 'leads', 'overview'], description: 'What data to retrieve' },
      },
      required: ['type'],
    },
  },
  {
    name: 'navigate_to_page',
    description: 'Navigate to a specific page in the CRM',
    input_schema: {
      type: 'object' as const,
      properties: {
        page: { type: 'string', enum: ['briefing', 'dashboard', 'calendar', 'clients', 'contacts', 'projects', 'tasks', 'meetings', 'invoices', 'financials', 'outreach', 'campaigns', 'services', 'goals', 'settings'] },
      },
      required: ['page'],
    },
  },
  {
    name: 'log_activity',
    description: 'Log an activity entry',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Activity type' },
        description: { type: 'string', description: 'What happened' },
        entity: { type: 'string', description: 'Related entity type (client, project, task, etc.)' },
        entity_id: { type: 'string', description: 'Related entity ID' },
      },
      required: ['type', 'description'],
    },
  },
  {
    name: 'start_timer',
    description: 'Start a time tracking timer',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project ID (optional)' },
        client_id: { type: 'string', description: 'Client ID (optional)' },
        notes: { type: 'string', description: 'What you are working on' },
        billable: { type: 'boolean', description: 'Is this billable time?' },
      },
      required: [],
    },
  },
  {
    name: 'stop_timer',
    description: 'Stop the currently running timer',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
]

// ── Tool executor ──

async function executeTool(name: string, input: any): Promise<string> {
  const store = useAppStore.getState()

  switch (name) {
    case 'create_task': {
      const task = await tasksApi.create({
        text: input.text,
        priority: input.priority || 'medium',
        due_date: input.due_date || null,
        client_id: input.client_id || null,
        done: 0,
        description: null,
        tags: null,
        recurring: null,
      })
      await store.refreshTasks()
      return JSON.stringify({ success: true, task_id: task.id, message: `Task "${input.text}" created` })
    }
    case 'create_event': {
      if (!isGoogleConnected()) return JSON.stringify({ success: false, error: 'Google Calendar not connected' })
      const ok = await createGoogleEvent({
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        description: input.description,
      })
      return JSON.stringify({ success: ok, message: ok ? `Event "${input.title}" created on Google Calendar` : 'Failed to create event' })
    }
    case 'create_project': {
      const proj = await projectsApi.create({
        title: input.title,
        description: input.description || null,
        client_id: input.client_id || null,
        priority: input.priority || 'medium',
        status: input.status || 'backlog',
        due_date: input.due_date || null,
        hours: 0,
        links: null,
        recurring: null,
      })
      await store.refreshProjects()
      return JSON.stringify({ success: true, project_id: proj.id, message: `Project "${input.title}" created` })
    }
    case 'create_invoice': {
      const inv = await invoicesApi.create({
        num: input.num,
        client_id: input.client_id || null,
        amount: input.amount,
        due_date: input.due_date || null,
        status: input.status || 'draft',
        sent_date: null,
        file_path: null,
        notes: null,
      })
      await store.refreshInvoices()
      return JSON.stringify({ success: true, invoice_id: inv.id, message: `Invoice ${input.num} created for $${input.amount}` })
    }
    case 'complete_task': {
      await tasksApi.toggle(input.task_id)
      await store.refreshTasks()
      return JSON.stringify({ success: true, message: 'Task marked as complete' })
    }
    case 'get_crm_data': {
      switch (input.type) {
        case 'clients':
          return JSON.stringify(store.clients.map(c => ({ id: c.id, name: c.name, status: c.status, mrr: c.mrr, service: c.service })))
        case 'tasks':
          return JSON.stringify(store.tasks.filter(t => !t.done).map(t => ({ id: t.id, text: t.text, priority: t.priority, due_date: t.due_date, client_name: t.client_name })))
        case 'projects':
          return JSON.stringify(store.projects.map(p => ({ id: p.id, title: p.title, status: p.status, client_name: p.client_name, priority: p.priority })))
        case 'invoices':
          return JSON.stringify(store.invoices.map(i => ({ id: i.id, num: i.num, amount: i.amount, status: i.status, client_name: i.client_name, due_date: i.due_date })))
        case 'events':
          return JSON.stringify(store.events.map(e => ({ id: e.id, title: e.title, date: e.date, start_time: e.start_time, type: e.type })))
        case 'leads':
          return JSON.stringify(store.leads.map(l => ({ id: l.id, name: l.name, stage: l.stage, deal_value: l.deal_value })))
        case 'overview':
          return JSON.stringify({
            active_clients: store.clients.filter(c => c.status === 'active').length,
            open_tasks: store.tasks.filter(t => !t.done).length,
            open_projects: store.projects.filter(p => p.status !== 'done').length,
            unpaid_invoices: store.invoices.filter(i => i.status !== 'paid').length,
            total_mrr: store.clients.filter(c => c.status === 'active').reduce((s, c) => s + (c.mrr || 0), 0),
            pipeline_value: store.leads.reduce((s, l) => s + (l.deal_value || 0), 0),
          })
        default:
          return JSON.stringify({ error: 'Unknown data type' })
      }
    }
    case 'navigate_to_page': {
      store.setCurrentPage(input.page)
      return JSON.stringify({ success: true, message: `Navigated to ${input.page}` })
    }
    case 'log_activity': {
      // activity.log signature: (type, entity, entityId, description)
      await activityApi.log(input.type, input.entity || null, input.entity_id || null, input.description)
      await store.refreshActivity()
      return JSON.stringify({ success: true, message: 'Activity logged' })
    }
    case 'start_timer': {
      await timeEntriesApi.start({
        project_id: input.project_id || null,
        client_id: input.client_id || null,
        notes: input.notes || '',
        billable: input.billable ? 1 : 0,
      })
      await store.refreshTimeEntries()
      await store.refreshRunningTimer()
      return JSON.stringify({ success: true, message: 'Timer started' })
    }
    case 'stop_timer': {
      const running = store.runningTimer
      if (!running) return JSON.stringify({ success: false, error: 'No timer running' })
      await timeEntriesApi.stop(running.id, running.notes || '')
      await store.refreshTimeEntries()
      await store.refreshRunningTimer()
      return JSON.stringify({ success: true, message: 'Timer stopped' })
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

// ── Claude API call ──

async function sendToClaudeAPI(messages: ApiMessage[], apiKey: string, model: string): Promise<any> {
  const store = useAppStore.getState()

  const systemMsg = `You are an AI assistant embedded in the GTH Operations Command Center, a CRM for a digital marketing agency called Grow The Hype (GTH), owned by Omar Alladina. You can execute real actions in the CRM using the tools provided. Today's date is ${new Date().toISOString().split('T')[0]}.

Current CRM summary:
- ${store.clients.filter(c => c.status === 'active').length} active clients
- ${store.tasks.filter(t => !t.done).length} open tasks
- ${store.projects.filter(p => p.status !== 'done').length} active projects
- ${store.invoices.filter(i => i.status !== 'paid').length} unpaid invoices

Active clients: ${store.clients.filter(c => c.status === 'active').map(c => `${c.name} (${c.service || 'N/A'}, $${c.mrr}/mo)`).join(', ') || 'None'}

When the user asks you to do something, use the appropriate tool. Be concise and action-oriented. After executing a tool, confirm what was done.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemMsg,
      tools,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error: ${res.status}`)
  }

  return res.json()
}

// ── Helper: extract text from Claude response content ──

function extractTextFromContent(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
  }
  return ''
}

// ── Helper: get tool_use blocks from content ──

function getToolUseBlocks(content: any): any[] {
  if (!Array.isArray(content)) return []
  return content.filter((b: any) => b.type === 'tool_use')
}

// ── Generate unique ID ──

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// ── Friendly tool label ──

function toolLabel(name: string, result: string): string {
  try {
    const parsed = JSON.parse(result)
    if (parsed.message) return parsed.message
    if (parsed.error) return parsed.error
  } catch { /* ignore */ }
  return name.replace(/_/g, ' ')
}

// ── Component ──

export default function AiPanel() {
  const { aiPanelOpen, setAiPanelOpen, settings } = useAppStore()
  const [input, setInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasApiKey = !!settings.ai_api_key

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Focus input when panel opens
  useEffect(() => {
    if (aiPanelOpen && hasApiKey) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [aiPanelOpen, hasApiKey])

  const clearChat = useCallback(() => {
    setChatMessages([])
    setApiMessages([])
  }, [])

  const handleSend = useCallback(async (text?: string) => {
    const userText = (text || input).trim()
    if (!userText || isLoading) return
    setInput('')

    const apiKey = settings.ai_api_key
    const model = settings.ai_model || 'claude-sonnet-4-20250514'

    // Add user message to chat display
    const userChatMsg: ChatMessage = { id: genId(), role: 'user', text: userText }
    setChatMessages(prev => [...prev, userChatMsg])

    // Add loading indicator
    const loadingId = genId()
    setChatMessages(prev => [...prev, { id: loadingId, role: 'assistant', text: '', isLoading: true }])

    // Build API messages
    const newApiMessages: ApiMessage[] = [...apiMessages, { role: 'user', content: userText }]
    setApiMessages(newApiMessages)
    setIsLoading(true)

    try {
      let currentMessages = [...newApiMessages]
      let loopCount = 0
      const maxLoops = 10 // Safety limit

      while (loopCount < maxLoops) {
        loopCount++
        const response = await sendToClaudeAPI(currentMessages, apiKey, model)
        const content = response.content
        const stopReason = response.stop_reason

        // Add assistant response to API messages
        currentMessages = [...currentMessages, { role: 'assistant', content }]

        const toolBlocks = getToolUseBlocks(content)
        const textContent = extractTextFromContent(content)

        if (toolBlocks.length === 0 || stopReason === 'end_turn') {
          // No tool calls or final response -- done
          // Remove loading, add assistant text
          setChatMessages(prev => {
            const filtered = prev.filter(m => m.id !== loadingId)
            if (textContent) {
              return [...filtered, { id: genId(), role: 'assistant', text: textContent }]
            }
            return filtered
          })
          setApiMessages(currentMessages)
          break
        }

        // Execute tools
        const toolResultBlocks: any[] = []
        const toolChatMsgs: ChatMessage[] = []

        for (const block of toolBlocks) {
          let result: string
          let isError = false
          try {
            result = await executeTool(block.name, block.input)
          } catch (err: any) {
            result = JSON.stringify({ error: err.message || 'Tool execution failed' })
            isError = true
          }

          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          })

          toolChatMsgs.push({
            id: genId(),
            role: 'tool',
            text: toolLabel(block.name, result),
            toolName: block.name,
            toolResult: result,
            isError,
          })
        }

        // Show any intermediate text + tool results in chat
        setChatMessages(prev => {
          const filtered = prev.filter(m => m.id !== loadingId)
          const additions: ChatMessage[] = []
          if (textContent) {
            additions.push({ id: genId(), role: 'assistant', text: textContent })
          }
          additions.push(...toolChatMsgs)
          // Re-add loading indicator for next loop
          additions.push({ id: loadingId, role: 'assistant', text: '', isLoading: true })
          return [...filtered, ...additions]
        })

        // Feed tool results back
        currentMessages = [...currentMessages, { role: 'user', content: toolResultBlocks }]
      }
    } catch (err: any) {
      // Remove loading, add error
      setChatMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingId)
        return [...filtered, { id: genId(), role: 'assistant', text: err.message || 'An error occurred', isError: true }]
      })
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, apiMessages, settings.ai_api_key, settings.ai_model])

  const toggleVoice = useCallback(() => {
    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.')
      return
    }

    if (isListening) {
      // Stop listening
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    // Start listening
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      if (transcript.trim()) {
        // Send the transcribed text directly
        handleSend(transcript.trim())
      }
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening, handleSend])

  if (!aiPanelOpen) return null

  const suggestedPrompts = [
    'Give me a business overview',
    'What tasks are overdue?',
    'Create a task: Follow up with clients',
    'Schedule a team meeting tomorrow at 10am',
    'Show me unpaid invoices',
    'What clients need check-ins?',
    'Start a timer for admin work',
    'Help me plan next week',
  ]

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setAiPanelOpen(false)} />

      <div className="h-full border-l border-border bg-surface flex flex-col w-full md:w-[360px] fixed inset-y-0 right-0 z-50 md:relative md:z-auto" style={{ top: '44px' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-polar" />
            <span className="font-[700] text-polar" style={{ fontSize: '14px' }}>AI Assist</span>
          </div>
          <div className="flex items-center gap-2">
            {chatMessages.length > 0 && (
              <button
                onClick={clearChat}
                className="text-dim hover:text-steel transition-colors"
                title="Clear chat"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button onClick={() => setAiPanelOpen(false)} className="text-dim hover:text-steel transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!hasApiKey ? (
            /* No API key state */
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
          ) : chatMessages.length === 0 ? (
            /* Empty state with suggested prompts */
            <div className="flex flex-col gap-3">
              <p className="text-dim" style={{ fontSize: '12px' }}>
                AI Assist can analyze your CRM data and execute real actions -- create tasks, schedule events, manage projects, and more.
              </p>
              <div className="flex flex-col gap-2 mt-2">
                <span className="label text-dim">SUGGESTED</span>
                {suggestedPrompts.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="text-left px-3 py-2 border border-border hover:border-dim text-steel hover:text-polar transition-colors"
                    style={{ fontSize: '13px' }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Chat messages */
            <div className="flex flex-col gap-3">
              {chatMessages.map(msg => {
                // Loading indicator
                if (msg.isLoading) {
                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div className="px-3 py-2 rounded-lg bg-surface-2 max-w-[85%]">
                        <div className="flex items-center gap-1.5">
                          <Loader2 size={12} className="text-steel animate-spin" />
                          <span className="text-dim" style={{ fontSize: '12px' }}>Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )
                }

                // Tool result card
                if (msg.role === 'tool') {
                  const isSuccess = !msg.isError && msg.toolResult && (() => {
                    try { return JSON.parse(msg.toolResult!).success !== false } catch { return true }
                  })()

                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div
                        className={`px-3 py-1.5 rounded max-w-[85%] flex items-center gap-2 ${isSuccess ? 'bg-ok/10 border border-ok/20' : 'bg-err/10 border border-err/20'}`}
                        style={{ fontSize: '12px' }}
                      >
                        {isSuccess ? (
                          <CheckCircle size={12} className="text-ok flex-shrink-0" />
                        ) : (
                          <AlertCircle size={12} className="text-err flex-shrink-0" />
                        )}
                        <span className={isSuccess ? 'text-ok' : 'text-err'}>{msg.text}</span>
                      </div>
                    </div>
                  )
                }

                // User message
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div
                        className="px-3 py-2 rounded-lg max-w-[85%]"
                        style={{ fontSize: '13px', backgroundColor: 'rgba(0,0,0,0.06)' }}
                      >
                        <span className="text-polar">{msg.text}</span>
                      </div>
                    </div>
                  )
                }

                // Assistant message
                if (msg.role === 'assistant') {
                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div
                        className="px-3 py-2 rounded-lg max-w-[85%]"
                        style={{
                          fontSize: '13px',
                          backgroundColor: 'rgba(0,0,0,0.02)',
                          border: msg.isError ? '1px solid rgba(239, 68, 68, 0.3)' : undefined,
                        }}
                      >
                        <span
                          className={msg.isError ? 'text-red-400' : 'text-steel'}
                          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                        >
                          {msg.text}
                        </span>
                      </div>
                    </div>
                  )
                }

                return null
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        {hasApiKey && (
          <div className="border-t border-border px-4 py-3 flex-shrink-0">
            {isListening && (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-err animate-pulse" />
                <span className="text-err" style={{ fontSize: '11px', fontWeight: 600 }}>Listening...</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask anything..."
                className="flex-1 bg-transparent text-polar outline-none placeholder:text-dim"
                style={{ fontSize: '13px' }}
                disabled={isLoading}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <button
                className={`transition-colors ${isListening ? 'text-err animate-pulse' : 'text-dim hover:text-polar'}`}
                onClick={toggleVoice}
                title={isListening ? 'Stop listening' : 'Voice input'}
                disabled={isLoading}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
              <button
                className="text-dim hover:text-polar transition-colors disabled:opacity-30"
                disabled={!input.trim() || isLoading}
                onClick={() => handleSend()}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
