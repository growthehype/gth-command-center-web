// Shared Claude API wrapper for agent intelligence

// ─── System Prompts ─────────────────────────────────────────────

export const LEAD_QUALIFIER_PROMPT =
  'You are a lead qualification specialist for GTH (Grow The Hype), a digital marketing agency in Edmonton, AB. Score leads 0-100 based on: likelihood they need digital marketing, budget indicators, market fit. Be specific in your reasoning.'

export const COLD_EMAIL_WRITER_PROMPT =
  "You are a cold email specialist for GTH. Write short, personalized, non-spammy cold emails. Reference the prospect's specific business. Keep it under 150 words. No generic templates. The tone should be professional but warm — like a local business owner reaching out to another."

export const REPLY_CLASSIFIER_PROMPT =
  'Classify this reply to a cold email from Omar at Grow The Hype into one of: positive_interest, objection, not_interested, out_of_office, spam, other. Any request to stop, unsubscribe, be removed, or a plain "no thanks" is not_interested. Questions about price, timing or how it works are positive_interest. Suggest a next action and, for positive replies or objections, a short plain draft response in Omar\'s voice (no em dashes, no exclamation marks, signed Omar).'

export const SALES_EMAIL_WRITER_PROMPT =
  'You are selling GTH Command Center, a CRM built for agencies and freelancers. Highlight features: client management, invoicing, AI assistant, Gmail/Calendar integration, pipeline tracking. Keep emails short and value-focused.'

// ─── Tool Definitions ───────────────────────────────────────────

export const LEAD_QUALIFIER_TOOLS = [
  {
    name: 'score_lead',
    description: 'Score a lead based on qualification criteria',
    input_schema: {
      type: 'object' as const,
      properties: {
        score: { type: 'number', description: 'Lead score 0-100' },
        reasoning: { type: 'string', description: 'Why this score was given' },
        signals: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key signals that influenced the score',
        },
        recommended_action: {
          type: 'string',
          enum: ['send_cold_email', 'add_to_nurture', 'skip', 'priority_outreach'],
          description: 'What to do next with this lead',
        },
      },
      required: ['score', 'reasoning', 'signals', 'recommended_action'],
    },
  },
]

export const COLD_EMAIL_TOOLS = [
  {
    name: 'compose_email',
    description: 'Compose a cold outreach email',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', description: 'Email subject line (short, curiosity-driven)' },
        body: { type: 'string', description: 'Email body in plain text (will be converted to HTML)' },
        personalization_notes: { type: 'string', description: 'What was personalized and why' },
      },
      required: ['subject', 'body', 'personalization_notes'],
    },
  },
]

export const REPLY_CLASSIFIER_TOOLS = [
  {
    name: 'classify_reply',
    description: 'Classify an email reply and suggest next action',
    input_schema: {
      type: 'object' as const,
      properties: {
        classification: {
          type: 'string',
          enum: ['positive_interest', 'objection', 'not_interested', 'out_of_office', 'spam', 'other'],
        },
        confidence: { type: 'number', description: 'Confidence 0-1' },
        summary: { type: 'string', description: 'Brief summary of the reply' },
        suggested_action: {
          type: 'string',
          enum: ['send_followup', 'schedule_call', 'handle_objection', 'remove_from_sequence', 'wait', 'flag_for_human'],
        },
        draft_response: { type: 'string', description: 'Optional draft response if applicable' },
      },
      required: ['classification', 'confidence', 'summary', 'suggested_action'],
    },
  },
]

export const SALES_EMAIL_TOOLS = [
  {
    name: 'compose_sales_email',
    description: 'Compose a sales email for GTH Command Center',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body in plain text' },
        value_props_used: {
          type: 'array',
          items: { type: 'string' },
          description: 'Which value propositions were highlighted',
        },
      },
      required: ['subject', 'body', 'value_props_used'],
    },
  },
]

// Map agent type to its tools
export function getToolsForAgent(agentType: string) {
  switch (agentType) {
    case 'lead_qualifier': return LEAD_QUALIFIER_TOOLS
    case 'cold_email': return COLD_EMAIL_TOOLS
    case 'reply_classifier': return REPLY_CLASSIFIER_TOOLS
    case 'sales_email': return SALES_EMAIL_TOOLS
    default: return []
  }
}

// ─── Claude API Wrapper ─────────────────────────────────────────

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | any[]
}

interface AskClaudeParams {
  systemPrompt: string
  messages: ClaudeMessage[]
  tools?: any[]
  maxTokens?: number
  /** 'write' = best writer, 'fast' = cheap scoring/classification */
  tier?: 'write' | 'fast'
  temperature?: number
}

// Current models. If an account can't reach one (404 / not_found), we fall
// back to a long-lived model so the agent never stalls on a model rename.
export const MODEL_WRITE = 'claude-sonnet-5-5'
export const MODEL_FAST = 'claude-haiku-5-5'
const MODEL_FALLBACK = 'claude-sonnet-4-20250514'

async function callMessages(apiKey: string, body: any): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export async function askClaude(params: AskClaudeParams): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const body: any = {
    model: params.tier === 'fast' ? MODEL_FAST : MODEL_WRITE,
    max_tokens: params.maxTokens || 1024,
    system: params.systemPrompt,
    messages: params.messages,
  }
  if (typeof params.temperature === 'number') body.temperature = params.temperature

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools
    // Force the structured tool so we always get parseable output
    if (params.tools.length === 1) body.tool_choice = { type: 'tool', name: params.tools[0].name }
  }

  let r = await callMessages(apiKey, body)

  const modelMissing = !r.ok && (r.status === 404 || JSON.stringify(r.data).includes('not_found'))
  if (modelMissing) {
    r = await callMessages(apiKey, { ...body, model: MODEL_FALLBACK })
  }
  // One retry on overload / rate limit
  if (!r.ok && (r.status === 429 || r.status === 529 || r.status >= 500)) {
    await new Promise(res => setTimeout(res, 1500))
    r = await callMessages(apiKey, body)
  }

  if (!r.ok) {
    throw new Error(`Claude API error (${r.status}): ${JSON.stringify(r.data).slice(0, 400)}`)
  }

  return r.data
}

// ─── Helpers ────────────────────────────────────────────────────

/** Extract text content from a Claude response */
export function extractText(response: any): string {
  if (!response?.content) return ''
  const textBlock = response.content.find((b: any) => b.type === 'text')
  return textBlock?.text || ''
}

/** Extract tool use result from a Claude response */
export function extractToolUse(response: any): any | null {
  if (!response?.content) return null
  const toolBlock = response.content.find((b: any) => b.type === 'tool_use')
  return toolBlock ? { name: toolBlock.name, input: toolBlock.input } : null
}
