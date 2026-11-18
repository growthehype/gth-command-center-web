// Voice assistant for the Command Center. The browser turns speech into text
// and reads the answer aloud; this endpoint lets Claude look things up (and make
// small changes) with the same CRM tools as the Claude connector, then answers
// in a few short spoken sentences.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { askClaude } from './agent/_lib/claude'
import { TOOLS, callTool, ToolError } from './agent/_lib/crm-tools'
import { checkRateLimit, incrementCounter } from './agent/_lib/rate-limiter'
import { getAdminClient } from './agent/_lib/supabase-admin'

const SYSTEM = `You are the voice of Omar's Command Center, the CRM for Grow The Hype, his creative and digital agency in Edmonton. Omar is listening, not reading.
How to answer:
- Speak like a sharp, warm assistant. Short sentences. No lists, bullets, markdown, emojis, links or ids.
- Lead with what matters most. Group small things ("three small tasks for T&C").
- Say dates as words ("tomorrow", "Thursday the 19th") and money plainly ("seven hundred and sixty one dollars" is not needed; "$761" is fine).
- Use the tools to get facts. Never guess or invent names, numbers or dates. If something isn't in the CRM, say so briefly.
- You may add or update tasks, projects and notes when Omar asks. Confirm in one sentence what you changed. Never say an email or invoice was sent: you cannot send anything.
- Keep answers under 80 words unless Omar asks for detail. A rundown is about 100 words.
- Canadian spelling.`

const RUNDOWN = `Give me my rundown for right now: the most important things that need me, anything I'm waiting on that's due a check-in, today's meetings and appointments, money that's outstanding, and what's coming up this week. Start with a short greeting that fits the time of day. Use get_overview and list_calendar (today and the next few days) first.`

const READ_ONLY = new Set(['get_overview', 'find_client', 'list_tasks', 'list_projects', 'list_invoices', 'list_calendar', 'time_summary'])
const anthropicTools = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  let user: { id: string } | null = null
  const agentToken = String(req.headers['x-agent-token'] || '')
  if (agentToken) {
    // Health check from the server's own scheduler (read-only questions)
    const sb = getAdminClient()
    const { data: ok } = await sb.rpc('agent_hunt_token_ok', { t: agentToken })
    if (ok !== true) return res.status(401).json({ error: 'Unauthorized' })
    const { data: owner } = await sb.from('integrations').select('user_id').eq('provider', 'gmail').limit(1).maybeSingle()
    user = owner ? { id: owner.user_id } : null
  } else {
    const auth = String(req.headers.authorization || '')
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in first' })
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
    const { data: { user: u } } = await createClient(url, anon).auth.getUser(auth.slice(7))
    user = u ? { id: u.id } : null
  }
  if (!user) return res.status(401).json({ error: 'Session expired. Sign in again.' })

  const limit = await checkRateLimit(user.id, 'voice', 300)
  if (!limit.allowed) return res.status(429).json({ error: 'Daily voice limit reached.' })

  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {}
  const question = b.mode === 'rundown' ? RUNDOWN : String(b.question || '').slice(0, 600).trim()
  if (!question) return res.status(400).json({ error: 'Say something first' })
  const now = String(b.now || new Date().toString()).slice(0, 80)
  const events = Array.isArray(b.events) ? b.events.slice(0, 40).map((e: any) => `${e.date} ${e.time || 'all day'}: ${String(e.title || '').slice(0, 120)}`).join('\n') : ''
  const history = Array.isArray(b.history) ? b.history.slice(-6).filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map((m: any) => ({ role: m.role, content: m.content.slice(0, 1500) })) : []

  const system = `${SYSTEM}\n\nRight now it is ${now} for Omar (Edmonton). Today's date is ${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date())}.\nUse list_calendar for meetings and add_calendar_event to book things in his Google Calendar.${events ? `\nCRM calendar items:\n${events}` : ''}`
  const messages: any[] = [...history, { role: 'user', content: question }]
  const changed: string[] = []

  try {
    for (let i = 0; i < 6; i++) {
      const r = await askClaude({ systemPrompt: system, messages, tools: agentToken ? anthropicTools.filter(t => READ_ONLY.has(t.name)) : anthropicTools, maxTokens: 700, tier: 'write' })
      const content = r.content || []
      const uses = content.filter((c: any) => c.type === 'tool_use')
      if (!uses.length || r.stop_reason !== 'tool_use') {
        const text = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ').trim()
        await incrementCounter(user.id, 'voice')
        return res.status(200).json({ answer: text || "Sorry, I didn't catch that.", changed })
      }
      messages.push({ role: 'assistant', content })
      const results = []
      for (const u of uses) {
        try {
          if (agentToken && !READ_ONLY.has(u.name)) throw new ToolError('Read only')
          const out = await callTool(user.id, u.name, u.input || {})
          if (!/^(get_|find_|list_)/.test(u.name)) changed.push(u.name)
          results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 12000) })
        } catch (e: any) {
          results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: e instanceof ToolError ? e.message : 'That lookup failed.' })
        }
      }
      messages.push({ role: 'user', content: results })
    }
    return res.status(200).json({ answer: 'That took too many steps. Try asking a simpler way.', changed })
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e).slice(0, 200) })
  }
}
