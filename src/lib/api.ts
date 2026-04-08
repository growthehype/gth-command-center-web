import { supabase } from './supabase'

// Helper to get current user id
async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Not authenticated')
  return data.user.id
}

// ============================================
// CLIENTS
// ============================================
export const clients = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId).order('name')
    if (error) throw error
    return data || []
  },
  async getById(id: string) {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('clients').insert({ ...d, user_id: userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('clients').update({ ...d, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// TASKS
// ============================================
export const tasks = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('tasks').select('*, clients(name)').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((t: any) => ({ ...t, client_name: t.clients?.name || null }))
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('tasks').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('tasks').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async toggle(id: string) {
    const { data: task } = await supabase.from('tasks').select('done').eq('id', id).single()
    if (!task) return { success: false }
    const newDone = !task.done
    const { error } = await supabase.from('tasks').update({
      done: newDone,
      completed_at: newDone ? new Date().toISOString() : null,
    }).eq('id', id)
    if (error) throw error
    return { success: true, done: newDone }
  },
}

// ============================================
// PROJECTS
// ============================================
export const projects = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('projects').select('*, clients(name)').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((p: any) => ({ ...p, client_name: p.clients?.name || null }))
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('projects').insert({ ...d, user_id: userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('projects').update({ ...d, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async moveStatus(id: string, status: string) {
    const { error } = await supabase.from('projects').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// INVOICES (legacy table — kept for Financials)
// ============================================
export const invoices = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('invoices').select('*, clients(name)').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((i: any) => ({ ...i, client_name: i.clients?.name || null }))
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('invoices').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('invoices').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async cycleStatus(id: string) {
    const { data: inv } = await supabase.from('invoices').select('status').eq('id', id).single()
    if (!inv) return { success: false }
    const cycle: Record<string, string> = { draft: 'sent', sent: 'paid', paid: 'draft', overdue: 'paid' }
    const newStatus = cycle[inv.status] || 'draft'
    const update: any = { status: newStatus }
    if (newStatus === 'paid') update.paid_at = new Date().toISOString()
    const { error } = await supabase.from('invoices').update(update).eq('id', id)
    if (error) throw error
    return { success: true, status: newStatus }
  },
  async getNextNum() {
    const userId = await uid()
    const { data } = await supabase.from('invoices').select('num').eq('user_id', userId).order('num', { ascending: false }).limit(1)
    if (!data || data.length === 0) return 'GTH-001'
    const n = parseInt(data[0].num.replace('GTH-', '')) + 1
    return `GTH-${String(n).padStart(3, '0')}`
  },
}

// ============================================
// INVOICE FILES (new upload system)
// ============================================
export const invoiceFiles = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('invoice_files').select('*, clients(name)').eq('user_id', userId).order('uploaded_at', { ascending: false })
    if (error) throw error
    return (data || []).map((f: any) => ({ ...f, client_name: f.clients?.name || null }))
  },
  async getByClient(clientId: string) {
    const userId = await uid()
    const { data, error } = await supabase.from('invoice_files').select('*, clients(name)').eq('user_id', userId).eq('client_id', clientId).order('uploaded_at', { ascending: false })
    if (error) throw error
    return (data || []).map((f: any) => ({ ...f, client_name: f.clients?.name || null }))
  },
  async upload(clientId: string, fileName: string, file: File) {
    const userId = await uid()
    const ext = fileName.split('.').pop()
    const filePath = `${userId}/invoices/${clientId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('files').upload(filePath, file)
    if (uploadErr) throw uploadErr
    const { data, error } = await supabase.from('invoice_files').insert({
      user_id: userId, client_id: clientId, name: fileName, size: file.size, file_path: filePath, uploaded_at: new Date().toISOString(),
    }).select().single()
    if (error) throw error
    return data
  },
  async getFileUrl(id: string) {
    const { data: doc } = await supabase.from('invoice_files').select('file_path').eq('id', id).single()
    if (!doc?.file_path) return null
    const { data } = await supabase.storage.from('files').createSignedUrl(doc.file_path, 3600)
    return data?.signedUrl || null
  },
  async rename(id: string, newName: string) {
    const { error } = await supabase.from('invoice_files').update({ name: newName }).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { data: doc } = await supabase.from('invoice_files').select('file_path').eq('id', id).single()
    if (doc?.file_path) {
      await supabase.storage.from('files').remove([doc.file_path])
    }
    const { error } = await supabase.from('invoice_files').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// EVENTS
// ============================================
export const events = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('events').select('*, clients(name)').eq('user_id', userId).order('date')
    if (error) throw error
    return (data || []).map((e: any) => ({ ...e, client_name: e.clients?.name || null }))
  },
  async getByDateRange(start: string, end: string) {
    const userId = await uid()
    const { data, error } = await supabase.from('events').select('*, clients(name)').eq('user_id', userId).gte('date', start).lte('date', end).order('date')
    if (error) throw error
    return (data || []).map((e: any) => ({ ...e, client_name: e.clients?.name || null }))
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('events').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('events').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// OUTREACH
// ============================================
export const outreach = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('outreach_leads').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('outreach_leads').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('outreach_leads').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('outreach_leads').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// CAMPAIGNS
// ============================================
export const campaigns = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('campaigns').select('*, clients(name)').eq('user_id', userId).order('name')
    if (error) throw error
    return (data || []).map((c: any) => ({ ...c, client_name: c.clients?.name || null }))
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('campaigns').insert({ ...d, user_id: userId, updated_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('campaigns').update({ ...d, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('campaigns').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// CREDENTIALS
// ============================================
export const credentials = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('credentials').select('*').eq('user_id', userId).order('platform')
    if (error) throw error
    return data || []
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('credentials').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('credentials').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('credentials').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// SOPS
// ============================================
export const sops = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('sops').select('*').eq('user_id', userId).order('title')
    if (error) throw error
    return data || []
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('sops').insert({ ...d, user_id: userId, updated_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('sops').update({ ...d, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('sops').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// DOCUMENTS
// ============================================
export const documents = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('documents').select('*').eq('user_id', userId).order('uploaded_at', { ascending: false })
    if (error) throw error
    return data || []
  },
  async getByCategory(category: string) {
    const userId = await uid()
    const { data, error } = await supabase.from('documents').select('*').eq('user_id', userId).eq('category', category).order('uploaded_at', { ascending: false })
    if (error) throw error
    return data || []
  },
  async upload(category: string, fileName: string, file: File) {
    const userId = await uid()
    const ext = fileName.split('.').pop()
    const filePath = `${userId}/documents/${category}/${crypto.randomUUID()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('files').upload(filePath, file)
    if (uploadErr) throw uploadErr
    const { data, error } = await supabase.from('documents').insert({
      user_id: userId, category, name: fileName, size: file.size, file_path: filePath, uploaded_at: new Date().toISOString(),
    }).select().single()
    if (error) throw error
    return data
  },
  async getFileUrl(id: string) {
    const { data: doc } = await supabase.from('documents').select('file_path').eq('id', id).single()
    if (!doc?.file_path) return null
    const { data } = await supabase.storage.from('files').createSignedUrl(doc.file_path, 3600)
    return data?.signedUrl || null
  },
  async rename(id: string, newName: string) {
    const { error } = await supabase.from('documents').update({ name: newName }).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { data: doc } = await supabase.from('documents').select('file_path').eq('id', id).single()
    if (doc?.file_path) {
      await supabase.storage.from('files').remove([doc.file_path])
    }
    const { error } = await supabase.from('documents').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// CONTACTS
// ============================================
export const contacts = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('contacts').select('*, clients(name)').eq('user_id', userId).order('name')
    if (error) throw error
    return (data || []).map((c: any) => ({ ...c, client_name: c.clients?.name || null }))
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('contacts').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('contacts').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// MEETINGS
// ============================================
export const meetings = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('meeting_notes').select('*, clients(name), contacts(name)').eq('user_id', userId).order('date', { ascending: false })
    if (error) throw error
    return (data || []).map((m: any) => ({ ...m, client_name: m.clients?.name || null, contact_name: m.contacts?.name || null }))
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('meeting_notes').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('meeting_notes').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('meeting_notes').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// SERVICES
// ============================================
export const services = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('services').select('*').eq('user_id', userId).order('name')
    if (error) throw error
    return data || []
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('services').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('services').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('services').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// TEMPLATES
// ============================================
export const templates = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('email_templates').select('*').eq('user_id', userId).order('name')
    if (error) throw error
    return data || []
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('email_templates').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('email_templates').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('email_templates').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async incrementUseCount(id: string) {
    const { data: t } = await supabase.from('email_templates').select('use_count').eq('id', id).single()
    if (!t) return
    const { error } = await supabase.from('email_templates').update({ use_count: (t.use_count || 0) + 1 }).eq('id', id)
    if (error) throw error
  },
}

// ============================================
// TIME ENTRIES
// ============================================
export const timeEntries = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('time_entries').select('*, projects(title), clients(name)').eq('user_id', userId).order('started_at', { ascending: false })
    if (error) throw error
    return (data || []).map((t: any) => ({ ...t, project_title: t.projects?.title || null, client_name: t.clients?.name || null }))
  },
  async getByClient(clientId: string) {
    const userId = await uid()
    const { data, error } = await supabase.from('time_entries').select('*, projects(title), clients(name)').eq('user_id', userId).eq('client_id', clientId).order('started_at', { ascending: false })
    if (error) throw error
    return (data || []).map((t: any) => ({ ...t, project_title: t.projects?.title || null, client_name: t.clients?.name || null }))
  },
  async getByProject(projectId: string) {
    const userId = await uid()
    const { data, error } = await supabase.from('time_entries').select('*, projects(title), clients(name)').eq('user_id', userId).eq('project_id', projectId).order('started_at', { ascending: false })
    if (error) throw error
    return (data || []).map((t: any) => ({ ...t, project_title: t.projects?.title || null, client_name: t.clients?.name || null }))
  },
  async start(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('time_entries').insert({ ...d, user_id: userId, started_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async stop(id: string, notes: string) {
    const { data: entry } = await supabase.from('time_entries').select('*').eq('id', id).single()
    if (!entry) return { success: false }
    const endedAt = new Date().toISOString()
    const duration = Math.round((new Date(endedAt).getTime() - new Date(entry.started_at).getTime()) / 60000)
    const { error } = await supabase.from('time_entries').update({ ended_at: endedAt, duration_minutes: duration, notes }).eq('id', id)
    if (error) throw error
    return { success: true, duration }
  },
  async getRunning() {
    const userId = await uid()
    const { data, error } = await supabase.from('time_entries').select('*, projects(title), clients(name)').eq('user_id', userId).is('ended_at', null).limit(1).single()
    if (error && error.code !== 'PGRST116') throw error
    if (!data) return null
    return { ...data, project_title: data.projects?.title || null, client_name: data.clients?.name || null }
  },
}

// ============================================
// GOALS
// ============================================
export const goals = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('goals').select('*').eq('user_id', userId).order('status').order('target_date')
    if (error) throw error
    return data || []
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('goals').insert({ ...d, user_id: userId, created_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('goals').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('goals').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// CLIENT LINKS
// ============================================
export const clientLinks = {
  async getByClient(clientId: string) {
    const { data, error } = await supabase.from('client_links').select('*').eq('client_id', clientId).order('sort_order')
    if (error) throw error
    return data || []
  },
  async create(d: any) {
    const userId = await uid()
    const { data, error } = await supabase.from('client_links').insert({ ...d, user_id: userId }).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, d: any) {
    const { error } = await supabase.from('client_links').update(d).eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async delete(id: string) {
    const { error } = await supabase.from('client_links').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
}

// ============================================
// CLIENT FILES
// ============================================
export const clientFiles = {
  async getByClient(clientId: string) {
    const { data, error } = await supabase.from('client_files').select('*').eq('client_id', clientId).order('uploaded_at', { ascending: false })
    if (error) throw error
    return data || []
  },
  async upload(clientId: string, category: string, fileName: string, file: File) {
    const userId = await uid()
    const ext = fileName.split('.').pop()
    const filePath = `${userId}/clients/${clientId}/${category}/${crypto.randomUUID()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('files').upload(filePath, file)
    if (uploadErr) throw uploadErr
    const { data, error } = await supabase.from('client_files').insert({
      user_id: userId, client_id: clientId, category, name: fileName, size: file.size, file_path: filePath, uploaded_at: new Date().toISOString(),
    }).select().single()
    if (error) throw error
    return data
  },
  async delete(id: string) {
    const { data: f } = await supabase.from('client_files').select('file_path').eq('id', id).single()
    if (f?.file_path) {
      await supabase.storage.from('files').remove([f.file_path])
    }
    const { error } = await supabase.from('client_files').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  },
  async getFileUrl(id: string) {
    const { data: doc } = await supabase.from('client_files').select('file_path').eq('id', id).single()
    if (!doc?.file_path) return null
    const { data } = await supabase.storage.from('files').createSignedUrl(doc.file_path, 3600)
    return data?.signedUrl || null
  },
}

// ============================================
// ACTIVITY
// ============================================
export const activity = {
  async getAll(limit = 50, offset = 0) {
    const userId = await uid()
    const { data, error } = await supabase.from('activity_log').select('*').eq('user_id', userId).order('timestamp', { ascending: false }).range(offset, offset + limit - 1)
    if (error) throw error
    return data || []
  },
  async getByEntity(entity: string, limit = 50) {
    const userId = await uid()
    const { data, error } = await supabase.from('activity_log').select('*').eq('user_id', userId).eq('entity', entity).order('timestamp', { ascending: false }).limit(limit)
    if (error) throw error
    return data || []
  },
  async log(type: string, entity: string, entityId: string | null, description: string) {
    const userId = await uid()
    await supabase.from('activity_log').insert({ user_id: userId, type, entity, entity_id: entityId, description, timestamp: new Date().toISOString() })
  },
}

// ============================================
// NOTES
// ============================================
export const notes = {
  async get() {
    const userId = await uid()
    const { data } = await supabase.from('global_notes').select('content').eq('user_id', userId).single()
    return data?.content || ''
  },
  async save(content: string) {
    const userId = await uid()
    const { data: existing } = await supabase.from('global_notes').select('id').eq('user_id', userId).single()
    if (existing) {
      await supabase.from('global_notes').update({ content, updated_at: new Date().toISOString() }).eq('user_id', userId)
    } else {
      await supabase.from('global_notes').insert({ user_id: userId, content, updated_at: new Date().toISOString() })
    }
    return { success: true }
  },
}

// ============================================
// SETTINGS
// ============================================
export const settings = {
  async get(key: string) {
    const userId = await uid()
    const { data } = await supabase.from('settings').select('value').eq('user_id', userId).eq('key', key).single()
    return data?.value
  },
  async getAll() {
    const userId = await uid()
    const { data } = await supabase.from('settings').select('*').eq('user_id', userId)
    return Object.fromEntries((data || []).map((r: any) => [r.key, r.value]))
  },
  async set(key: string, value: string) {
    const userId = await uid()
    const { data: existing } = await supabase.from('settings').select('id').eq('user_id', userId).eq('key', key).single()
    if (existing) {
      await supabase.from('settings').update({ value }).eq('id', existing.id)
    } else {
      await supabase.from('settings').insert({ user_id: userId, key, value })
    }
    return { success: true }
  },
}

// ============================================
// TAX STATUS
// ============================================
export const taxStatus = {
  async getAll() {
    const userId = await uid()
    const { data, error } = await supabase.from('tax_status').select('*').eq('user_id', userId).order('year', { ascending: false })
    if (error) throw error
    return data || []
  },
  async update(year: number, status: string) {
    const userId = await uid()
    const { data: existing } = await supabase.from('tax_status').select('id').eq('user_id', userId).eq('year', year).single()
    if (existing) {
      await supabase.from('tax_status').update({ status, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('tax_status').insert({ user_id: userId, year, status, updated_at: new Date().toISOString() })
    }
    return { success: true }
  },
}

// ============================================
// SHELL (web equivalents)
// ============================================
export const shell = {
  openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  openPath(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
}

// ============================================
// Export as unified API matching electron shape
// ============================================
const api = {
  clients, tasks, projects, invoices, invoiceFiles, events, outreach,
  campaigns, credentials, sops, documents, contacts, meetings,
  services, templates, timeEntries, goals, clientLinks, clientFiles,
  activity, notes, settings, taxStatus, shell,
}

export default api
