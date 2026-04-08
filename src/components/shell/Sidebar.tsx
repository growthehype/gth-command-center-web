import { useAppStore } from '@/lib/store'
import {
  Sparkles, LayoutDashboard, Calendar, Building2, Users, Kanban,
  CheckSquare, MessageSquare, Receipt, TrendingUp, LineChart,
  Send, Megaphone, Package, Mail, Target, KeyRound, Palette,
  FileText, BookOpen, Pencil, Activity, Settings, HelpCircle, Link2
} from 'lucide-react'

interface NavItem {
  id: string
  label: string
  icon: React.ComponentType<any>
  badgeKey?: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'COMMAND',
    items: [
      { id: 'briefing', label: 'Briefing', icon: Sparkles },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'calendar', label: 'Calendar', icon: Calendar },
      { id: 'clients', label: 'Clients', icon: Building2, badgeKey: 'activeClients' },
      { id: 'contacts', label: 'Contacts', icon: Users },
      { id: 'projects', label: 'Projects', icon: Kanban, badgeKey: 'openProjects' },
      { id: 'tasks', label: 'Tasks', icon: CheckSquare, badgeKey: 'openTasks' },
      { id: 'meetings', label: 'Meetings', icon: MessageSquare },
    ]
  },
  {
    label: 'REVENUE',
    items: [
      { id: 'invoices', label: 'Invoices', icon: Receipt, badgeKey: 'unpaidInvoices' },
      { id: 'financials', label: 'Financials', icon: TrendingUp },
      { id: 'profitability', label: 'Profitability', icon: LineChart },
    ]
  },
  {
    label: 'GROWTH',
    items: [
      { id: 'outreach', label: 'Outreach', icon: Send, badgeKey: 'openLeads' },
      { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
      { id: 'services', label: 'Services', icon: Package },
      { id: 'templates', label: 'Templates', icon: Mail },
      { id: 'email-templates', label: 'Email Templates', icon: Mail },
      { id: 'goals', label: 'Goals', icon: Target },
    ]
  },
  {
    label: 'VAULT',
    items: [
      { id: 'credentials', label: 'Credentials', icon: KeyRound },
      { id: 'brand-assets', label: 'Brand Assets', icon: Palette },
      { id: 'documents', label: 'Documents', icon: FileText },
    ]
  },
  {
    label: 'OPERATIONS',
    items: [
      { id: 'sops', label: 'SOPs', icon: BookOpen },
      { id: 'notes', label: 'Notes', icon: Pencil },
      { id: 'activity', label: 'Activity', icon: Activity },
      { id: 'settings', label: 'Settings', icon: Settings },
      { id: 'help', label: 'Help & Guide', icon: HelpCircle },
    ]
  },
]

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { currentPage, setCurrentPage, clients, projects, tasks, invoices, leads } = useAppStore()

  const now = new Date()

  const badges: Record<string, number> = {
    activeClients: clients.filter(c => c.status === 'active').length,
    openProjects: projects.filter(p => p.status !== 'done').length,
    openTasks: tasks.filter(t => !t.done).length,
    unpaidInvoices: invoices.filter(i => i.status !== 'paid').length,
    openLeads: leads.filter(l => l.stage !== 'Closed Won' && l.stage !== 'Closed Lost').length,
  }

  const hasOverdue = invoices.some(i => i.status === 'sent' && i.due_date && new Date(i.due_date) < new Date())

  // Notification badge counts
  const overdueTaskCount = tasks.filter(t => !t.done && t.due_date && new Date(t.due_date) < now).length
  const unpaidInvoiceCount = invoices.filter(i => i.status !== 'paid').length
  const overdueFollowUpCount = leads.filter(l => l.next_follow_up && new Date(l.next_follow_up) < now && l.stage !== 'Closed Won' && l.stage !== 'Closed Lost').length

  const notificationBadges: Record<string, { count: number; color: 'red' | 'amber' }> = {
    tasks: { count: overdueTaskCount, color: 'red' },
    invoices: { count: unpaidInvoiceCount, color: 'amber' },
    outreach: { count: overdueFollowUpCount, color: 'amber' },
  }

  return (
    <nav className="sidebar-nav w-full h-full border-r border-border overflow-y-auto flex-shrink-0 select-none" aria-label="Main navigation">
      <div className="py-4">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className="mb-3">
            {/* Divider line above each section (except first) */}
            {groupIndex > 0 && (
              <div className="mx-4 mb-3 border-t border-border/60" />
            )}
            <div
              className="px-5 mb-2 font-sans"
              style={{
                fontSize: '8.5px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase' as const,
                color: 'var(--color-dim)',
                opacity: 0.7,
              }}
            >
              {group.label}
            </div>
            {group.items.map(item => {
              const isActive = currentPage === item.id
              const Icon = item.icon
              const badgeCount = item.badgeKey ? badges[item.badgeKey] : undefined
              const isOverdueInvoice = item.id === 'invoices' && hasOverdue

              const notif = notificationBadges[item.id]
              const notifCount = notif?.count ?? 0

              return (
                <button
                  key={item.id}
                  onClick={() => { setCurrentPage(item.id); onNavigate?.() }}
                  className={`sidebar-nav-item w-full flex items-center gap-3 px-5 py-1.5 text-left relative ${
                    isActive
                      ? 'sidebar-nav-active text-polar bg-surface-2'
                      : 'text-dim hover:text-steel hover:bg-surface'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                >
                  <Icon size={13} strokeWidth={isActive ? 2.5 : 2} className="sidebar-nav-icon" />
                  <span
                    className="relative flex-1 font-sans"
                    style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500 }}
                  >
                    {item.label}
                    {notifCount > 0 && (
                      <span
                        className="absolute -top-1.5 -right-1 min-w-[16px] h-[16px] rounded-full flex items-center justify-center text-white font-bold"
                        style={{
                          fontSize: '9px',
                          lineHeight: 1,
                          padding: '0 4px',
                          backgroundColor: notif.color === 'red' ? '#FF3333' : '#D97706',
                        }}
                      >
                        {notifCount > 99 ? '99+' : notifCount}
                      </span>
                    )}
                  </span>
                  {badgeCount !== undefined && badgeCount > 0 && (
                    <span
                      className={`font-mono px-1.5 py-0.5 ${
                        isOverdueInvoice ? 'text-err bg-err/10' : 'text-dim bg-surface-2'
                      }`}
                      style={{ fontSize: '10px', fontWeight: 700 }}
                    >
                      {badgeCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
