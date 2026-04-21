import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import {
  Sparkles, LayoutDashboard, Calendar, Building2, Users, Kanban,
  CheckSquare, MessageSquare, Receipt, TrendingUp, LineChart,
  Send, Megaphone, Package, Mail, Target, KeyRound, Palette,
  FileText, BookOpen, Pencil, Activity, Settings, HelpCircle, Link2,
  Inbox, HardDrive, Bot, ChevronDown, Search, Pin, PinOff, Clock,
  PanelLeftClose, PanelLeft, Plus, ChevronRight, X, Shield, LogOut
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface NavItem {
  id: string
  label: string
  icon: React.ComponentType<any>
  badgeKey?: string
  shortcut?: string // e.g. 'd' for G+D
}

interface NavGroup {
  key: string
  label: string
  items: NavItem[]
  quickCreateAction?: string // optional quick-create trigger
}

const navGroups: NavGroup[] = [
  {
    key: 'command',
    label: 'Command',
    items: [
      { id: 'briefing', label: 'Briefing', icon: Sparkles, shortcut: 'b' },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'd' },
      { id: 'calendar', label: 'Calendar', icon: Calendar, shortcut: 'c' },
      { id: 'clients', label: 'Clients', icon: Building2, badgeKey: 'activeClients', shortcut: 'l' },
      { id: 'contacts', label: 'Contacts', icon: Users, shortcut: 'n' },
      { id: 'projects', label: 'Projects', icon: Kanban, badgeKey: 'openProjects', shortcut: 'p' },
      { id: 'tasks', label: 'Tasks', icon: CheckSquare, badgeKey: 'openTasks', shortcut: 't' },
      { id: 'meetings', label: 'Meetings', icon: MessageSquare, shortcut: 'm' },
      { id: 'gmail', label: 'Gmail', icon: Inbox, shortcut: 'e' },
      { id: 'drive', label: 'Google Drive', icon: HardDrive },
      { id: 'agents', label: 'AI Agents', icon: Bot, shortcut: 'a' },
    ],
    quickCreateAction: 'quickAdd',
  },
  {
    key: 'revenue',
    label: 'Revenue',
    items: [
      { id: 'invoices', label: 'Invoices', icon: Receipt, badgeKey: 'unpaidInvoices', shortcut: 'i' },
      { id: 'financials', label: 'Financials', icon: TrendingUp },
      { id: 'profitability', label: 'Profitability', icon: LineChart },
    ],
    quickCreateAction: 'newInvoice',
  },
  {
    key: 'growth',
    label: 'Growth',
    items: [
      { id: 'outreach', label: 'Outreach', icon: Send, badgeKey: 'openLeads', shortcut: 'o' },
      { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
      { id: 'services', label: 'Services', icon: Package },
      { id: 'templates', label: 'Templates', icon: Mail },
      { id: 'email-templates', label: 'Email Templates', icon: Mail },
      { id: 'goals', label: 'Goals', icon: Target, shortcut: 'g' },
    ],
  },
  {
    key: 'vault',
    label: 'Vault',
    items: [
      { id: 'credentials', label: 'Credentials', icon: KeyRound, shortcut: 'k' },
      { id: 'brand-assets', label: 'Brand Assets', icon: Palette },
      { id: 'documents', label: 'Documents', icon: FileText },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    items: [
      { id: 'sops', label: 'SOPs', icon: BookOpen },
      { id: 'notes', label: 'Notes', icon: Pencil },
      { id: 'activity', label: 'Activity', icon: Activity },
      { id: 'team', label: 'Team', icon: Users },
      { id: 'integrations-settings', label: 'Integrations', icon: Link2 },
      { id: 'settings', label: 'Settings', icon: Settings, shortcut: 's' },
      { id: 'help', label: 'Help & Guide', icon: HelpCircle, shortcut: '?' },
    ],
  },
  // Admin-only section — only rendered for users whose email is in
  // VITE_ADMIN_EMAILS (see filter in the Sidebar component below).
  {
    key: 'admin',
    label: 'Admin',
    items: [
      { id: 'admin-customers', label: 'Customers', icon: Shield },
    ],
  },
]

// Admin gate: only render the 'admin' group for these emails.
// Comma-separated list in the Vite env var; falls back to empty (no admin UI).
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS as string || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

// Flat lookup for all items
const ALL_ITEMS: NavItem[] = navGroups.flatMap(g => g.items)
const ITEM_BY_ID: Record<string, NavItem> = Object.fromEntries(ALL_ITEMS.map(i => [i.id, i]))
const MAX_RECENTS = 4
const MAX_PINNED = 8

// localStorage keys
const LS_PINNED = 'gth_sb_pinned'
const LS_RECENTS = 'gth_sb_recents'
const LS_COLLAPSED = 'gth_sb_collapsed'
const LS_MINIMIZED = 'gth_sb_minimized'
const LS_WIDTH = 'gth_sb_width'
const LS_DENSITY = 'gth_sb_density'

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) as T : fallback
  } catch { return fallback }
}

// ─── Simple fuzzy match ───
function fuzzyMatch(needle: string, haystack: string): boolean {
  if (!needle) return true
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (h.includes(n)) return true
  // Subsequence match (fuzzy)
  let i = 0
  for (const c of h) {
    if (c === n[i]) i++
    if (i === n.length) return true
  }
  return false
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { currentPage, setCurrentPage, clients, projects, tasks, invoices, leads, settings, setCommandPaletteOpen, user } = useAppStore()

  // Hide the Admin group from non-admins. Admins are listed in VITE_ADMIN_EMAILS.
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase())
  const visibleGroups = isAdmin ? navGroups : navGroups.filter((g) => g.key !== 'admin')

  const now = new Date()

  // ── Persistent UI state ──
  const [pinned, setPinned] = useState<string[]>(() => loadJSON(LS_PINNED, [] as string[]))
  const [recents, setRecents] = useState<string[]>(() => loadJSON(LS_RECENTS, [] as string[]))
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadJSON(LS_COLLAPSED, {}))
  const [minimized, setMinimized] = useState<boolean>(() => loadJSON(LS_MINIMIZED, false))
  const [width, setWidth] = useState<number>(() => loadJSON(LS_WIDTH, 216))
  const [density, setDensity] = useState<'compact' | 'normal' | 'spacious'>(() => loadJSON(LS_DENSITY, 'normal'))
  const [search, setSearch] = useState('')

  const searchInputRef = useRef<HTMLInputElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)

  // ── Persist on change ──
  useEffect(() => { localStorage.setItem(LS_PINNED, JSON.stringify(pinned)) }, [pinned])
  useEffect(() => { localStorage.setItem(LS_RECENTS, JSON.stringify(recents)) }, [recents])
  useEffect(() => { localStorage.setItem(LS_COLLAPSED, JSON.stringify(collapsed)) }, [collapsed])
  useEffect(() => { localStorage.setItem(LS_MINIMIZED, JSON.stringify(minimized)) }, [minimized])
  useEffect(() => { localStorage.setItem(LS_WIDTH, JSON.stringify(width)) }, [width])
  useEffect(() => { localStorage.setItem(LS_DENSITY, JSON.stringify(density)) }, [density])

  // Expose width to CSS (used by Shell)
  useEffect(() => {
    document.documentElement.style.setProperty('--sb-w', minimized ? '56px' : `${width}px`)
  }, [width, minimized])

  // Auto-track recents when currentPage changes
  useEffect(() => {
    if (!ITEM_BY_ID[currentPage]) return
    setRecents(prev => {
      const next = [currentPage, ...prev.filter(p => p !== currentPage)].slice(0, MAX_RECENTS)
      return next
    })
  }, [currentPage])

  // Navigate helper
  const navigate = useCallback((id: string) => {
    setCurrentPage(id)
    onNavigate?.()
  }, [setCurrentPage, onNavigate])

  // ── Keyboard shortcuts ──
  // G, then letter within 1s → jump to page. Complements Shell's built-in
  // G-map with the extra pages defined via `shortcut` on NavItem.
  useEffect(() => {
    let gPressed = false
    let gTimer: ReturnType<typeof setTimeout> | null = null

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key.toLowerCase() === 'g' && !gPressed) {
        gPressed = true
        if (gTimer) clearTimeout(gTimer)
        gTimer = setTimeout(() => { gPressed = false }, 1200)
        return
      }

      if (gPressed) {
        gPressed = false
        if (gTimer) clearTimeout(gTimer)
        const key = e.key.toLowerCase()
        const item = ALL_ITEMS.find(i => i.shortcut === key)
        if (item) navigate(item.id)
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (gTimer) clearTimeout(gTimer)
    }
  }, [navigate])

  // ── Resize handle ──
  const resizing = useRef(false)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return
      const newW = Math.max(180, Math.min(320, e.clientX))
      setWidth(newW)
    }
    const onUp = () => {
      resizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Toggles ──
  const toggleGroup = useCallback((key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const togglePin = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinned(prev => prev.includes(id)
      ? prev.filter(p => p !== id)
      : [...prev, id].slice(-MAX_PINNED)
    )
  }, [])

  const cycleDensity = useCallback(() => {
    setDensity(d => d === 'compact' ? 'normal' : d === 'normal' ? 'spacious' : 'compact')
  }, [])

  // Sign out: clear Supabase session + wipe local caches (demo flag, Gmail
  // localStorage). Reloads to drop you on the login screen.
  const handleSignOut = useCallback(async () => {
    const confirmed = window.confirm('Sign out of Command Center?')
    if (!confirmed) return
    try {
      await supabase.auth.signOut()
    } catch { /* proceed even if the signOut call fails */ }
    try {
      localStorage.removeItem('gth_demo_mode')
      localStorage.removeItem('gth_gmail_token')
      localStorage.removeItem('gth_gmail_ever_connected')
    } catch { /* ignore */ }
    window.location.reload()
  }, [])

  // ── Derived data ──

  const badges: Record<string, number> = {
    activeClients: clients.filter(c => c.status === 'active').length,
    openProjects: projects.filter(p => p.status !== 'done').length,
    openTasks: tasks.filter(t => !t.done).length,
    unpaidInvoices: invoices.filter(i => i.status !== 'paid').length,
    openLeads: leads.filter(l => l.stage !== 'Closed Won' && l.stage !== 'Closed Lost').length,
  }

  const hasOverdue = invoices.some(i => i.status === 'sent' && i.due_date && new Date(i.due_date) < now)

  const overdueTaskCount = tasks.filter(t => !t.done && t.due_date && new Date(t.due_date) < now).length
  const unpaidInvoiceCount = invoices.filter(i => i.status !== 'paid').length
  const overdueFollowUpCount = leads.filter(l => l.next_follow_up && new Date(l.next_follow_up) < now && l.stage !== 'Closed Won' && l.stage !== 'Closed Lost').length

  const notificationBadges: Record<string, { count: number; color: 'red' | 'amber' }> = {
    tasks: { count: overdueTaskCount, color: 'red' },
    invoices: { count: unpaidInvoiceCount, color: 'amber' },
    outreach: { count: overdueFollowUpCount, color: 'amber' },
  }

  const groupNotifCount = (g: NavGroup): number =>
    g.items.reduce((sum, i) => sum + (notificationBadges[i.id]?.count ?? 0), 0)

  // ── Search filter ──
  const searchMatches = useMemo(() => {
    if (!search) return null
    return ALL_ITEMS.filter(i => fuzzyMatch(search, i.label))
  }, [search])

  // ── User profile ──
  const displayName = settings.display_name || 'User'
  const userInitials = settings.avatar_initials || displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  // ── AI agent live indicator (polls localStorage flag that agents can set) ──
  const [agentRunning, setAgentRunning] = useState<boolean>(false)
  useEffect(() => {
    const check = () => {
      try {
        const running = localStorage.getItem('gth_agent_running') === 'true'
        setAgentRunning(running)
      } catch { /* noop */ }
    }
    check()
    const i = setInterval(check, 3000)
    window.addEventListener('storage', check)
    return () => { clearInterval(i); window.removeEventListener('storage', check) }
  }, [])

  // ── Quick-create handlers ──
  const handleQuickCreate = (action: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (action === 'quickAdd') {
      // Open quick-add modal via global event
      window.dispatchEvent(new CustomEvent('gth:quick-add'))
    } else if (action === 'newInvoice') {
      navigate('invoices')
      window.dispatchEvent(new CustomEvent('gth:new-invoice'))
    }
  }

  // ── Render a single item (reused for pinned/recents/group items) ──
  const renderItem = (item: NavItem, opts?: { showPin?: boolean; inPinnedSection?: boolean }) => {
    const isActive = currentPage === item.id
    const Icon = item.icon
    const badgeCount = item.badgeKey ? badges[item.badgeKey] : undefined
    const isOverdueInvoice = item.id === 'invoices' && hasOverdue
    const notif = notificationBadges[item.id]
    const notifCount = notif?.count ?? 0
    const isPinned = pinned.includes(item.id)
    const isAgent = item.id === 'agents'

    return (
      <button
        key={(opts?.inPinnedSection ? 'p-' : '') + item.id}
        onClick={() => navigate(item.id)}
        className={`sb-item ${isActive ? 'sb-item--active' : ''} ${minimized ? 'sb-item--mini' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
        title={minimized ? `${item.label}${item.shortcut ? ` (G ${item.shortcut.toUpperCase()})` : ''}` : undefined}
      >
        <span className={`sb-item-icon ${isActive ? 'sb-item-icon--active' : ''}`}>
          <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
          {isAgent && agentRunning && <span className="sb-live-dot" />}
        </span>

        {!minimized && (
          <>
            <span className="sb-item-label">{item.label}</span>

            {/* shortcut hint */}
            {item.shortcut && !isActive && !notifCount && !badgeCount && (
              <span className="sb-shortcut">G{item.shortcut.toUpperCase()}</span>
            )}

            {/* Badges */}
            {notifCount > 0 ? (
              <span
                className="sb-badge sb-badge--notif"
                style={{ backgroundColor: notif.color === 'red' ? '#FF3333' : '#D97706' }}
              >
                {notifCount > 99 ? '99+' : notifCount}
              </span>
            ) : badgeCount !== undefined && badgeCount > 0 ? (
              <span className={`sb-badge ${isOverdueInvoice ? 'sb-badge--overdue' : 'sb-badge--count'}`}>
                {badgeCount}
              </span>
            ) : null}

            {/* Pin toggle on hover */}
            {opts?.showPin !== false && (
              <span
                className={`sb-pin ${isPinned ? 'sb-pin--pinned' : ''}`}
                onClick={(e) => togglePin(item.id, e)}
                title={isPinned ? 'Unpin' : 'Pin to top'}
                role="button"
                aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
              >
                {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
              </span>
            )}
          </>
        )}
      </button>
    )
  }

  return (
    <nav
      ref={sidebarRef}
      className={`sb sb--${density} ${minimized ? 'sb--minimized' : ''} w-full h-full overflow-hidden flex-shrink-0 select-none flex flex-col`}
      aria-label="Main navigation"
    >
      {/* ── Header: collapse toggle + search ── */}
      <div className="sb-header">
        <button
          onClick={() => setMinimized(m => !m)}
          className="sb-icon-btn"
          title={minimized ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={minimized ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {minimized ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
        </button>

        {!minimized && (
          <div className="sb-search">
            <Search size={12} className="sb-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search or jump..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setSearch(''); (e.target as HTMLInputElement).blur() }
                if (e.key === 'Enter' && searchMatches && searchMatches.length > 0) {
                  navigate(searchMatches[0].id)
                  setSearch('')
                }
                if (e.key === 'Enter' && !search) {
                  setCommandPaletteOpen(true)
                }
              }}
              className="sb-search-input"
            />
            {search && (
              <button className="sb-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="sb-body">
        {/* ── Search results ── */}
        {searchMatches && (
          <div className="sb-group">
            <div className="sb-group-header sb-group-header--static">
              <span className="sb-group-label">
                {searchMatches.length} {searchMatches.length === 1 ? 'result' : 'results'}
              </span>
            </div>
            <div className="sb-group-items">
              {searchMatches.length === 0 ? (
                <div className="sb-empty">No pages match "{search}"</div>
              ) : (
                searchMatches.map(item => renderItem(item, { showPin: false }))
              )}
            </div>
          </div>
        )}

        {/* ── Pinned section ── */}
        {!searchMatches && pinned.length > 0 && (
          <div className="sb-group">
            <div className="sb-group-header sb-group-header--static">
              <Pin size={10} className="sb-group-icon" />
              <span className="sb-group-label">Pinned</span>
            </div>
            <div className="sb-group-items">
              {pinned.map(id => ITEM_BY_ID[id] ? renderItem(ITEM_BY_ID[id], { inPinnedSection: true }) : null)}
            </div>
          </div>
        )}

        {/* ── Recently visited ── */}
        {!searchMatches && !minimized && recents.filter(r => r !== currentPage && !pinned.includes(r)).length > 0 && (
          <div className="sb-group">
            <div className="sb-group-header sb-group-header--static">
              <Clock size={10} className="sb-group-icon" />
              <span className="sb-group-label">Recent</span>
            </div>
            <div className="sb-group-items">
              {recents.filter(r => r !== currentPage && !pinned.includes(r)).slice(0, 3).map(id =>
                ITEM_BY_ID[id] ? renderItem(ITEM_BY_ID[id]) : null
              )}
            </div>
          </div>
        )}

        {/* ── Groups ── */}
        {!searchMatches && visibleGroups.map((group) => {
          const isCollapsed = collapsed[group.key] ?? false
          const notifCount = groupNotifCount(group)

          return (
            <div key={group.key} className="sb-group">
              <button
                onClick={() => toggleGroup(group.key)}
                className="sb-group-header"
                aria-expanded={!isCollapsed}
              >
                <span className="sb-group-label">{group.label}</span>

                {/* Show notif count (not just dot) when collapsed */}
                {isCollapsed && notifCount > 0 && (
                  <span className="sb-group-notif">{notifCount > 99 ? '99+' : notifCount}</span>
                )}

                {/* Quick-create + button */}
                {!minimized && group.quickCreateAction && !isCollapsed && (
                  <span
                    onClick={(e) => handleQuickCreate(group.quickCreateAction!, e)}
                    className="sb-group-add"
                    title="Quick create"
                    role="button"
                  >
                    <Plus size={11} />
                  </span>
                )}

                <ChevronDown
                  size={12}
                  className={`sb-group-chevron ${isCollapsed ? 'sb-group-chevron--collapsed' : ''}`}
                />
              </button>

              <div className={`sb-group-items ${isCollapsed ? 'sb-group-items--collapsed' : ''}`}>
                {group.items.map(item => renderItem(item))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Footer: user profile + density toggle ── */}
      <div className="sb-footer">
        <button
          onClick={() => navigate('settings')}
          className={`sb-user ${minimized ? 'sb-user--mini' : ''}`}
          title={minimized ? `${displayName} • Settings` : 'Open settings'}
        >
          <div className="sb-avatar">{userInitials}</div>
          {!minimized && (
            <>
              <div className="sb-user-info">
                <div className="sb-user-name">{displayName}</div>
                <div className="sb-user-sub">Settings</div>
              </div>
              <Settings size={12} className="sb-user-cog" />
            </>
          )}
        </button>

        {!minimized && (
          <button
            onClick={cycleDensity}
            className="sb-icon-btn sb-density-btn"
            title={`Density: ${density} (click to cycle)`}
            aria-label="Cycle density"
          >
            <div className="sb-density-icon">
              <div className="sb-density-bar" />
              <div className="sb-density-bar" />
              <div className="sb-density-bar" />
            </div>
          </button>
        )}
        <button
          onClick={handleSignOut}
          className="sb-icon-btn"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={14} />
        </button>
      </div>

      {/* ── Resize handle (desktop only) ── */}
      {!minimized && (
        <div
          className="sb-resize-handle"
          onMouseDown={() => {
            resizing.current = true
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
          title="Drag to resize"
        />
      )}
    </nav>
  )
}
