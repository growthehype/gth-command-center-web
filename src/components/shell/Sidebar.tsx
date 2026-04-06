import { useAppStore } from '@/lib/store'
import {
  Sparkles, LayoutDashboard, Calendar, Building2, Users, Kanban,
  CheckSquare, MessageSquare, Receipt, TrendingUp, LineChart,
  Send, Megaphone, Package, Mail, Target, KeyRound, Palette,
  FileText, BookOpen, Pencil, Activity, Settings
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
    ]
  },
]

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { currentPage, setCurrentPage, clients, projects, tasks, invoices, leads } = useAppStore()

  const badges: Record<string, number> = {
    activeClients: clients.filter(c => c.status === 'active').length,
    openProjects: projects.filter(p => p.status !== 'done').length,
    openTasks: tasks.filter(t => !t.done).length,
    unpaidInvoices: invoices.filter(i => i.status !== 'paid').length,
    openLeads: leads.filter(l => l.stage !== 'closed-won' && l.stage !== 'closed-lost').length,
  }

  const hasOverdue = invoices.some(i => i.status === 'sent' && i.due_date && new Date(i.due_date) < new Date())

  return (
    <nav className="w-full h-full bg-obsidian border-r border-border overflow-y-auto flex-shrink-0 select-none">
      <div className="py-4">
        {navGroups.map(group => (
          <div key={group.label} className="mb-3">
            <div
              className="px-5 mb-1.5 text-dim font-sans"
              style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.22em' }}
            >
              {group.label}
            </div>
            {group.items.map(item => {
              const isActive = currentPage === item.id
              const Icon = item.icon
              const badgeCount = item.badgeKey ? badges[item.badgeKey] : undefined
              const isOverdueInvoice = item.id === 'invoices' && hasOverdue

              return (
                <button
                  key={item.id}
                  onClick={() => { setCurrentPage(item.id); onNavigate?.() }}
                  className={`w-full flex items-center gap-3 px-5 py-1.5 transition-colors text-left ${
                    isActive
                      ? 'text-polar bg-surface-2'
                      : 'text-dim hover:text-steel hover:bg-surface'
                  }`}
                >
                  <Icon size={13} strokeWidth={isActive ? 2.5 : 2} />
                  <span
                    className="flex-1 font-sans"
                    style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500 }}
                  >
                    {item.label}
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
