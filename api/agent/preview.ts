// Homepage concepts for hot leads. Each call does the next stage for a lead
// (kit, page, review and publish). Omar's app calls it with his session to
// build or rebuild one lead's concept; a Supabase cron job calls it with the
// agent token to work through hot leads in the background.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from './_lib/supabase-admin'
import { advancePreview, leadsNeedingPreview, PREVIEW_HOST } from './_lib/preview'
import { draftStepToGmail } from './_lib/sender'
import { reopenSequence } from './_lib/tracker-sync'
import { spendLevel } from './_lib/lead-stage'
import { draftForLead } from './_lib/email-generator'
import fs from 'node:fs'
import path from 'node:path'

const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', css: 'text/css', js: 'text/javascript', woff2: 'font/woff2', mp4: 'video/mp4' }

async function publishBundled(slug: string, leadId: string) {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return { ok: false, error: 'bad slug' }
  const root = path.join(process.cwd(), 'concepts', slug)
  if (!fs.existsSync(root)) return { ok: false, error: 'no bundled concept for ' + slug }
  const sb = getAdminClient()
  const files: string[] = []
  const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p) } }
  walk(root)
  const done: string[] = []
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/')
    const ext = rel.split('.').pop()!.toLowerCase()
    const { error } = await sb.storage.from('lead-previews').upload(`${slug}/${rel}`, fs.readFileSync(f), { contentType: TYPES[ext] || 'application/octet-stream', upsert: true, cacheControl: '60' })
    if (error) return { ok: false, error: `${rel}: ${error.message}` }
    done.push(rel)
  }
  const { data: lead } = await sb.from('outreach_leads').select('enrichment_data').eq('id', leadId).single()
  const e = (lead?.enrichment_data || {}) as any
  // share.jpg: the page as a picture, attached to the first email and used for link previews
  const image = done.includes('share.jpg') ? `${PREVIEW_HOST}/${slug}/share.jpg` : (e.preview?.image || null)
  const preview = { ...(e.preview || {}), slug, status: 'ready', image, url: `${PREVIEW_HOST}/${slug}/`, built_at: new Date().toISOString(), handmade: true, step: 'done', error: null, review: { score: null, notes: ['Hand-built in the Grow The Hype studio'] } }
  await sb.from('outreach_leads').update({ enrichment_data: { ...e, preview } }).eq('id', leadId)
  return { ok: true, url: preview.url, files: done }
}

const BUDGET_MS = Number(process.env.PREVIEW_BUDGET_MS) || 285_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const started = Date.now()
  const deadline = started + BUDGET_MS
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const sb = getAdminClient()

  // Background: Supabase cron with the agent token
  const agentToken = String(req.headers['x-agent-token'] || '')
  if (agentToken) {
    const { data: ok } = await sb.rpc('agent_hunt_token_ok', { t: agentToken })
    if (ok !== true) return res.status(401).json({ error: 'Unauthorized' })

    // Publish a hand-built concept bundled with the deployment (concepts/<slug>/...)
    const body = (req.body ?? {}) as any
    if (body.publish && body.slug && body.leadId) {
      const r = await publishBundled(String(body.slug), String(body.leadId))
      return res.status(200).json(r)
    }
    // Rewrite one lead's unsent emails with the current voice (never sends)
    if (body.redraftLead) {
      const { data: l } = await sb.from('outreach_leads').select('user_id').eq('id', String(body.redraftLead)).single()
      const { data: cfg } = await sb.from('agent_configs').select('*').eq('id', String(body.configId || '')).single()
      if (!l || !cfg || cfg.user_id !== l.user_id) return res.status(404).json({ error: 'lead or agent not found' })
      try {
        const r = await draftForLead({ userId: l.user_id, agentConfig: cfg, leadId: String(body.redraftLead) })
        return res.status(200).json({ ok: true, ...r })
      } catch (e: any) { return res.status(200).json({ ok: false, error: String(e?.message || e).slice(0, 300) }) }
    }
    // Health check: can the server start Chrome and screenshot a page?
    if (body.browserCheck) {
      const t0 = Date.now()
      const { captureWithBrowser } = await import('./_lib/browser')
      const c: any = await captureWithBrowser(String(body.url || 'https://growthehype.ca')).catch((e: any) => ({ ok: false, error: String(e?.message || e) }))
      return res.status(200).json({ ok: !!c.ok, loaded: !!c.loaded, error: c.error || null, title: c.title || null, shots: ['desktopTop', 'mobileTop'].filter(k => c[k]).length, ms: Date.now() - t0 })
    }
    // Pick a lead back up after a bounce (never sends)
    if (body.reopenLead) {
      const { data: l } = await sb.from('outreach_leads').select('user_id').eq('id', String(body.reopenLead)).single()
      if (!l) return res.status(404).json({ error: 'lead not found' })
      const { data: cfg } = await sb.from('agent_configs').select('config').eq('id', String(body.configId || '')).maybeSingle()
      return res.status(200).json(await reopenSequence({ userId: l.user_id, leadId: String(body.reopenLead), addEmails: body.emails || [], cfgInner: cfg?.config || {} }))
    }
    // Put one approved email into Omar's Gmail Drafts (never sends)
    if (body.gmailDraft && body.stepId) {
      const { data: st } = await sb.from('outreach_steps').select('user_id, outreach_sequences!inner(agent_config_id)').eq('id', String(body.stepId)).single()
      if (!st) return res.status(404).json({ error: 'step not found' })
      const { data: cfg } = await sb.from('agent_configs').select('config').eq('id', (st as any).outreach_sequences.agent_config_id).maybeSingle()
      try {
        const r = await draftStepToGmail({ userId: st.user_id, stepId: String(body.stepId), cfgInner: cfg?.config || {} })
        return res.status(200).json({ ok: true, ...r })
      } catch (e: any) { return res.status(200).json({ ok: false, error: String(e?.message || e).slice(0, 300) }) }
    }
    const { data: configs } = await sb.from('agent_configs').select('id, agent_name, config').eq('enabled', true)
    const agents = (configs || []).filter((c: any) => c.config?.profile === 'gth' && c.config?.build_previews !== false && !spendLevel(c.config))
    const done: any[] = []
    for (const a of agents) {
      const leads = await leadsNeedingPreview(a.id, 3)
      for (const l of leads) {
        // A page draft takes several minutes; only start a stage with room left
        if (done.length) break // each stage can use most of one call
        const s: any = await advancePreview(l.id, { deadline })
        if (s.busy) continue
        done.push({ lead: l.name, status: s.status, error: s.error || null })
        if (s.status !== 'ready' && s.status !== 'failed') break // one lead at a time
      }
    }
    // Keep going straight into the next stage instead of waiting for the next cron tick
    const hop = Number(req.headers['x-chain'] || 0)
    if (done.length && hop < 16) {
      const self = `https://${req.headers.host}/api/agent/preview`
      await fetch(self, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-token': agentToken, 'x-chain': String(hop + 1) },
        body: '{}',
        signal: AbortSignal.timeout(2500),
      }).catch(() => { /* the next call carries on without us */ })
    }
    return res.status(200).json({ ok: true, done })
  }

  // Omar, from the app
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) return res.status(500).json({ error: 'Supabase not configured' })
  const { data: { user } } = await createClient(url, anon).auth.getUser(auth.slice(7))
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { leadId, rebuild, feedback } = (req.body ?? {}) as { leadId?: string; rebuild?: boolean; feedback?: string }
  if (!leadId) return res.status(400).json({ error: 'leadId required' })
  const { data: lead } = await sb.from('outreach_leads').select('id, user_id').eq('id', leadId).single()
  if (!lead || lead.user_id !== user.id) return res.status(404).json({ error: 'Lead not found' })
  try {
    const notes = typeof feedback === 'string' && feedback.trim() ? feedback.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 12) : undefined
    const state = await advancePreview(leadId, { deadline, rebuild: !!rebuild, feedback: notes })
    return res.status(200).json({ ok: true, preview: state })
  } catch (err: any) {
    return res.status(500).json({ error: String(err?.message || err).slice(0, 300) })
  }
}
