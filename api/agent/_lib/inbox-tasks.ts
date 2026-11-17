// Turns client emails into CRM tasks. Every hour the job reads new inbox mail,
// keeps only emails from clients (matched by address or company domain), and
// asks Claude whether the email asks Omar to do something. Each request
// becomes a task linked to the client and the email. Nothing is replied to.
import { getAdminClient } from './supabase-admin'
import { listNewMessages, getMessageContent } from './gmail-server'
import { askClaude, extractToolUse } from './claude'
import { callTool } from './crm-tools'

const FREE_MAIL = /(^|\.)(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|shaw|telus|aol|proton|protonmail)\.(com|ca|net|me)$/i
const domainOf = (s?: string | null) => {
  const m = String(s || '').toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/)
  return m ? m[1] : ''
}
const siteDomain = (s?: string | null) => String(s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

const TOOL = {
  name: 'record_tasks',
  description: 'Record the concrete things the sender is asking Omar (Grow The Hype) to do.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Short action for Omar, starting with a verb, 10 words or fewer, e.g. "Update the hours on the Jasper site"' },
            detail: { type: 'string', description: 'Any specifics from the email that Omar needs to do it (optional)' },
            due_date: { type: 'string', description: 'YYYY-MM-DD only if the email gives or clearly implies a date' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          },
          required: ['text'],
        },
      },
    },
    required: ['tasks'],
  },
}

const PROMPT = `You read one email sent to Omar, who runs Grow The Hype, a creative and digital agency. The sender is one of his clients.
List only the concrete things the client is asking Omar to do or deliver (a change to their website, an invoice question to answer, a file to send, a meeting to set up, a decision they need from him).
Do not create tasks for thank-you notes, confirmations, payment notices ("this has been paid"), FYIs, newsletters, or anything already done.
Keep each task name to 10 words or fewer and put the specifics in detail. Plain Canadian English. Return an empty list when nothing is being asked. Never invent details.`

export async function runInboxTasks() {
  const sb = getAdminClient()
  const { data: integ } = await sb.from('integrations').select('user_id').eq('provider', 'gmail')
  const users = [...new Set((integ || []).map(r => r.user_id))]
  const summary: any[] = []
  for (const userId of users) {
    const [{ data: clients }, { data: contacts }] = await Promise.all([
      sb.from('clients').select('id, name, email, website, status').eq('user_id', userId).neq('status', 'archived'),
      sb.from('contacts').select('client_id, email').eq('user_id', userId).not('email', 'is', null),
    ])
    const byEmail = new Map<string, string>()
    const byDomain = new Map<string, string>()
    for (const c of clients || []) {
      if (c.email) byEmail.set(c.email.toLowerCase(), c.id)
      const d = domainOf(c.email); if (d && !FREE_MAIL.test(d)) byDomain.set(d, c.id)
      const w = siteDomain(c.website); if (w && !FREE_MAIL.test(w)) byDomain.set(w, c.id)
    }
    for (const ct of contacts || []) {
      if (ct.email) byEmail.set(ct.email.toLowerCase(), ct.client_id)
      const d = domainOf(ct.email); if (d && !FREE_MAIL.test(d)) byDomain.set(d, ct.client_id)
    }
    const name = new Map((clients || []).map(c => [c.id, c.name]))

    let msgs: { id: string; threadId: string }[] = []
    try { msgs = await listNewMessages(userId, 'in:inbox newer_than:2d -from:me -category:promotions -category:social', 40) } catch (e: any) { summary.push({ userId, error: String(e?.message || e).slice(0, 200) }); continue }
    if (!msgs.length) continue
    const { data: seen } = await sb.from('email_task_log').select('message_id').in('message_id', msgs.map(m => m.id))
    const done = new Set((seen || []).map(r => r.message_id))
    let created = 0
    for (const m of msgs) {
      if (done.has(m.id)) continue
      // Claim first so two runs never process the same email
      const { error: claimErr } = await sb.from('email_task_log').insert({ message_id: m.id, user_id: userId, outcome: 'checking' })
      if (claimErr) continue
      try {
        const msg = await getMessageContent(userId, m.id)
        const from = (msg.from.match(/<([^>]+)>/)?.[1] || msg.from).trim().toLowerCase()
        const clientId = byEmail.get(from) || byDomain.get(domainOf(from))
        if (!clientId) { await sb.from('email_task_log').update({ outcome: 'not a client' }).eq('message_id', m.id); continue }
        const body = (msg.bodyText || msg.snippet || '').replace(/\n>.*$/gs, '').slice(0, 4000)
        const r = await askClaude({
          systemPrompt: PROMPT, tier: 'fast', maxTokens: 600, tools: [TOOL],
          messages: [{ role: 'user', content: `Client: ${name.get(clientId)}\nFrom: ${msg.from}\nDate: ${msg.date}\nSubject: ${msg.subject}\n\n${body}` }],
        })
        const tasks = (extractToolUse(r)?.input?.tasks || []).slice(0, 5)
        const ids: string[] = []
        for (const t of tasks) {
          const text = String(t?.text || '').trim()
          if (!text) continue
          const res: any = await callTool(userId, 'add_task', {
            text, client: clientId, priority: t.priority || 'medium',
            due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.due_date || '')) ? t.due_date : undefined,
            description: `${t.detail ? String(t.detail).slice(0, 600) + '\n\n' : ''}From ${msg.from}: "${msg.subject}" (${msg.date})\nhttps://mail.google.com/mail/u/0/#all/${m.threadId}`,
          })
          if (res?.task?.id) { ids.push(res.task.id); if (res.created) { created++; await sb.from('tasks').update({ tags: 'from-email' }).eq('id', res.task.id) } }
        }
        await sb.from('email_task_log').update({ outcome: ids.length ? `tasks: ${ids.length}` : 'nothing asked', task_id: ids[0] || null }).eq('message_id', m.id)
      } catch (e: any) {
        // Let the next run try this email again
        await sb.from('email_task_log').delete().eq('message_id', m.id)
        summary.push({ message: m.id, error: String(e?.message || e).slice(0, 200) })
      }
    }
    summary.push({ userId, checked: msgs.length - done.size, created })
  }
  return { ok: true, summary }
}
