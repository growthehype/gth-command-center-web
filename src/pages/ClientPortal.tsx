import { useState, useEffect } from 'react'
import { CheckCircle2, Clock, FileText, FolderKanban, ListTodo, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface PortalData {
  client: { name: string; service: string | null; status: string }
  projects: { title: string; status: string; due_date: string | null }[]
  tasks: { text: string; done: number; priority: string; due_date: string | null }[]
  invoices: { num: string; amount: number; status: string; due_date: string | null }[]
  companyName: string
  companyLogoUrl: string
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-ok/15 text-ok', paid: 'bg-ok/15 text-ok', done: 'bg-ok/15 text-ok', completed: 'bg-ok/15 text-ok',
    sent: 'bg-warn/15 text-warn', 'in-progress': 'bg-warn/15 text-warn', 'in progress': 'bg-warn/15 text-warn',
    overdue: 'bg-err/15 text-err', high: 'bg-err/15 text-err',
    draft: 'bg-dim/15 text-dim', backlog: 'bg-dim/15 text-dim',
  }
  const cls = colors[status.toLowerCase()] || 'bg-dim/15 text-dim'
  return (
    <span className={`inline-flex px-2 py-0.5 font-[700] uppercase ${cls}`} style={{ fontSize: '10px', letterSpacing: '0.08em' }}>
      {status}
    </span>
  )
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return d }
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

export default function ClientPortal() {
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPortal()
  }, [])

  async function loadPortal() {
    try {
      const params = new URLSearchParams(window.location.search)
      const token = params.get('portal')
      if (!token) { setError('Invalid portal link'); setLoading(false); return }

      // Look up portal token
      const { data: portal, error: pErr } = await supabase
        .from('client_portal_tokens')
        .select('client_id, user_id, expires_at')
        .eq('token', token)
        .single()

      if (pErr || !portal) { setError('Portal link expired or invalid'); setLoading(false); return }

      // Check expiry
      if (portal.expires_at && new Date(portal.expires_at) < new Date()) {
        setError('This portal link has expired'); setLoading(false); return
      }

      const clientId = portal.client_id
      const userId = portal.user_id

      // Fetch client data (public read via service role or RLS bypass on portal table)
      const [clientRes, projRes, taskRes, invRes, settRes] = await Promise.all([
        supabase.from('clients').select('name, service, status').eq('id', clientId).single(),
        supabase.from('projects').select('title, status, due_date').eq('client_id', clientId).eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabase.from('tasks').select('text, done, priority, due_date').eq('client_id', clientId).eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
        supabase.from('invoices').select('num, amount, status, due_date').eq('client_id', clientId).eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabase.from('settings').select('key, value').eq('user_id', userId).in('key', ['company_name', 'company_logo_url']),
      ])

      if (clientRes.error || !clientRes.data) { setError('Client not found'); setLoading(false); return }

      const settingsMap = Object.fromEntries((settRes.data || []).map((r: any) => [r.key, r.value]))

      setData({
        client: clientRes.data,
        projects: projRes.data || [],
        tasks: taskRes.data || [],
        invoices: invRes.data || [],
        companyName: settingsMap.company_name || 'Operations Command Center',
        companyLogoUrl: settingsMap.company_logo_url || '',
      })
    } catch (err) {
      console.error('Portal load error:', err)
      setError('Failed to load portal')
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-polar/20 border-t-polar mx-auto mb-3" style={{ borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p className="text-dim" style={{ fontSize: '12px' }}>Loading portal...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center p-4">
        <div className="card text-center max-w-md">
          <AlertCircle size={32} className="text-err mx-auto mb-3" />
          <h2 className="text-polar font-[700]" style={{ fontSize: '16px' }}>{error || 'Something went wrong'}</h2>
          <p className="text-dim mt-2" style={{ fontSize: '12px' }}>Contact the sender of this link for a new portal URL.</p>
        </div>
      </div>
    )
  }

  const activeTasks = data.tasks.filter(t => !t.done)
  const completedTasks = data.tasks.filter(t => t.done)
  const totalInvoiced = data.invoices.reduce((s, i) => s + (i.amount || 0), 0)
  const outstanding = data.invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amount || 0), 0)

  return (
    <div className="min-h-screen bg-obsidian text-polar">
      {/* Header */}
      <header className="border-b border-border px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {data.companyLogoUrl ? (
            <img src={data.companyLogoUrl} alt="" className="w-8 h-8" />
          ) : (
            <img src="./icon.png" alt="" className="w-7 h-7" style={{ filter: 'brightness(0) invert(1)' }} />
          )}
          <span className="font-[800] uppercase" style={{ fontSize: '12px', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.7)' }}>
            {data.companyName}
          </span>
        </div>
        <span className="text-dim" style={{ fontSize: '10px' }}>CLIENT PORTAL</span>
      </header>

      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        {/* Client header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-polar font-[800]" style={{ fontSize: '22px' }}>{data.client.name}</h1>
            {data.client.service && <span className="text-dim" style={{ fontSize: '12px' }}>{data.client.service}</span>}
          </div>
          <StatusBadge status={data.client.status} />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card">
            <span className="label text-dim">PROJECTS</span>
            <p className="text-polar font-[800] mt-1" style={{ fontSize: '20px' }}>{data.projects.length}</p>
          </div>
          <div className="card">
            <span className="label text-dim">OPEN TASKS</span>
            <p className="text-polar font-[800] mt-1" style={{ fontSize: '20px' }}>{activeTasks.length}</p>
          </div>
          <div className="card">
            <span className="label text-dim">TOTAL INVOICED</span>
            <p className="text-polar font-[800] mt-1" style={{ fontSize: '20px' }}>{fmtCurrency(totalInvoiced)}</p>
          </div>
          <div className="card">
            <span className="label text-dim">OUTSTANDING</span>
            <p className={`font-[800] mt-1 ${outstanding > 0 ? 'text-warn' : 'text-ok'}`} style={{ fontSize: '20px' }}>{fmtCurrency(outstanding)}</p>
          </div>
        </div>

        {/* Projects */}
        {data.projects.length > 0 && (
          <div>
            <h2 className="label-md text-steel mb-3 flex items-center gap-2"><FolderKanban size={13} /> PROJECTS</h2>
            <div className="space-y-2">
              {data.projects.map((p, i) => (
                <div key={i} className="card flex items-center justify-between">
                  <div>
                    <span className="text-polar font-[600]" style={{ fontSize: '13px' }}>{p.title}</span>
                    {p.due_date && <span className="text-dim ml-3" style={{ fontSize: '11px' }}>Due {fmtDate(p.due_date)}</span>}
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tasks */}
        {data.tasks.length > 0 && (
          <div>
            <h2 className="label-md text-steel mb-3 flex items-center gap-2"><ListTodo size={13} /> TASKS</h2>
            <div className="space-y-1.5">
              {activeTasks.map((t, i) => (
                <div key={i} className="card flex items-center gap-3 py-2">
                  <Clock size={12} className="text-warn shrink-0" />
                  <span className="text-polar flex-1" style={{ fontSize: '12px' }}>{t.text}</span>
                  {t.due_date && <span className="text-dim" style={{ fontSize: '10px' }}>{fmtDate(t.due_date)}</span>}
                  <StatusBadge status={t.priority} />
                </div>
              ))}
              {completedTasks.length > 0 && (
                <details className="mt-2">
                  <summary className="text-dim cursor-pointer" style={{ fontSize: '11px' }}>
                    {completedTasks.length} completed task{completedTasks.length !== 1 ? 's' : ''}
                  </summary>
                  <div className="space-y-1.5 mt-2">
                    {completedTasks.map((t, i) => (
                      <div key={i} className="card flex items-center gap-3 py-2 opacity-50">
                        <CheckCircle2 size={12} className="text-ok shrink-0" />
                        <span className="text-dim flex-1 line-through" style={{ fontSize: '12px' }}>{t.text}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        )}

        {/* Invoices */}
        {data.invoices.length > 0 && (
          <div>
            <h2 className="label-md text-steel mb-3 flex items-center gap-2"><FileText size={13} /> INVOICES</h2>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: '12px' }}>
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-dim font-[700] uppercase" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>Invoice</th>
                    <th className="text-right py-2 text-dim font-[700] uppercase" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>Amount</th>
                    <th className="text-center py-2 text-dim font-[700] uppercase" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>Status</th>
                    <th className="text-right py-2 text-dim font-[700] uppercase" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((inv, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="py-2.5 text-polar font-[600]">{inv.num}</td>
                      <td className="py-2.5 text-polar text-right mono">{fmtCurrency(inv.amount)}</td>
                      <td className="py-2.5 text-center"><StatusBadge status={inv.status} /></td>
                      <td className="py-2.5 text-dim text-right">{fmtDate(inv.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border pt-4 mt-8 text-center">
          <p className="text-dim" style={{ fontSize: '10px' }}>
            Powered by {data.companyName} Operations Command Center
          </p>
        </div>
      </div>
    </div>
  )
}
