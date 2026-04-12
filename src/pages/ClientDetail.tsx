import { useMemo, useState, useCallback } from 'react'
import {
  ArrowLeft, Building2, Edit3, Mail, Phone, Globe, DollarSign,
  FolderKanban, CheckSquare, Users, Clock, FileText,
  ChevronRight, Link2, Copy, Trash2,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import ClientAvatar from '@/components/ui/ClientAvatar'
import { formatCurrency, relativeDate, daysSince, clientHealth } from '@/lib/utils'
import { portalTokens } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'

/* ========================================
   CONSTANTS
   ======================================== */

const STATUS_BADGE: Record<string, string> = {
  active: 'badge badge-ok',
  prospect: 'badge badge-warn',
  paused: 'badge badge-neutral',
  done: 'badge badge-err',
}

const INV_STATUS_BADGE: Record<string, string> = {
  paid: 'badge badge-ok',
  sent: 'badge badge-warn',
  draft: 'badge badge-neutral',
  overdue: 'badge badge-err',
}

const PROJECT_STATUS_BADGE: Record<string, string> = {
  active: 'badge badge-ok',
  'in-progress': 'badge badge-ok',
  progress: 'badge badge-ok',
  backlog: 'badge badge-warn',
  planning: 'badge badge-warn',
  review: 'badge badge-warn',
  completed: 'badge badge-neutral',
  done: 'badge badge-neutral',
  paused: 'badge badge-err',
  cancelled: 'badge badge-err',
}

/* ========================================
   AVATAR
   ======================================== */

function LargeAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = (name || '?')
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // Deterministic color from name
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360

  return (
    <div
      className="flex items-center justify-center font-bold text-white shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size > 40 ? 12 : 8,
        background: `linear-gradient(135deg, hsl(${hue}, 55%, 45%), hsl(${(hue + 30) % 360}, 55%, 35%))`,
        fontSize: size * 0.36,
        letterSpacing: '0.05em',
      }}
    >
      {initials}
    </div>
  )
}

/* ========================================
   STAT CARD
   ======================================== */

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string
}) {
  return (
    <div className="card flex items-center gap-4 py-4 px-5">
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2, rgba(255,255,255,0.04))' }}
      >
        <Icon size={18} className="text-steel" />
      </div>
      <div className="min-w-0">
        <p className="label text-dim" style={{ fontSize: '10px', letterSpacing: '0.06em' }}>{label}</p>
        <p className="text-polar font-bold" style={{ fontSize: '20px', lineHeight: 1.2 }}>{value}</p>
        {sub && <p className="text-dim" style={{ fontSize: '10px' }}>{sub}</p>}
      </div>
    </div>
  )
}

/* ========================================
   SECTION WRAPPER
   ======================================== */

function Section({ title, icon: Icon, count, onViewAll, children }: {
  title: string; icon: React.ElementType; count: number; onViewAll?: () => void; children: React.ReactNode
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-steel" />
          <h3 className="text-polar font-semibold" style={{ fontSize: '14px' }}>{title}</h3>
          <span className="text-dim mono" style={{ fontSize: '10px' }}>({count})</span>
        </div>
        {onViewAll && count > 0 && (
          <button
            onClick={onViewAll}
            className="text-steel hover:text-polar transition-colors flex items-center gap-1"
            style={{ fontSize: '11px' }}
          >
            View all <ChevronRight size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/* ========================================
   MAIN COMPONENT
   ======================================== */

export default function ClientDetail() {
  const {
    selectedClientId, setSelectedClientId, setCurrentPage,
    clients, tasks, projects, invoices, contacts, activity, timeEntries, meetings,
  } = useAppStore()

  const client = useMemo(
    () => clients.find(c => c.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  )

  // Portal sharing
  const [portalUrl, setPortalUrl] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  const generatePortalLink = useCallback(async () => {
    if (!selectedClientId) return
    setPortalLoading(true)
    try {
      const result = await portalTokens.generate(selectedClientId)
      const url = `${window.location.origin}?portal=${result.token}`
      setPortalUrl(url)
      await navigator.clipboard.writeText(url)
      showToast('Portal link copied to clipboard!', 'success')
    } catch (err) {
      showToast('Failed to generate portal link', 'error')
    }
    setPortalLoading(false)
  }, [selectedClientId])

  const revokePortalLink = useCallback(async () => {
    if (!selectedClientId) return
    try {
      await portalTokens.revoke(selectedClientId)
      setPortalUrl(null)
      showToast('Portal link revoked', 'success')
    } catch {
      showToast('Failed to revoke', 'error')
    }
  }, [selectedClientId])

  // Navigate back
  const goBack = () => {
    setSelectedClientId(null)
    setCurrentPage('clients')
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Building2 size={32} className="text-dim" />
        <p className="text-steel" style={{ fontSize: '14px' }}>Client not found</p>
        <button onClick={goBack} className="btn-ghost flex items-center gap-2">
          <ArrowLeft size={14} /> Back to Clients
        </button>
      </div>
    )
  }

  // Computed data for this client
  const clientProjects = projects.filter(p => p.client_id === client.id)
  const clientTasks = tasks.filter(t => t.client_id === client.id)
  const clientInvoices = invoices.filter(i => i.client_id === client.id)
  const clientContacts = contacts.filter(c => c.client_id === client.id)
  const clientTimeEntries = timeEntries.filter(te => te.client_id === client.id)
  const clientMeetings = meetings.filter(m => m.client_id === client.id)
  const clientActivity = activity.filter(a =>
    a.entity_id === client.id || a.description?.toLowerCase().includes(client.name.toLowerCase())
  )

  // Stats
  const totalRevenue = clientInvoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + (i.amount || 0), 0)
  const activeProjects = clientProjects.filter(p =>
    p.status === 'active' || p.status === 'in-progress' || p.status === 'planning'
  ).length
  const openTasks = clientTasks.filter(t => !t.done).length
  const contactCount = clientContacts.length
  const totalHours = clientTimeEntries.reduce((sum, te) => sum + (te.duration_minutes || 0), 0) / 60

  const days = daysSince(client.last_activity)
  const health = clientHealth(days)

  // Navigation helpers
  const navigateTo = (page: string) => setCurrentPage(page)

  /* ========================================
     RENDER
     ======================================== */

  return (
    <div className="space-y-6 max-w-[1100px]">
      {/* Back button */}
      <button
        onClick={goBack}
        className="text-steel hover:text-polar transition-colors flex items-center gap-2 -mb-2"
        style={{ fontSize: '12px' }}
      >
        <ArrowLeft size={14} /> Back to Clients
      </button>

      {/* ── Header Section ── */}
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <LargeAvatar name={client.name} size={64} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-polar" style={{ fontSize: '24px', fontWeight: 800, lineHeight: 1.2 }}>
                {client.name}
              </h1>
              <span className={STATUS_BADGE[client.status] || 'badge badge-neutral'}>
                {client.status}
              </span>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: health.color }}
                title={`${health.label} (${days === Infinity ? 'no activity' : days + 'd ago'})`}
              />
            </div>

            {/* Contact info row */}
            <div className="flex items-center gap-4 mt-2 flex-wrap" style={{ fontSize: '12px' }}>
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="text-steel hover:text-polar transition-colors flex items-center gap-1.5"
                >
                  <Mail size={12} /> {client.email}
                </a>
              )}
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="text-steel hover:text-polar transition-colors flex items-center gap-1.5"
                >
                  <Phone size={12} /> {client.phone}
                </a>
              )}
              {client.website && (
                <a
                  href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-steel hover:text-polar transition-colors flex items-center gap-1.5"
                >
                  <Globe size={12} /> {client.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-4 mt-2 flex-wrap text-dim" style={{ fontSize: '11px' }}>
              {client.service && <span>Service: <span className="text-steel">{client.service}</span></span>}
              {client.platform && <span>Platform: <span className="text-steel">{client.platform}</span></span>}
              {client.retainer && <span>Retainer: <span className="text-steel">{client.retainer}</span></span>}
              {client.mrr > 0 && <span>MRR: <span className="text-steel mono">{formatCurrency(client.mrr)}</span></span>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={generatePortalLink}
                disabled={portalLoading}
                className="btn-ghost flex items-center gap-2"
                style={{ fontSize: '11px' }}
                title="Generate a read-only portal link for this client"
              >
                <Link2 size={12} /> {portalLoading ? 'Generating...' : 'Share Portal'}
              </button>
              <button
                onClick={() => {
                  setCurrentPage('clients')
                }}
                className="btn-ghost flex items-center gap-2"
                style={{ fontSize: '11px' }}
              >
                <Edit3 size={12} /> Edit Client
              </button>
            </div>
            {portalUrl && (
              <div className="flex items-center gap-2 bg-surface border border-border px-2 py-1">
                <span className="mono text-dim truncate" style={{ fontSize: '10px', maxWidth: '200px' }}>{portalUrl}</span>
                <button onClick={() => { navigator.clipboard.writeText(portalUrl); showToast('Copied!', 'success') }} className="text-dim hover:text-polar transition-colors cursor-pointer"><Copy size={10} /></button>
                <button onClick={revokePortalLink} className="text-dim hover:text-err transition-colors cursor-pointer" title="Revoke link"><Trash2 size={10} /></button>
              </div>
            )}
          </div>
        </div>

        {/* Notes preview */}
        {client.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-dim label" style={{ fontSize: '10px', marginBottom: 4 }}>Notes</p>
            <p className="text-steel" style={{ fontSize: '12px', lineHeight: 1.6 }}>
              {client.notes.length > 200 ? client.notes.slice(0, 200) + '...' : client.notes}
            </p>
          </div>
        )}
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={DollarSign}
          label="TOTAL REVENUE"
          value={formatCurrency(totalRevenue)}
          sub={`${clientInvoices.filter(i => i.status === 'paid').length} paid invoices`}
        />
        <StatCard
          icon={FolderKanban}
          label="ACTIVE PROJECTS"
          value={activeProjects}
          sub={`${clientProjects.length} total`}
        />
        <StatCard
          icon={CheckSquare}
          label="OPEN TASKS"
          value={openTasks}
          sub={`${clientTasks.length} total`}
        />
        <StatCard
          icon={Users}
          label="CONTACTS"
          value={contactCount}
          sub={clientContacts.filter(c => c.is_primary).length > 0 ? `${clientContacts.filter(c => c.is_primary).length} primary` : undefined}
        />
      </div>

      {/* ── Projects Section ── */}
      <Section
        title="Projects"
        icon={FolderKanban}
        count={clientProjects.length}
        onViewAll={() => navigateTo('projects')}
      >
        {clientProjects.length === 0 ? (
          <p className="text-dim" style={{ fontSize: '12px' }}>No projects yet.</p>
        ) : (
          <div className="space-y-0">
            {clientProjects.slice(0, 5).map(p => (
              <div key={p.id} onClick={() => navigateTo('projects')} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-[var(--surface-2,rgba(255,255,255,0.04))] transition-colors rounded px-1 -mx-1">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-polar font-medium truncate" style={{ fontSize: '12px' }}>{p.title}</span>
                  <span className={PROJECT_STATUS_BADGE[p.status] || 'badge badge-neutral'} style={{ fontSize: '9px' }}>
                    {p.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-dim" style={{ fontSize: '11px' }}>
                  {p.due_date && <span>{relativeDate(p.due_date)}</span>}
                  {p.hours > 0 && <span className="mono">{p.hours}h</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Tasks Section ── */}
      <Section
        title="Tasks"
        icon={CheckSquare}
        count={clientTasks.length}
        onViewAll={() => navigateTo('tasks')}
      >
        {clientTasks.length === 0 ? (
          <p className="text-dim" style={{ fontSize: '12px' }}>No tasks yet.</p>
        ) : (
          <div className="space-y-0">
            {clientTasks.slice(0, 5).map(t => (
              <div key={t.id} onClick={() => navigateTo('tasks')} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-[var(--surface-2,rgba(255,255,255,0.04))] transition-colors rounded px-1 -mx-1">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-block w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center"
                    style={{
                      borderColor: t.done ? '#22C55E' : 'var(--border)',
                      backgroundColor: t.done ? '#22C55E' : 'transparent',
                    }}
                  >
                    {t.done ? (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  <span
                    className={`truncate ${t.done ? 'text-dim line-through' : 'text-polar'}`}
                    style={{ fontSize: '12px' }}
                  >
                    {t.text}
                  </span>
                  {t.priority === 'high' && (
                    <span className="badge badge-err" style={{ fontSize: '9px' }}>high</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-dim" style={{ fontSize: '11px' }}>
                  {t.due_date && <span>{relativeDate(t.due_date)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Invoices Section ── */}
      <Section
        title="Invoices"
        icon={FileText}
        count={clientInvoices.length}
        onViewAll={() => navigateTo('invoices')}
      >
        {clientInvoices.length === 0 ? (
          <p className="text-dim" style={{ fontSize: '12px' }}>No invoices yet.</p>
        ) : (
          <div className="space-y-0">
            {clientInvoices.slice(0, 5).map(inv => (
              <div key={inv.id} onClick={() => navigateTo('invoices')} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-[var(--surface-2,rgba(255,255,255,0.04))] transition-colors rounded px-1 -mx-1">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-polar mono font-medium" style={{ fontSize: '12px' }}>{inv.num}</span>
                  <span className={INV_STATUS_BADGE[inv.status] || 'badge badge-neutral'} style={{ fontSize: '9px' }}>
                    {inv.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 shrink-0" style={{ fontSize: '11px' }}>
                  <span className="text-polar mono font-semibold">{formatCurrency(inv.amount)}</span>
                  <span className="text-dim">
                    {inv.status === 'paid' && inv.paid_at
                      ? `Paid ${relativeDate(inv.paid_at)}`
                      : inv.due_date
                        ? `Due ${relativeDate(inv.due_date)}`
                        : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Contacts Section ── */}
      <Section
        title="Contacts"
        icon={Users}
        count={clientContacts.length}
        onViewAll={() => navigateTo('contacts')}
      >
        {clientContacts.length === 0 ? (
          <p className="text-dim" style={{ fontSize: '12px' }}>No contacts linked.</p>
        ) : (
          <div className="space-y-0">
            {clientContacts.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <ClientAvatar name={c.name} size="sm" />
                  <div className="min-w-0">
                    <span className="text-polar font-medium truncate block" style={{ fontSize: '12px' }}>
                      {c.name}
                      {c.is_primary ? <span className="badge badge-ok ml-2" style={{ fontSize: '8px' }}>Primary</span> : null}
                    </span>
                    {c.role && <span className="text-dim block" style={{ fontSize: '10px' }}>{c.role}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-dim" style={{ fontSize: '11px' }}>
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="hover:text-polar transition-colors">
                      <Mail size={12} />
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="hover:text-polar transition-colors">
                      <Phone size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Activity Section ── */}
      <Section
        title="Recent Activity"
        icon={Clock}
        count={clientActivity.length}
        onViewAll={() => navigateTo('activity')}
      >
        {clientActivity.length === 0 ? (
          <p className="text-dim" style={{ fontSize: '12px' }}>No activity recorded.</p>
        ) : (
          <div className="space-y-0">
            {clientActivity.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: a.type === 'create' ? '#22C55E' : a.type === 'delete' ? '#FF3333' : '#F59E0B' }}
                  />
                  <span className="text-steel truncate" style={{ fontSize: '12px' }}>
                    {a.description}
                  </span>
                </div>
                <span className="text-dim shrink-0" style={{ fontSize: '10px' }}>
                  {relativeDate(a.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Time Tracking Summary ── */}
      {clientTimeEntries.length > 0 && (
        <Section
          title="Time Tracking"
          icon={Clock}
          count={clientTimeEntries.length}
          onViewAll={() => navigateTo('projects')}
        >
          <div className="flex items-center gap-6 mb-3">
            <div>
              <p className="text-dim label" style={{ fontSize: '10px' }}>Total Hours</p>
              <p className="text-polar font-bold mono" style={{ fontSize: '18px' }}>{totalHours.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-dim label" style={{ fontSize: '10px' }}>Entries</p>
              <p className="text-polar font-bold mono" style={{ fontSize: '18px' }}>{clientTimeEntries.length}</p>
            </div>
            <div>
              <p className="text-dim label" style={{ fontSize: '10px' }}>Billable</p>
              <p className="text-polar font-bold mono" style={{ fontSize: '18px' }}>
                {clientTimeEntries.filter(te => te.billable).length}
              </p>
            </div>
          </div>
          <div className="space-y-0">
            {clientTimeEntries.slice(0, 3).map(te => (
              <div key={te.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="min-w-0">
                  <span className="text-polar truncate block" style={{ fontSize: '12px' }}>
                    {te.notes || te.project_title || 'Untitled'}
                  </span>
                  <span className="text-dim" style={{ fontSize: '10px' }}>{relativeDate(te.started_at)}</span>
                </div>
                <span className="text-steel mono shrink-0" style={{ fontSize: '11px' }}>
                  {te.duration_minutes ? `${(te.duration_minutes / 60).toFixed(1)}h` : 'Running'}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Meetings Section ── */}
      {clientMeetings.length > 0 && (
        <Section
          title="Meetings"
          icon={Users}
          count={clientMeetings.length}
          onViewAll={() => navigateTo('meetings')}
        >
          <div className="space-y-0">
            {clientMeetings.slice(0, 3).map(m => (
              <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                <div className="min-w-0">
                  <span className="text-polar font-medium truncate block" style={{ fontSize: '12px' }}>{m.title}</span>
                  <span className="text-dim" style={{ fontSize: '10px' }}>{m.type} &middot; {relativeDate(m.date)}</span>
                </div>
                {m.contact_name && (
                  <span className="text-dim shrink-0" style={{ fontSize: '10px' }}>
                    w/ {m.contact_name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
