// Shared Claude API wrapper for agent intelligence

// ─── System Prompts ─────────────────────────────────────────────

export const LEAD_QUALIFIER_PROMPT =
  'You are a lead qualification specialist for GTH (Grow The Hype), a digital marketing agency in Edmonton, AB. Score leads 0-100 based on: likelihood they need digital marketing, budget indicators, market fit. Be specific in your reasoning.'

export const COLD_EMAIL_WRITER_PROMPT =
  "You are a cold email specialist for GTH. Write short, personalized, non-spammy cold emails. Reference the prospect's specific business. Keep it under 150 words. No generic templates. The tone should be professional but warm — like a local business owner reaching out to another."

export const REPLY_CLASSIFIER_PROMPT =
  'Classify this email reply into one of: positive_interest, objection, not_interested, out_of_office, spam, other. Also suggest a next action.'

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
}

export async function askClaude(params: AskClaudeParams): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const body: any = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: params.maxTokens || 1024,
    system: params.systemPrompt,
    messages: params.messages,
  }

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(`Claude API error (${res.status}): ${JSON.stringify(data)}`)
  }

  return data
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
