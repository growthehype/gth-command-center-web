// Turns client emails into CRM tasks. Every hour the job reads new inbox mail,
// keeps only emails from clients (matched by address or company domain), and
// asks Claude whether the email asks Omar to do something. Each request
// becomes a task linked to the client and the email. Nothing is replied to.
import { getAdminClient } from './supabase-admin'
import { listNewMessages, getMessageContent, getThreadMeta } from './gmail-server'
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

// ── Thread-based sync ──────────────────────────────────────────
// Each email conversation with a client or prospect is read as a whole, so the
// CRM always reflects where it stands now: what Omar still has to do, and what
// he is waiting on them for. When they reply, the waiting item closes; when Omar
// does the work, the next read drops it.

const THREAD_TOOL = {
  name: 'thread_state',
  description: 'Where this email conversation stands for Omar right now.',
  input_schema: {
    type: 'object',
    properties: {
      is_client_work: { type: 'boolean', description: 'True only for Grow The Hype business with a client or prospective client (websites, design, ads, proposals, quotes, meetings, approvals, content). False for personal mail, vendors, suppliers, software support, newsletters, receipts, and invoices or payment emails.' },
      business_name: { type: 'string', description: "The other party's business name if clear" },
      contact_name: { type: 'string', description: "The other party's first name if clear" },
      keep_ids: { type: 'array', items: { type: 'string' }, description: 'Ids of the existing open items (given below) that are still not done' },
      new_todos: {
        type: 'array',
        description: 'Things Omar still has to do that are not already in the existing items. Only real requests or commitments still open at the end of the thread.',
        items: { type: 'object', properties: {
          text: { type: 'string', description: 'Verb first, 10 words or fewer' },
          detail: { type: 'string' },
          due_date: { type: 'string', description: 'YYYY-MM-DD only if stated or clearly implied' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        }, required: ['text'] },
      },
      waiting_on: { type: 'string', description: 'If the last word is Omar\'s and he is waiting on them (to review, approve, decide, send, book or attend), who and what in under 12 words, e.g. "Wendy to approve the new website". Empty if the ball is in Omar\'s court or nothing is pending.' },
      check_back_days: { type: 'number', description: 'Days after Omar\'s last message to check in if they stay quiet (2 to 7)' },
    },
    required: ['is_client_work'],
  },
}
const THREAD_PROMPT = `You read an email conversation between Omar (Grow The Hype, a creative and digital agency in Edmonton) and someone else, oldest to newest, and report where it stands right now.
- Things Omar has clearly already done later in the thread are not open.
- If the other person spoke last and asked for something, that is Omar's to do, not waiting.
- If Omar spoke last and handed something over or asked something, he is waiting on them.
- Invoices and payments are tracked elsewhere: do not create items for them.
- Never invent names, dates or details. Plain Canadian English.`

const gmailLink = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${threadId}`
const addDaysIso = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); if (d.getDay() === 6) d.setDate(d.getDate() + 2); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
const isMe = (from: string) => /growthehype\.(ca|com)/i.test(from)

export async function runInboxTasks(opts: { days?: number } = {}) {
  const sb = getAdminClient()
  const deadline = Date.now() + 250_000 // the rest is picked up on the next run
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
      return { byEmail, byDomain, name: new Map((clients || []).map(c => [c.id, c.name])), list: clients || [] }
    }
    let idx = await loadClients()
    const match = (addr: string) => idx.byEmail.get(addr) || idx.byDomain.get(domainOf(addr))
    const addrs = (h: string) => (h.match(/[^\s<>,;"]+@[^\s<>,;"]+\.[a-z]{2,}/gi) || []).map(a => a.toLowerCase())
    const { data: outreach } = await sb.from('outreach_steps').select('gmail_thread_id').eq('user_id', userId).not('gmail_thread_id', 'is', null)
    const outreachThreads = new Set((outreach || []).map(r => r.gmail_thread_id))
    const stats = { threads: 0, todos: 0, waiting: 0, closed: 0, prospects: 0 }

    let msgs: { id: string; threadId: string }[] = []
    try { msgs = await listNewMessages(userId, `newer_than:${days}d -category:promotions -category:social -category:updates -in:spam -in:trash`, days > 2 ? 250 : 80) } catch (e: any) { summary.push({ userId, error: String(e?.message || e).slice(0, 200) }); continue }
    const threads = [...new Set(msgs.map(m => m.threadId))].filter(t => !outreachThreads.has(t))

    for (const threadId of threads) {
      if (Date.now() > deadline) { summary.push({ note: 'time limit, continuing next run' }); break }
      try {
        const meta = await getThreadMeta(userId, threadId)
        if (!meta?.length) continue
        const last = meta[meta.length - 1]
        // Only re-read a conversation when something new happened in it
        const key = `thread:${threadId}`
        const { data: state } = await sb.from('email_task_log').select('outcome').eq('message_id', key).maybeSingle()
        if (state?.outcome === `seen:${last.id}`) continue
        const others = [...new Set(meta.flatMap(m => addrs(`${m.from},${m.to},${m.cc}`)))].filter(a => !/growthehype\.(ca|com)$/.test(a))
        if (!others.length || !meta.some(m => isMe(m.from))) {
          // Not a conversation Omar is part of (newsletters, notifications)
          if (!others.length || !others.some(match)) { await sb.from('email_task_log').upsert({ message_id: key, user_id: userId, outcome: `seen:${last.id}` }); continue }
        }
        let clientId = others.map(match).find(Boolean) || null
        stats.threads++
        // Read the last few messages in full
        const recent = meta.slice(-5)
        const bodies: string[] = []
        for (const m of recent) {
          const c = await getMessageContent(userId, m.id)
          const body = (c.bodyText || c.snippet || '').replace(/\nOn .{10,120}wrote:[\s\S]*$/, '').replace(/\n>.*$/gs, '').slice(0, 1800)
          bodies.push(`--- ${isMe(c.from) ? 'OMAR' : c.from} · ${c.date}\nSubject: ${c.subject}\n${body}`)
        }
        const { data: existing } = await sb.from('tasks').select('id, text, tags').eq('user_id', userId).eq('done', false).ilike('description', `%${threadId}%`)
        const todos = (existing || []).filter(t => !(t.tags || '').includes('waiting'))
        const waits = (existing || []).filter(t => (t.tags || '').includes('waiting'))
        const r = await askClaude({
          systemPrompt: THREAD_PROMPT, tier: 'fast', maxTokens: 900, tools: [THREAD_TOOL],
          messages: [{ role: 'user', content: `${clientId ? `Client in the CRM: ${idx.name.get(clientId)}\n` : ''}Existing open items for Omar from this thread:\n${todos.map(t => `- [${t.id}] ${t.text}`).join('\n') || '(none)'}\n\nConversation (oldest first):\n${bodies.join('\n\n')}` }],
        })
        const st = extractToolUse(r)?.input || {}
        if (!st.is_client_work) {
          await sb.from('email_task_log').upsert({ message_id: key, user_id: userId, outcome: `seen:${last.id}` })
          continue
        }
        if (!clientId) {
          const bname = String(st.business_name || '').trim()
          if (!bname) { await sb.from('email_task_log').upsert({ message_id: key, user_id: userId, outcome: `seen:${last.id}` }); continue }
          const res: any = await callTool(userId, 'add_client', { name: bname, email: others[0], contact: String(st.contact_name || '').trim() || undefined, status: 'prospect' })
          clientId = res?.client?.id || null
          if (res?.created) stats.prospects++
          idx = await loadClients()
        }
        const now = new Date().toISOString()
        const link = gmailLink(threadId)
        // Close items the thread shows are done
        const keep = new Set((st.keep_ids || []).map(String))
        for (const t of todos) if (!keep.has(t.id)) { await sb.from('tasks').update({ done: true, completed_at: now }).eq('id', t.id); stats.closed++ }
        // Add what is newly open
        for (const t of (st.new_todos || []).slice(0, 5)) {
          const text = String(t?.text || '').trim(); if (!text) continue
          const res: any = await callTool(userId, 'add_task', {
            text, client: clientId, priority: t.priority || 'medium',
            due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.due_date || '')) ? t.due_date : undefined,
            description: `${t.detail ? String(t.detail).slice(0, 600) + '\n\n' : ''}From the email "${last.subject}"\n${link}`,
          })
          if (res?.created && res.task?.id) { await sb.from('tasks').update({ tags: 'from-email' }).eq('id', res.task.id); stats.todos++ }
        }
        // Waiting on them, or not any more
        const wt = String(st.waiting_on || '').trim().replace(/^waiting on /i, '')
        if (wt && isMe(last.from)) {
          const text = `Waiting on ${wt}`.slice(0, 200)
          const due = addDaysIso(last.internalDate, Math.min(7, Math.max(2, Number(st.check_back_days) || 3)))
          if (waits.length) { await sb.from('tasks').update({ text, due_date: due }).eq('id', waits[0].id); for (const w of waits.slice(1)) await sb.from('tasks').update({ done: true, completed_at: now }).eq('id', w.id) }
          else {
            const res: any = await callTool(userId, 'add_task', { text, client: clientId, priority: 'medium', due_date: due, waiting: true, description: `You sent "${last.subject}". Check in on the due date if they haven't replied. Closes on its own when they reply.\n${link}` })
            if (res?.task?.id) stats.waiting++
          }
        } else {
          for (const w of waits) {
            await sb.from('tasks').update({ done: true, completed_at: now }).eq('id', w.id)
            if (!isMe(last.from)) await sb.from('activity_log').insert({ user_id: userId, type: 'task', entity: 'client', entity_id: clientId, description: `${last.from.replace(/<.*>/, '').trim() || 'They'} replied: ${w.text.replace(/^Waiting on /, '')}`, timestamp: now })
            stats.closed++
          }
        }
        await sb.from('email_task_log').upsert({ message_id: key, user_id: userId, outcome: `seen:${last.id}` })
      } catch (e: any) { summary.push({ thread: threadId, error: String(e?.message || e).slice(0, 200) }) }
    }
    summary.push({ userId, ...stats })
  }
  return { ok: true, summary }
}
