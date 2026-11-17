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

const SENT_TOOL = {
  name: 'record_handoff',
  description: 'Describe what this email Omar sent means for his work.',
  input_schema: {
    type: 'object',
    properties: {
      is_client_work: { type: 'boolean', description: 'True only if this is Grow The Hype business with a client or prospective client (a proposal, website, design, strategy, quote, meeting, approval, files). False for personal mail, vendors, suppliers, software support, cold outreach templates, and invoices or payment emails.' },
      waiting: { type: 'boolean', description: 'True if Omar is now waiting on the recipient (to review, approve, decide, send something, book or attend a meeting).' },
      waiting_text: { type: 'string', description: 'Who and what, e.g. "Feizal to review the strategy and proposal" or "Wendy to approve the new website". Under 12 words.' },
      business_name: { type: 'string', description: "The recipient's business name, if clear from the email" },
      contact_name: { type: 'string', description: "The recipient's first name, if clear" },
      check_back_days: { type: 'number', description: 'How many days until Omar should check in if there is no reply (2 to 7)' },
    },
    required: ['is_client_work', 'waiting'],
  },
}
const SENT_PROMPT = `You read one email that Omar (Grow The Hype, a creative and digital agency in Edmonton) sent. Decide whether it is client work and whether he is now waiting on the other person.
Waiting examples: he sent a proposal, a website or design for approval, a strategy, a quote, a question that needs an answer, or asked to set up a meeting.
Not waiting: thank-you notes, confirmations, "sounds good", personal mail, emails to vendors or software companies, invoices and payment reminders (those are tracked elsewhere).
Never invent names or details that are not in the email. Plain Canadian English.`

const gmailLink = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${threadId}`
const addDaysIso = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); if (d.getDay() === 6) d.setDate(d.getDate() + 2); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

/** Every hour: client emails become tasks, Omar's sent emails become "waiting on" items, and replies close them. */
export async function runInboxTasks(opts: { days?: number } = {}) {
  const sb = getAdminClient()
  const days = Math.min(30, Math.max(1, Number(opts.days) || 2))
  const { data: integ } = await sb.from('integrations').select('user_id').eq('provider', 'gmail')
  const users = [...new Set((integ || []).map(r => r.user_id))]
  const summary: any[] = []
  for (const userId of users) {
    const loadClients = async () => {
      const [{ data: clients }, { data: contacts }] = await Promise.all([
        sb.from('clients').select('id, name, email, website, status').eq('user_id', userId).neq('status', 'archived'),
        sb.from('contacts').select('client_id, email').eq('user_id', userId).not('email', 'is', null),
      ])
      const byEmail = new Map<string, string>(); const byDomain = new Map<string, string>()
      for (const c of clients || []) {
        if (c.email) byEmail.set(c.email.toLowerCase(), c.id)
        const d = domainOf(c.email); if (d && !FREE_MAIL.test(d)) byDomain.set(d, c.id)
        const w = siteDomain(c.website); if (w && !FREE_MAIL.test(w)) byDomain.set(w, c.id)
      }
      for (const ct of contacts || []) {
        if (ct.email) byEmail.set(ct.email.toLowerCase(), ct.client_id)
        const d = domainOf(ct.email); if (d && !FREE_MAIL.test(d)) byDomain.set(d, ct.client_id)
      }
      return { byEmail, byDomain, name: new Map((clients || []).map(c => [c.id, c.name])) }
    }
    let idx = await loadClients()
    const match = (addr: string) => idx.byEmail.get(addr) || idx.byDomain.get(domainOf(addr))
    const addrs = (h: string) => (h.match(/[^\s<>,;"]+@[^\s<>,;"]+\.[a-z]{2,}/gi) || []).map(a => a.toLowerCase())
    // Cold outreach threads are tracked by the lead tracker, not here
    const { data: outreach } = await sb.from('outreach_steps').select('gmail_thread_id').eq('user_id', userId).not('gmail_thread_id', 'is', null)
    const outreachThreads = new Set((outreach || []).map(r => r.gmail_thread_id))
    const stats = { inbound: 0, outbound: 0, created: 0, waiting: 0, closed: 0, prospects: 0 }

    const claim = async (id: string) => { const { error } = await sb.from('email_task_log').insert({ message_id: id, user_id: userId, outcome: 'checking' }); return !error }
    const settle = (id: string, outcome: string, taskId?: string | null) => sb.from('email_task_log').update({ outcome, task_id: taskId || null }).eq('message_id', id)
    const release = (id: string) => sb.from('email_task_log').delete().eq('message_id', id)
    const openWaiting = async (threadId: string) => {
      const { data } = await sb.from('tasks').select('id, text, client_id').eq('user_id', userId).eq('done', false).ilike('tags', '%waiting%').ilike('description', `%${threadId}%`)
      return data || []
    }

    // ── Inbound: replies close "waiting" items; client requests become tasks ──
    let inbox: { id: string; threadId: string }[] = []
    try { inbox = await listNewMessages(userId, `in:inbox newer_than:${days}d -from:me -category:promotions -category:social`, days > 2 ? 150 : 60) } catch (e: any) { summary.push({ userId, error: String(e?.message || e).slice(0, 200) }); continue }
    for (const m of inbox) {
      if (!(await claim(m.id))) continue
      try {
        stats.inbound++
        const msg = await getMessageContent(userId, m.id)
        const from = (msg.from.match(/<([^>]+)>/)?.[1] || msg.from).trim().toLowerCase()
        // They answered: whatever Omar was waiting on in this thread is no longer waiting
        for (const w of await openWaiting(m.threadId)) {
          await sb.from('tasks').update({ done: true, completed_at: new Date().toISOString() }).eq('id', w.id)
          await sb.from('activity_log').insert({ user_id: userId, type: 'task', entity: 'client', entity_id: w.client_id, description: `${msg.from.replace(/<.*>/, '').trim()} replied: ${w.text.replace(/^Waiting on /, '')}`, timestamp: new Date().toISOString() })
          stats.closed++
        }
        const clientId = match(from)
        if (!clientId) { await settle(m.id, 'not a client'); continue }
        const body = (msg.bodyText || msg.snippet || '').replace(/\n>.*$/gs, '').slice(0, 4000)
        const r = await askClaude({ systemPrompt: PROMPT, tier: 'fast', maxTokens: 600, tools: [TOOL], messages: [{ role: 'user', content: `Client: ${idx.name.get(clientId)}\nFrom: ${msg.from}\nDate: ${msg.date}\nSubject: ${msg.subject}\n\n${body}` }] })
        const ids: string[] = []
        for (const t of (extractToolUse(r)?.input?.tasks || []).slice(0, 5)) {
          const text = String(t?.text || '').trim(); if (!text) continue
          const res: any = await callTool(userId, 'add_task', {
            text, client: clientId, priority: t.priority || 'medium',
            due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.due_date || '')) ? t.due_date : undefined,
            description: `${t.detail ? String(t.detail).slice(0, 600) + '\n\n' : ''}From ${msg.from}: "${msg.subject}" (${msg.date})\n${gmailLink(m.threadId)}`,
          })
          if (res?.task?.id) { ids.push(res.task.id); if (res.created) { stats.created++; await sb.from('tasks').update({ tags: 'from-email' }).eq('id', res.task.id) } }
        }
        await settle(m.id, ids.length ? `tasks: ${ids.length}` : 'nothing asked', ids[0])
      } catch (e: any) { await release(m.id); summary.push({ message: m.id, error: String(e?.message || e).slice(0, 200) }) }
    }

    // ── Outbound: what Omar sent and is now waiting on ──
    let sent: { id: string; threadId: string }[] = []
    try { sent = await listNewMessages(userId, `in:sent newer_than:${days}d`, days > 2 ? 150 : 60) } catch { sent = [] }
    for (const m of sent) {
      if (outreachThreads.has(m.threadId)) continue
      if (!(await claim(m.id))) continue
      try {
        stats.outbound++
        const msg = await getMessageContent(userId, m.id)
        const to = addrs(`${msg.to}`).filter(a => !/growthehype\.(ca|com)$/.test(a))
        if (!to.length) { await settle(m.id, 'internal'); continue }
        let clientId = to.map(match).find(Boolean) || null
        const body = (msg.bodyText || msg.snippet || '').replace(/\n>.*$/gs, '').replace(/\n--\s*\n[\s\S]*$/, '').slice(0, 3500)
        const r = await askClaude({ systemPrompt: SENT_PROMPT, tier: 'fast', maxTokens: 400, tools: [SENT_TOOL], messages: [{ role: 'user', content: `${clientId ? `Known client: ${idx.name.get(clientId)}\n` : ''}To: ${msg.to}\nDate: ${msg.date}\nSubject: ${msg.subject}\n\n${body}` }] })
        const h = extractToolUse(r)?.input || {}
        if (!h.is_client_work || !h.waiting || !String(h.waiting_text || '').trim()) { await settle(m.id, h.is_client_work ? 'sent, not waiting' : 'not client work'); continue }
        // A new business we are pitching or working with becomes a prospect
        if (!clientId) {
          const bname = String(h.business_name || '').trim()
          if (!bname) { await settle(m.id, 'waiting, unknown business'); continue }
          const res: any = await callTool(userId, 'add_client', { name: bname, email: to[0], contact: String(h.contact_name || '').trim() || undefined, status: 'prospect' })
          clientId = res?.client?.id || null
          if (res?.created) stats.prospects++
          idx = await loadClients()
        }
        const due = addDaysIso(new Date(msg.date || Date.now()).toISOString(), Math.min(7, Math.max(2, Number(h.check_back_days) || 3)))
        const existing = await openWaiting(m.threadId)
        if (existing.length) { await sb.from('tasks').update({ due_date: due }).eq('id', existing[0].id); await settle(m.id, 'waiting (updated)', existing[0].id); continue }
        const res: any = await callTool(userId, 'add_task', {
          text: `Waiting on ${String(h.waiting_text).trim().replace(/^waiting on /i, '')}`.slice(0, 200), client: clientId, priority: 'medium', due_date: due,
          description: `You sent "${msg.subject}" (${msg.date}). Check in on this date if they haven't replied. It closes on its own when they reply.\n${gmailLink(m.threadId)}`,
        })
        if (res?.task?.id) { await sb.from('tasks').update({ tags: 'waiting' }).eq('id', res.task.id); stats.waiting++ }
        await settle(m.id, 'waiting', res?.task?.id)
      } catch (e: any) { await release(m.id); summary.push({ message: m.id, error: String(e?.message || e).slice(0, 200) }) }
    }
    summary.push({ userId, ...stats })
  }
  return { ok: true, summary }
}
