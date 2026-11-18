// Omar's meetings become tracked time. Three times a day the job reads calendar
// events that have ended, works out which client each one was for (by guest
// email or company domain first, then by Claude reading the title), and logs
// the length of the meeting against that client. Personal events are skipped.
// Each event is logged once (external_id gcal:<id>), so reruns never double count.
import { getAdminClient } from './supabase-admin'
import { pastTimedEvents } from './calendar-server'
import { askClaude, extractToolUse } from './claude'

const FREE_MAIL = /(^|\.)(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|shaw|telus|aol|proton|protonmail)\.(com|ca|net|me)$/i
const domainOf = (e?: string | null) => (e || '').toLowerCase().split('@')[1] || ''

const TOOL = {
  name: 'match_events',
  description: 'For each calendar event, the client it was for, or none.',
  input_schema: { type: 'object', properties: { events: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' },
    client: { type: 'string', description: 'Exact client name from the list, or empty when it is personal, internal or not clearly for one client' },
    work_type: { type: 'string', enum: ['meeting', 'video', 'design', 'strategy', 'admin', 'other'] },
  }, required: ['id', 'client'] } } }, required: ['events'] },
}
const PROMPT = `Omar runs Grow The Hype, a creative and digital agency in Edmonton. You get his finished calendar events and his client list. For each event decide which client it was work for. Only pick a client when the title, notes or location clearly point to that client (their name, business, contact person, or a short form of it). Personal things (massage, gym, stretch, dinner, family, doctor, haircut, travel) and events that don't clearly belong to one client get an empty client. Photo or video shoots for a client are work_type video; calls and meetings are meeting.`

export async function runCalendarTime(opts: { days?: number } = {}) {
  const sb = getAdminClient()
  const days = Math.min(60, Math.max(1, Number(opts.days) || 2))
  const { data: integ } = await sb.from('integrations').select('user_id').eq('provider', 'gmail')
  const out: any[] = []
  for (const userId of [...new Set((integ || []).map(r => r.user_id))]) {
    const stats = { events: 0, logged: 0, personal: 0, minutes: 0 }
    try {
      const events = await pastTimedEvents(userId, days)
      stats.events = events.length
      if (!events.length) { out.push(stats); continue }
      const keys = events.map(e => `gcal:${e.id}`)
      const [{ data: done }, { data: seen }, { data: clients }, { data: contacts }] = await Promise.all([
        sb.from('time_entries').select('external_id').eq('user_id', userId).in('external_id', keys),
        sb.from('email_task_log').select('message_id').in('message_id', keys),
        sb.from('clients').select('id, name, email, contact, status').eq('user_id', userId).neq('status', 'archived'),
        sb.from('contacts').select('client_id, name, email').eq('user_id', userId),
      ])
      const skip = new Set([...(done || []).map(r => r.external_id), ...(seen || []).map(r => r.message_id)])
      const todo = events.filter(e => !skip.has(`gcal:${e.id}`) && e.minutes >= 5 && e.minutes <= 600)
      if (!todo.length) { out.push(stats); continue }

      const byEmail = new Map<string, string>(), byDomain = new Map<string, string>(), byName = new Map<string, string>()
      for (const c of clients || []) {
        byName.set(c.name.toLowerCase(), c.id)
        if (c.email) { byEmail.set(c.email.toLowerCase(), c.id); const d = domainOf(c.email); if (d && !FREE_MAIL.test(d)) byDomain.set(d, c.id) }
      }
      for (const ct of contacts || []) {
        if (ct.email) { byEmail.set(ct.email.toLowerCase(), ct.client_id); const d = domainOf(ct.email); if (d && !FREE_MAIL.test(d)) byDomain.set(d, ct.client_id) }
      }
      const picks = new Map<string, { clientId: string; type: string }>()
      for (const e of todo) {
        const hit = e.guests.map(g => byEmail.get(g) || byDomain.get(domainOf(g))).find(Boolean)
        if (hit) picks.set(e.id, { clientId: hit, type: 'meeting' })
      }
      const ask = todo.filter(e => !picks.has(e.id))
      if (ask.length) {
        const list = (clients || []).map(c => `${c.name}${c.contact ? ` (contact: ${c.contact})` : ''}`).join('\n')
        const people = (contacts || []).filter(c => c.name).map(c => `${c.name} = ${(clients || []).find(x => x.id === c.client_id)?.name || ''}`).join('; ')
        for (let i = 0; i < ask.length; i += 40) {
          const chunk = ask.slice(i, i + 40)
          const r = await askClaude({
            systemPrompt: PROMPT, tier: 'fast', maxTokens: 1500, tools: [TOOL],
            messages: [{ role: 'user', content: `Clients:\n${list}\n${people ? `Contacts: ${people}\n` : ''}\nEvents:\n${chunk.map(e => `[${e.id}] ${e.date} · ${e.minutes} min · ${e.title}${e.location ? ` · at ${e.location}` : ''}${e.description ? ` · notes: ${e.description.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`).join('\n')}` }],
          })
          for (const m of extractToolUse(r)?.input?.events || []) {
            const id = byName.get(String(m.client || '').trim().toLowerCase())
            if (id) picks.set(String(m.id), { clientId: id, type: m.work_type || 'meeting' })
          }
        }
      }
      for (const e of todo) {
        const p = picks.get(e.id)
        if (!p) { await sb.from('email_task_log').upsert({ message_id: `gcal:${e.id}`, user_id: userId, outcome: 'calendar:personal' }); stats.personal++; continue }
        const { error } = await sb.from('time_entries').insert({
          user_id: userId, client_id: p.clientId, source: 'calendar', started_at: e.start, ended_at: e.end,
          duration_minutes: e.minutes, human_minutes: e.minutes, work_type: p.type, description: e.title, notes: e.title, external_id: `gcal:${e.id}`, billable: true, timing: 'measured',
        })
        if (!error) { stats.logged++; stats.minutes += e.minutes }
      }
    } catch (err: any) { (stats as any).error = String(err?.message || err).slice(0, 200) }
    out.push(stats)
  }
  return out
}
