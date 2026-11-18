// The Command Center tools that Claude can use through the connector.
// Every query is scoped to the signed-in user. Nothing here sends email,
// deletes records or marks invoices paid: those stay with Omar in the CRM.
import { getAdminClient } from './supabase-admin'
import { listEvents, createEvent, moveOrRenameEvent } from './calendar-server'

const TZ = 'America/Edmonton'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const addDays = (d: string, n: number) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const money = (n: number) => '$' + Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export class ToolError extends Error {}

const str = (v: any, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const date = (v: any, field: string) => {
  if (v === undefined || v === null || v === '') return undefined
  if (!DATE_RE.test(String(v))) throw new ToolError(`${field} must be YYYY-MM-DD`)
  return String(v)
}

// ── shared lookups ──
async function resolveClient(userId: string, ref: any, required = true) {
  const sb = getAdminClient()
  const q = str(ref, 200)
  if (!q) { if (required) throw new ToolError('Say which client (name or id).'); return null }
  if (/^[0-9a-f-]{36}$/i.test(q)) {
    const { data } = await sb.from('clients').select('*').eq('user_id', userId).eq('id', q).maybeSingle()
    if (data) return data
  }
  const { data } = await sb.from('clients').select('*').eq('user_id', userId).ilike('name', `%${q.replace(/[%_]/g, '')}%`).limit(6)
  const rows = data || []
  if (rows.length === 1) return rows[0]
  const exact = rows.find(r => r.name.toLowerCase() === q.toLowerCase())
  if (exact) return exact
  if (!rows.length) {
    // Try each word (e.g. "Jeff's carpet" -> "Jeff's Reliable Carpet Care")
    const words = q.split(/\s+/).filter(w => w.length > 2)
    for (const w of words) {
      const { data: d2 } = await sb.from('clients').select('*').eq('user_id', userId).ilike('name', `%${w.replace(/[%_]/g, '')}%`).limit(6)
      if (d2?.length === 1) return d2[0]
    }
    throw new ToolError(`No client matches "${q}". Use add_client to create one, or find_client to search.`)
  }
  throw new ToolError(`"${q}" matches several clients: ${rows.map(r => `${r.name} (${r.id})`).join('; ')}. Use the exact name or id.`)
}

async function logActivity(userId: string, type: string, description: string, entity?: string, entityId?: string | null) {
  await getAdminClient().from('activity_log').insert({ user_id: userId, type, entity: entity || null, entity_id: entityId || null, description: description.slice(0, 500), timestamp: new Date().toISOString() }).then(() => {}, () => {})
}
async function touchClient(clientId?: string | null) {
  if (clientId) await getAdminClient().from('clients').update({ last_activity: today(), updated_at: new Date().toISOString() }).eq('id', clientId).then(() => {}, () => {})
}
const clientNames = async (userId: string) => {
  const { data } = await getAdminClient().from('clients').select('id, name').eq('user_id', userId)
  return new Map((data || []).map(c => [c.id, c.name]))
}

// ── tool definitions (MCP schema) ──
export const TOOLS = [
  {
    name: 'get_overview',
    description: "Omar's day at a glance: overdue and upcoming tasks, active projects, invoices waiting or unpaid, hosting invoices coming up, and recent activity. Call this first when asked what's going on or what needs doing.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_calendar',
    description: "Omar's Google Calendar events between two dates (Edmonton time). Use for meetings, appointments and what's on today, tomorrow or this week.",
    inputSchema: { type: 'object', properties: { start_date: { type: 'string', description: 'YYYY-MM-DD' }, end_date: { type: 'string', description: 'YYYY-MM-DD (same as start for one day)' } }, required: ['start_date'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_calendar_event',
    description: "Put an event in Omar's Google Calendar (Edmonton time). No guests are added and no invitations are sent. Use 24-hour times. Default length is 60 minutes.",
    inputSchema: { type: 'object', properties: {
      title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' },
      start_time: { type: 'string', description: 'HH:MM 24-hour; leave out for an all-day event' },
      end_time: { type: 'string', description: 'HH:MM 24-hour (optional)' },
      duration_minutes: { type: 'number', description: 'Used when end_time is not given (default 60)' },
      location: { type: 'string' }, notes: { type: 'string' },
    }, required: ['title', 'date'] },
  },
  {
    name: 'update_calendar_event',
    description: 'Rename or move an existing calendar event. Get the event_id from list_calendar first.',
    inputSchema: { type: 'object', properties: { event_id: { type: 'string' }, title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, start_time: { type: 'string', description: 'HH:MM 24-hour' }, duration_minutes: { type: 'number' } }, required: ['event_id'] },
  },
  {
    name: 'find_client',
    description: 'Look up a client by name (partial is fine). Returns their details, contacts, open tasks, projects, recent invoices and recent activity.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Client name or part of it' } }, required: ['query'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_tasks',
    description: 'List tasks. Defaults to open tasks, soonest due first.',
    inputSchema: { type: 'object', properties: {
      status: { type: 'string', enum: ['open', 'done', 'all'] },
      client: { type: 'string', description: 'Client name or id to filter by' },
      due_before: { type: 'string', description: 'YYYY-MM-DD' },
      limit: { type: 'number' },
    } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_task',
    description: 'Add a task to the CRM. Use a short action ("Send Banwest the homepage for review"). If the same open task already exists for that client, the existing one is returned instead of a duplicate.',
    inputSchema: { type: 'object', properties: {
      text: { type: 'string' },
      client: { type: 'string', description: 'Client name or id (optional)' },
      due_date: { type: 'string', description: 'YYYY-MM-DD (optional)' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      description: { type: 'string', description: 'Extra detail (optional)' },
      waiting: { type: 'boolean', description: 'True when this is something Omar is waiting on someone else for (e.g. "Waiting on Wendy to approve the new website"). Shows in the Waiting on list.' },
    }, required: ['text'] },
  },
  {
    name: 'update_task',
    description: 'Update a task: mark it done (or not done), rename it, change its due date, priority or detail. Get task ids from list_tasks, find_client or get_overview.',
    inputSchema: { type: 'object', properties: {
      task_id: { type: 'string' },
      done: { type: 'boolean' },
      text: { type: 'string' },
      due_date: { type: 'string', description: 'YYYY-MM-DD, or "none" to clear' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      description: { type: 'string' },
    }, required: ['task_id'] },
  },
  {
    name: 'list_projects',
    description: 'List projects (status is backlog, progress, review or done). Defaults to projects that are not done.',
    inputSchema: { type: 'object', properties: { client: { type: 'string' }, include_done: { type: 'boolean' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'save_project',
    description: 'Create a project or update one. Give project_id to update; otherwise give client and title (an existing project with that title for the client is updated instead of duplicated). Status: backlog, progress, review or done.',
    inputSchema: { type: 'object', properties: {
      project_id: { type: 'string' },
      client: { type: 'string' },
      title: { type: 'string' },
      status: { type: 'string', enum: ['backlog', 'progress', 'review', 'done'] },
      description: { type: 'string' },
      due_date: { type: 'string', description: 'YYYY-MM-DD' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
    } },
  },
  {
    name: 'log_update',
    description: "Record what happened on a client's work (e.g. \"Homepage v2 built and sent for review\"). Shows in the client's activity and marks them as recently active. Use after finishing work for a client.",
    inputSchema: { type: 'object', properties: { client: { type: 'string' }, note: { type: 'string' } }, required: ['client', 'note'] },
  },
  {
    name: 'update_client',
    description: "Update a client's details. Only the fields you pass change; nothing is cleared. Status: active, prospect, paused or done.",
    inputSchema: { type: 'object', properties: {
      client: { type: 'string' },
      status: { type: 'string', enum: ['active', 'prospect', 'paused', 'done'] },
      service: { type: 'string' }, contact: { type: 'string' }, email: { type: 'string' },
      phone: { type: 'string' }, website: { type: 'string' }, mrr: { type: 'number' },
    }, required: ['client'] },
  },
  {
    name: 'add_client',
    description: 'Add a new client. If a client with the same name exists, it is returned instead.',
    inputSchema: { type: 'object', properties: {
      name: { type: 'string' }, contact: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
      website: { type: 'string' }, service: { type: 'string' }, status: { type: 'string', enum: ['active', 'prospect'] },
    }, required: ['name'] },
  },
  {
    name: 'log_work',
    description: "Record time spent on client work so Omar can see hours and profit per client. Call it whenever work for a client is finished in a conversation (one entry per piece of work). kind 'claude' = work done with Claude: give claude_minutes (your best estimate of the working time, judged from the size of what was produced and the back and forth; an estimate is expected since it can't be timed exactly, so never skip logging for that reason; if the work also spanned earlier chats you can't see, log what this conversation covered and Omar can add the rest) and human_hours (how long a skilled agency team would need to do the same work by hand, without AI). kind 'omar' = Omar's own time he tells you about (calls, meetings, site visits, shoots): give minutes.",
    inputSchema: { type: 'object', properties: {
      client: { type: 'string' },
      project: { type: 'string', description: 'Project title (optional)' },
      kind: { type: 'string', enum: ['claude', 'omar'] },
      description: { type: 'string', description: 'What was done, e.g. "Homepage v2 design and build"' },
      work_type: { type: 'string', enum: ['design', 'development', 'copywriting', 'strategy', 'ads', 'email', 'admin', 'meeting', 'video', 'other'] },
      claude_minutes: { type: 'number' },
      human_hours: { type: 'number' },
      minutes: { type: 'number', description: "For kind 'omar': his time in minutes" },
      date: { type: 'string', description: 'YYYY-MM-DD (default today)' },
      billable: { type: 'boolean', description: 'Default true' },
    }, required: ['client', 'kind', 'description'] },
  },
  {
    name: 'list_time',
    description: 'Recent time entries (newest first) with their ids, so one can be corrected with update_time. Filter by client.',
    inputSchema: { type: 'object', properties: { client: { type: 'string' }, limit: { type: 'number', description: 'Default 15, max 50' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_time',
    description: "Correct or remove a time entry. Use list_time first to get the id. Set only what changes: claude_minutes or minutes (the time actually spent), human_hours, description, date, client, billable. delete=true removes it.",
    inputSchema: { type: 'object', properties: {
      id: { type: 'string' }, claude_minutes: { type: 'number' }, minutes: { type: 'number' }, human_hours: { type: 'number' },
      description: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, client: { type: 'string' }, billable: { type: 'boolean' }, delete: { type: 'boolean' },
    }, required: ['id'] },
    annotations: { destructiveHint: true },
  },
  {
    name: 'time_summary',
    description: 'Hours and money per client for a date range: revenue paid, Omar\'s hours, Claude hours, human-equivalent hours and effective hourly rate.',
    inputSchema: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' }, client: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_invoices',
    description: 'List invoices with their status (draft, sent, paid, overdue).',
    inputSchema: { type: 'object', properties: { client: { type: 'string' }, status: { type: 'string', enum: ['draft', 'sent', 'paid', 'overdue', 'unpaid', 'all'] }, limit: { type: 'number' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_invoice_draft',
    description: "Create a DRAFT invoice in the CRM, numbered in the client's own series. It is never sent: Omar reviews and sends it from the Invoices page. Rates are before GST.",
    inputSchema: { type: 'object', properties: {
      client: { type: 'string' },
      line_items: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, qty: { type: 'number' }, rate: { type: 'number' } }, required: ['description', 'qty', 'rate'] } },
      tax_rate: { type: 'number', description: 'GST percent, default 5' },
      payment_terms: { type: 'string', description: 'e.g. "Due on Receipt" or "Net 15" (default Due on Receipt)' },
      due_date: { type: 'string', description: 'YYYY-MM-DD (default today)' },
      memo: { type: 'string' },
    }, required: ['client', 'line_items'] },
  },
]

// ── implementations ──
type Args = Record<string, any>

async function getOverview(userId: string) {
  const sb = getAdminClient()
  const t = today()
  const names = await clientNames(userId)
  const [{ data: tasks }, { data: projects }, { data: invoices }, { data: plans }, { data: acts }] = await Promise.all([
    sb.from('tasks').select('id, text, due_date, priority, client_id, tags').eq('user_id', userId).eq('done', false).order('due_date', { ascending: true, nullsFirst: false }).limit(60),
    sb.from('projects').select('id, title, status, due_date, client_id').eq('user_id', userId).neq('status', 'done').limit(40),
    sb.from('invoices').select('id, num, amount, status, due_date, client_id').eq('user_id', userId).in('status', ['draft', 'sent', 'overdue']).order('due_date').limit(40),
    sb.from('hosting_plans').select('client_id, cadence, amount, next_date, notice_days, verified, status').eq('user_id', userId).eq('status', 'active'),
    sb.from('activity_log').select('description, timestamp').eq('user_id', userId).order('timestamp', { ascending: false }).limit(10),
  ])
  const task = (x: any) => ({ id: x.id, text: x.text, due: x.due_date || null, priority: x.priority || null, client: names.get(x.client_id) || null })
  const open = (tasks || []).filter(x => !(x.tags || '').includes('waiting'))
  const waiting = (tasks || []).filter(x => (x.tags || '').includes('waiting'))
  const soon = addDays(t, 7)
  const sendOn = (p: any) => p.cadence === 'yearly' ? addDays(p.next_date, -p.notice_days) : p.next_date
  return {
    today: t,
    waiting_on_others: waiting.map(task),
    overdue_tasks: open.filter(x => x.due_date && x.due_date < t).map(task),
    due_today: open.filter(x => x.due_date === t).map(task),
    due_this_week: open.filter(x => x.due_date && x.due_date > t && x.due_date <= soon).map(task),
    no_due_date: open.filter(x => !x.due_date).slice(0, 15).map(task),
    active_projects: (projects || []).map(p => ({ id: p.id, title: p.title, status: p.status, due: p.due_date || null, client: names.get(p.client_id) || null })),
    invoices_draft: (invoices || []).filter(i => i.status === 'draft').map(i => ({ num: i.num, total: money(i.amount), client: names.get(i.client_id) || null })),
    invoices_unpaid: (invoices || []).filter(i => i.status !== 'draft').map(i => ({ num: i.num, total: money(i.amount), due: i.due_date, client: names.get(i.client_id) || null, overdue: !!i.due_date && i.due_date < t })),
    hosting_next_14_days: (plans || []).filter(p => sendOn(p) <= addDays(t, 14)).map(p => ({ client: names.get(p.client_id), cadence: p.cadence, sends: sendOn(p), amount_before_gst: money(p.amount), needs_first_approval: !p.verified })),
    recent_activity: (acts || []).map(a => `${a.timestamp.slice(0, 10)}: ${a.description}`),
  }
}

async function findClient(userId: string, a: Args) {
  const sb = getAdminClient()
  const c = await resolveClient(userId, a.query)
  const [{ data: contacts }, { data: tasks }, { data: projects }, { data: invoices }, { data: acts }, { data: plan }] = await Promise.all([
    sb.from('contacts').select('name, role, email, phone, is_primary').eq('client_id', c.id).limit(20),
    sb.from('tasks').select('id, text, due_date, priority, done').eq('client_id', c.id).eq('done', false).order('due_date', { nullsFirst: false }),
    sb.from('projects').select('id, title, status, due_date, description').eq('client_id', c.id).order('updated_at', { ascending: false }).limit(10),
    sb.from('invoices').select('num, amount, status, sent_date, due_date').eq('client_id', c.id).order('created_at', { ascending: false }).limit(6),
    sb.from('activity_log').select('description, timestamp').eq('user_id', userId).eq('entity_id', c.id).order('timestamp', { ascending: false }).limit(10),
    sb.from('hosting_plans').select('cadence, amount, next_date, status').eq('client_id', c.id).maybeSingle(),
  ])
  return {
    client: { id: c.id, name: c.name, status: c.status, service: c.service, contact: c.contact, email: c.email, phone: c.phone, website: c.website, mrr: c.mrr, last_activity: c.last_activity, notes: c.notes },
    contacts: contacts || [],
    open_tasks: (tasks || []).map(x => ({ id: x.id, text: x.text, due: x.due_date, priority: x.priority })),
    projects: projects || [],
    recent_invoices: (invoices || []).map(i => ({ ...i, amount: money(i.amount) })),
    hosting: plan ? { ...plan, amount: money(plan.amount) } : null,
    recent_activity: (acts || []).map(x => `${x.timestamp.slice(0, 10)}: ${x.description}`),
  }
}

async function listTasks(userId: string, a: Args) {
  const sb = getAdminClient()
  const names = await clientNames(userId)
  let q = sb.from('tasks').select('id, text, description, due_date, priority, done, client_id, completed_at').eq('user_id', userId)
  const status = a.status || 'open'
  if (status === 'open') q = q.eq('done', false)
  if (status === 'done') q = q.eq('done', true)
  if (a.client) q = q.eq('client_id', (await resolveClient(userId, a.client)).id)
  const before = date(a.due_before, 'due_before')
  if (before) q = q.lte('due_date', before)
  const { data } = await q.order(status === 'done' ? 'completed_at' : 'due_date', { ascending: status !== 'done', nullsFirst: false }).limit(Math.min(Number(a.limit) || 50, 200))
  return (data || []).map(x => ({ id: x.id, text: x.text, detail: x.description || undefined, due: x.due_date || null, priority: x.priority || null, done: !!x.done, client: names.get(x.client_id) || null }))
}

async function addTask(userId: string, a: Args) {
  const sb = getAdminClient()
  const text = str(a.text, 300)
  if (!text) throw new ToolError('Task text is required.')
  const client = a.client ? await resolveClient(userId, a.client) : null
  // No duplicates: same open task for the same client
  let dq = sb.from('tasks').select('id, text, due_date').eq('user_id', userId).eq('done', false).ilike('text', text.replace(/[%_]/g, ''))
  dq = client ? dq.eq('client_id', client.id) : dq.is('client_id', null)
  const { data: dup } = await dq.limit(1)
  if (dup?.length) return { already_exists: true, task: dup[0] }
  const row: any = { user_id: userId, text, description: str(a.description) || null, priority: a.priority || 'medium', done: false, client_id: client?.id || null, due_date: date(a.due_date, 'due_date') || null, created_at: new Date().toISOString() }
  if (a.waiting) row.tags = 'waiting'
  const { data, error } = await sb.from('tasks').insert(row).select('id, text, due_date, priority').single()
  if (error) throw new ToolError(error.message)
  await logActivity(userId, 'task', `Task added${client ? ` for ${client.name}` : ''}: ${text}`, 'task', data.id)
  await touchClient(client?.id)
  return { created: true, task: { ...data, client: client?.name || null } }
}

async function updateTask(userId: string, a: Args) {
  const sb = getAdminClient()
  const { data: t } = await sb.from('tasks').select('*').eq('user_id', userId).eq('id', str(a.task_id, 60)).maybeSingle()
  if (!t) throw new ToolError('Task not found. Get the id from list_tasks.')
  const patch: any = {}
  if (typeof a.done === 'boolean') { patch.done = a.done; patch.completed_at = a.done ? new Date().toISOString() : null }
  if (str(a.text)) patch.text = str(a.text, 300)
  if (a.due_date === 'none') patch.due_date = null; else if (a.due_date) patch.due_date = date(a.due_date, 'due_date')
  if (a.priority) patch.priority = a.priority
  if (typeof a.description === 'string') patch.description = str(a.description) || null
  if (!Object.keys(patch).length) throw new ToolError('Nothing to change.')
  const { data, error } = await sb.from('tasks').update(patch).eq('id', t.id).select('id, text, done, due_date, priority').single()
  if (error) throw new ToolError(error.message)
  if (patch.done === true) await logActivity(userId, 'task', `Task done: ${t.text}`, 'task', t.id)
  await touchClient(t.client_id)
  return { updated: true, task: data }
}

async function listProjects(userId: string, a: Args) {
  const sb = getAdminClient()
  const names = await clientNames(userId)
  let q = sb.from('projects').select('id, title, status, priority, due_date, description, client_id, updated_at').eq('user_id', userId)
  if (!a.include_done) q = q.neq('status', 'done')
  if (a.client) q = q.eq('client_id', (await resolveClient(userId, a.client)).id)
  const { data } = await q.order('updated_at', { ascending: false }).limit(60)
  return (data || []).map(p => ({ ...p, client: names.get(p.client_id) || null, client_id: undefined }))
}

async function saveProject(userId: string, a: Args) {
  const sb = getAdminClient()
  const now = new Date().toISOString()
  let existing: any = null
  let client: any = null
  if (a.project_id) {
    const { data } = await sb.from('projects').select('*').eq('user_id', userId).eq('id', str(a.project_id, 60)).maybeSingle()
    if (!data) throw new ToolError('Project not found.')
    existing = data
  } else {
    const title = str(a.title, 200)
    if (!title) throw new ToolError('Give project_id, or client and title.')
    client = a.client ? await resolveClient(userId, a.client) : null
    let q = sb.from('projects').select('*').eq('user_id', userId).ilike('title', title.replace(/[%_]/g, ''))
    q = client ? q.eq('client_id', client.id) : q.is('client_id', null)
    const { data } = await q.limit(1)
    existing = data?.[0] || null
  }
  const patch: any = { updated_at: now }
  if (a.status) patch.status = a.status
  if (typeof a.description === 'string' && a.description.trim()) patch.description = str(a.description, 4000)
  if (a.due_date) patch.due_date = date(a.due_date, 'due_date')
  if (a.priority) patch.priority = a.priority
  if (existing) {
    if (a.title && a.project_id) patch.title = str(a.title, 200)
    const { data, error } = await sb.from('projects').update(patch).eq('id', existing.id).select('id, title, status, due_date').single()
    if (error) throw new ToolError(error.message)
    if (a.status && a.status !== existing.status) await logActivity(userId, 'project', `${existing.title}: ${existing.status} → ${a.status}`, 'project', existing.id)
    await touchClient(existing.client_id)
    return { updated: true, project: data }
  }
  const row = { user_id: userId, client_id: client?.id || null, title: str(a.title, 200), status: a.status || 'backlog', priority: a.priority || 'medium', description: patch.description || null, due_date: patch.due_date || null, created_at: now, updated_at: now }
  const { data, error } = await sb.from('projects').insert(row).select('id, title, status, due_date').single()
  if (error) throw new ToolError(error.message)
  await logActivity(userId, 'project', `Project added${client ? ` for ${client.name}` : ''}: ${row.title}`, 'project', data.id)
  await touchClient(client?.id)
  return { created: true, project: data }
}

async function logUpdate(userId: string, a: Args) {
  const c = await resolveClient(userId, a.client)
  const note = str(a.note, 500)
  if (!note) throw new ToolError('Note is required.')
  await logActivity(userId, 'note', `${c.name}: ${note}`, 'client', c.id)
  await touchClient(c.id)
  return { logged: true, client: c.name }
}

async function updateClient(userId: string, a: Args) {
  const sb = getAdminClient()
  const c = await resolveClient(userId, a.client)
  const patch: any = {}
  for (const k of ['status', 'service', 'contact', 'email', 'phone', 'website']) if (str(a[k])) patch[k] = str(a[k], 300)
  if (typeof a.mrr === 'number' && a.mrr >= 0) patch.mrr = a.mrr
  if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email)) throw new ToolError('That email address does not look valid.')
  if (!Object.keys(patch).length) throw new ToolError('Nothing to change.')
  patch.updated_at = new Date().toISOString()
  const { error } = await sb.from('clients').update(patch).eq('id', c.id)
  if (error) throw new ToolError(error.message)
  const changed = Object.keys(patch).filter(k => k !== 'updated_at')
  await logActivity(userId, 'client', `${c.name}: updated ${changed.join(', ')}`, 'client', c.id)
  return { updated: true, client: c.name, changed }
}

async function addClient(userId: string, a: Args) {
  const sb = getAdminClient()
  const name = str(a.name, 200)
  if (!name) throw new ToolError('Client name is required.')
  const { data: dup } = await sb.from('clients').select('id, name').eq('user_id', userId).ilike('name', name.replace(/[%_]/g, '')).limit(1)
  if (dup?.length) return { already_exists: true, client: dup[0] }
  if (str(a.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(a.email))) throw new ToolError('That email address does not look valid.')
  const now = new Date().toISOString()
  const { data, error } = await sb.from('clients').insert({
    user_id: userId, name, contact: str(a.contact) || null, email: str(a.email) || null, phone: str(a.phone) || null,
    website: str(a.website) || null, service: str(a.service) || null, status: a.status || 'active', mrr: 0, last_activity: today(), created_at: now, updated_at: now,
  }).select('id, name').single()
  if (error) throw new ToolError(error.message)
  await logActivity(userId, 'client', `Client added: ${name}`, 'client', data.id)
  return { created: true, client: data }
}

async function listInvoices(userId: string, a: Args) {
  const sb = getAdminClient()
  const names = await clientNames(userId)
  let q = sb.from('invoices').select('num, amount, status, sent_date, due_date, paid_at, client_id').eq('user_id', userId)
  const s = a.status || 'all'
  if (s === 'unpaid') q = q.in('status', ['sent', 'overdue'])
  else if (s !== 'all') q = q.eq('status', s)
  if (a.client) q = q.eq('client_id', (await resolveClient(userId, a.client)).id)
  const { data } = await q.order('created_at', { ascending: false }).limit(Math.min(Number(a.limit) || 30, 100))
  return (data || []).map(i => ({ num: i.num, client: names.get(i.client_id) || null, total: money(i.amount), status: i.status, issued: i.sent_date, due: i.due_date, paid: i.paid_at ? i.paid_at.slice(0, 10) : null }))
}

async function createInvoiceDraft(userId: string, a: Args) {
  const sb = getAdminClient()
  const c = await resolveClient(userId, a.client)
  const items = Array.isArray(a.line_items) ? a.line_items : []
  const lines = items.map((x: any) => ({ description: str(x?.description, 300), qty: Number(x?.qty), rate: Number(x?.rate) }))
  if (!lines.length || lines.some((l: any) => !l.description || !(l.qty > 0) || !(l.rate >= 0))) throw new ToolError('Each line item needs a description, a quantity above 0 and a rate.')
  const tax = typeof a.tax_rate === 'number' ? a.tax_rate : 5
  const sub = Math.round(lines.reduce((s: number, l: any) => s + l.qty * l.rate, 0) * 100) / 100
  const total = Math.round(sub * (1 + tax / 100) * 100) / 100
  // Next number in the client's own series (TC02, LPA09...)
  const { data: theirs } = await sb.from('invoices').select('num').eq('client_id', c.id).order('created_at', { ascending: false })
  let pre = (theirs || []).map(r => String(r.num).match(/^([A-Z]+)\d+$/)?.[1]).find(Boolean) || c.name.split(/[^A-Za-z]+/).filter((w: string) => w && !/^(and|the|of|inc|ltd|llp)$/i.test(w)).map((w: string) => w[0]).join('').toUpperCase().slice(0, 4) || 'GTH'
  const { data: all } = await sb.from('invoices').select('num').eq('user_id', userId).ilike('num', `${pre}%`)
  const n = Math.max(0, ...(all || []).map(r => Number(String(r.num).slice(pre.length)) || 0))
  const num = pre + String(n + 1).padStart(2, '0')
  const { data: last } = await sb.from('invoices').select('notes').eq('user_id', userId).not('notes', 'is', null).order('created_at', { ascending: false }).limit(1)
  let from: any = {}
  try { from = JSON.parse(last?.[0]?.notes || '{}') } catch { /* defaults below */ }
  const issue = today()
  const due = date(a.due_date, 'due_date') || issue
  const notes = {
    line_items: lines, tax_rate: tax, tax_label: 'GST', gst_number: from.gst_number || '720385129', currency: 'CAD',
    payment_terms: str(a.payment_terms, 60) || 'Due on Receipt', payment_instructions: from.payment_instructions || 'Payments can be made via e-transfer',
    terms_text: '', memo: str(a.memo, 300),
    from_name: from.from_name || 'Grow The Hype Inc.', from_email: from.from_email || 'omar@growthehype.ca', from_phone: from.from_phone || '7809664986',
    from_address: from.from_address || '983 Lamb Crescent', from_website: from.from_website || 'www.growthehype.ca',
    client_phone: '', client_address: '', client_contact_name: c.contact || '',
  }
  const { data, error } = await sb.from('invoices').insert({ user_id: userId, num, client_id: c.id, amount: total, sent_date: issue, due_date: due, status: 'draft', notes: JSON.stringify(notes) }).select('id').single()
  if (error) throw new ToolError(error.message)
  await logActivity(userId, 'invoice', `Draft invoice ${num} for ${c.name} (${money(total)})`, 'invoice', data.id)
  return { created: true, invoice: num, client: c.name, subtotal: money(sub), gst: money(total - sub), total: money(total), status: 'draft (not sent; Omar sends it from the Invoices page)' }
}

async function logWork(userId: string, a: Args) {
  const sb = getAdminClient()
  const c = await resolveClient(userId, a.client)
  const desc = str(a.description, 300)
  if (!desc) throw new ToolError('Say what the work was.')
  let projectId: string | null = null
  if (a.project) {
    const { data } = await sb.from('projects').select('id').eq('user_id', userId).eq('client_id', c.id).ilike('title', `%${str(a.project, 120).replace(/[%_]/g, '')}%`).limit(1)
    projectId = data?.[0]?.id || null
  }
  if (!projectId) {
    const { data } = await sb.from('projects').select('id').eq('user_id', userId).eq('client_id', c.id).neq('status', 'done').order('updated_at', { ascending: false }).limit(2)
    if (data?.length === 1) projectId = data[0].id
  }
  const day = date(a.date, 'date') || today()
  const isClaude = a.kind !== 'omar'
  const minutes = Math.round(Number(isClaude ? a.claude_minutes : a.minutes) || 0)
  if (!(minutes > 0) || minutes > 24 * 60) throw new ToolError(isClaude ? 'claude_minutes must be between 1 and 1440.' : 'minutes must be between 1 and 1440.')
  const human = isClaude ? Math.round((Number(a.human_hours) || 0) * 60) : minutes
  if (isClaude && !(human > 0)) throw new ToolError('human_hours is required for Claude work.')
  const start = new Date(`${day}T12:00:00Z`)
  const { data, error } = await sb.from('time_entries').insert({
    user_id: userId, client_id: c.id, project_id: projectId, source: isClaude ? 'claude' : 'manual',
    started_at: start.toISOString(), ended_at: new Date(start.getTime() + minutes * 60000).toISOString(),
    duration_minutes: minutes, human_minutes: human, work_type: a.work_type || null, description: desc, notes: desc, billable: a.billable !== false,
  }).select('id').single()
  if (error) throw new ToolError(error.message)
  await logActivity(userId, 'create', `${c.name}: ${desc} (${isClaude ? `Claude ${minutes} min, ${Math.round(human / 6) / 10} h by hand` : `${minutes} min of your time`})`, 'time', data.id)
  await touchClient(c.id)
  return { logged: true, client: c.name, minutes, human_equivalent_hours: Math.round(human / 6) / 10 }
}

async function listTime(userId: string, a: Args) {
  const sb = getAdminClient()
  const names = await clientNames(userId)
  let q = sb.from('time_entries').select('id, client_id, source, description, notes, duration_minutes, human_minutes, started_at, billable').eq('user_id', userId).order('started_at', { ascending: false }).order('id').limit(Math.min(50, Math.max(1, Number(a.limit) || 15)))
  if (a.client) { const c = await resolveClient(userId, a.client); q = q.eq('client_id', c.id) }
  const { data, error } = await q
  if (error) throw new ToolError(error.message)
  return (data || []).map(e => ({
    id: e.id, client: names.get(e.client_id) || null, kind: e.source === 'claude' ? 'claude' : e.source === 'calendar' ? 'meeting' : 'omar',
    description: e.description || e.notes, minutes: e.duration_minutes, human_hours: e.human_minutes != null ? Math.round(e.human_minutes / 6) / 10 : null,
    date: new Date(e.started_at).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' }), billable: e.billable,
  }))
}

async function updateTime(userId: string, a: Args) {
  const sb = getAdminClient()
  const id = str(a.id, 60)
  const { data: cur } = await sb.from('time_entries').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!cur) throw new ToolError('No time entry with that id. Use list_time to find it.')
  if (a.delete === true) {
    const { error } = await sb.from('time_entries').delete().eq('id', id).eq('user_id', userId)
    if (error) throw new ToolError(error.message)
    await logActivity(userId, 'delete', `Removed time entry: ${cur.description || cur.notes || ''}`.trim(), 'time', id)
    return { deleted: true }
  }
  const patch: any = {}
  const mins = a.claude_minutes ?? a.minutes
  if (mins != null) {
    const m = Math.round(Number(mins))
    if (!(m > 0) || m > 1440) throw new ToolError('Minutes must be between 1 and 1440.')
    patch.duration_minutes = m
    if (cur.source !== 'claude') patch.human_minutes = m
  }
  if (a.human_hours != null) {
    if (cur.source !== 'claude') throw new ToolError('human_hours only applies to Claude work.')
    const h = Math.round(Number(a.human_hours) * 60)
    if (!(h > 0)) throw new ToolError('human_hours must be more than 0.')
    patch.human_minutes = h
  }
  if (a.description) { patch.description = str(a.description, 300); patch.notes = patch.description }
  if (a.billable != null) patch.billable = a.billable !== false
  if (a.client) { const c = await resolveClient(userId, a.client); patch.client_id = c.id; patch.project_id = null }
  let start = new Date(cur.started_at)
  if (a.date) { const d = date(a.date, 'date')!; start = cur.source === 'calendar' ? new Date(`${d}${cur.started_at.slice(10)}`) : new Date(`${d}T12:00:00Z`); patch.started_at = start.toISOString() }
  if (patch.duration_minutes || patch.started_at) patch.ended_at = new Date(start.getTime() + (patch.duration_minutes ?? cur.duration_minutes) * 60000).toISOString()
  if (!Object.keys(patch).length) throw new ToolError('Nothing to change.')
  const { error } = await sb.from('time_entries').update(patch).eq('id', id).eq('user_id', userId)
  if (error) throw new ToolError(error.message)
  return { updated: true, minutes: patch.duration_minutes ?? cur.duration_minutes, human_hours: Math.round((patch.human_minutes ?? cur.human_minutes ?? 0) / 6) / 10 }
}

async function timeSummary(userId: string, a: Args) {
  const sb = getAdminClient()
  const t = today()
  const start = date(a.start_date, 'start_date') || `${t.slice(0, 7)}-01`
  const end = date(a.end_date, 'end_date') || t
  const names = await clientNames(userId)
  let tq = sb.from('time_entries').select('client_id, source, duration_minutes, human_minutes, billable').eq('user_id', userId).gte('started_at', `${start}T00:00:00Z`).lte('started_at', `${end}T23:59:59Z`)
  let iq = sb.from('invoices').select('client_id, amount, paid_at, notes').eq('user_id', userId).eq('status', 'paid').gte('paid_at', `${start}T00:00:00Z`).lte('paid_at', `${end}T23:59:59Z`)
  if (a.client) { const c = await resolveClient(userId, a.client); tq = tq.eq('client_id', c.id); iq = iq.eq('client_id', c.id) }
  const [{ data: te }, { data: inv }] = await Promise.all([tq, iq])
  const rows: Record<string, any> = {}
  const row = (id: string) => (rows[id] = rows[id] || { client: names.get(id) || 'No client', revenue: 0, omar_hours: 0, claude_hours: 0, human_equivalent_hours: 0 })
  for (const e of te || []) {
    const r = row(e.client_id || 'none')
    const m = Number(e.duration_minutes) || 0
    if (e.source === 'claude') { r.claude_hours += m / 60; r.human_equivalent_hours += (Number(e.human_minutes) || m) / 60 }
    else { r.omar_hours += m / 60; r.human_equivalent_hours += m / 60 }
  }
  for (const i of inv || []) {
    // Revenue before GST
    let tax = 5; try { tax = Number(JSON.parse(i.notes || '{}').tax_rate ?? 5) } catch { /* default GST */ }
    row(i.client_id || 'none').revenue += Number(i.amount) / (1 + tax / 100)
  }
  const out = Object.values(rows).map((r: any) => ({
    ...r, revenue: money(r.revenue), omar_hours: Math.round(r.omar_hours * 10) / 10, claude_hours: Math.round(r.claude_hours * 10) / 10, human_equivalent_hours: Math.round(r.human_equivalent_hours * 10) / 10,
    per_hour_of_your_time: r.omar_hours + r.claude_hours > 0 ? money(r.revenue / (r.omar_hours + r.claude_hours)) : null,
  }))
  return { from: start, to: end, clients: out }
}

export async function callTool(userId: string, name: string, args: Args) {
  switch (name) {
    case 'get_overview': return getOverview(userId)
    case 'find_client': return findClient(userId, args)
    case 'list_calendar': {
      const start = date(args.start_date, 'start_date') || today()
      const end = date(args.end_date, 'end_date') || start
      try { return { events: await listEvents(userId, start, end > start ? end : start) } } catch (e: any) { throw new ToolError(e.message) }
    }
    case 'add_calendar_event': {
      try {
        const r = await createEvent(userId, args as any)
        await logActivity(userId, 'create', `Calendar: ${r.title}, ${r.when}`, 'event', null)
        return r
      } catch (e: any) { throw new ToolError(e.message) }
    }
    case 'update_calendar_event': {
      try { return await moveOrRenameEvent(userId, args as any) } catch (e: any) { throw new ToolError(e.message) }
    }
    case 'list_tasks': return listTasks(userId, args)
    case 'add_task': return addTask(userId, args)
    case 'update_task': return updateTask(userId, args)
    case 'list_projects': return listProjects(userId, args)
    case 'save_project': return saveProject(userId, args)
    case 'log_update': return logUpdate(userId, args)
    case 'update_client': return updateClient(userId, args)
    case 'add_client': return addClient(userId, args)
    case 'list_invoices': return listInvoices(userId, args)
    case 'log_work': return logWork(userId, args)
    case 'time_summary': return timeSummary(userId, args)
    case 'list_time': return listTime(userId, args)
    case 'update_time': return updateTime(userId, args)
    case 'create_invoice_draft': return createInvoiceDraft(userId, args)
    default: throw new ToolError(`Unknown tool ${name}`)
  }
}

export const SERVER_INSTRUCTIONS = `This is Omar's Command Center, the CRM for Grow The Hype. Keep it current without being asked:
- When a conversation works on a client (a website, invoice, email, design, plan), update the CRM as you go: add tasks for agreed next steps, mark finished tasks done, move the project's status, and call log_update with one short line on what was done.
- When something goes to a client or prospect and Omar is now waiting on them (a proposal, a site to approve, a meeting to book), add_task with waiting=true, e.g. "Waiting on Wendy to approve the new website", due on the day to check in. New prospects get add_client with status prospect first.
- Before adding a task or client, check with find_client so nothing is duplicated.
- Use clear, short task names in plain Canadian English.
- Track time: whenever you finish a piece of work for a client in a conversation, call log_work with kind 'claude', an estimated claude_minutes for the session and the human_hours a skilled agency would need by hand. Estimates are expected; tell Omar the numbers in one line so he can correct them. If he corrects one, use list_time and update_time to fix it yourself. When Omar mentions his own time (a call, a meeting, a shoot), log it with kind 'omar'. Calendar meetings with clients are logged automatically, so don't log those twice.
- Invoices are only ever created as drafts. Never claim an email or invoice was sent.
- When Omar asks what's on his plate, call get_overview, and list_calendar for today's meetings.
- You can add or move events in his Google Calendar (no guests, no invitations). Confirm the day and time back to him.`
