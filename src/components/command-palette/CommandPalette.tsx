import { useState, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { fuzzyMatch } from '@/lib/utils'
import {
  Search, Users, FolderKanban, CheckSquare, FileText, Calendar,
  Target, Mail, Megaphone, UserCircle, Briefcase, LayoutTemplate,
  Shield, BookOpen, FileBox, StickyNote, BarChart3, TrendingUp,
  Clock, Settings, Zap, Plus, ArrowRight, Lock, Sparkles,
  DollarSign, Palette
} from 'lucide-react'

interface CommandItem {
  id: string
  label: string
  sublabel?: string
  icon: React.ComponentType<any>
  type: 'navigation' | 'action' | 'entity'
  action: () => void
}

export default function CommandPalette() {
  const {
    commandPaletteOpen, setCommandPaletteOpen,
    clients, tasks, projects, invoices, contacts, leads,
    setCurrentPage, setSelectedClientId, setAiPanelOpen,
  } = useAppStore()

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset on open
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  const close = () => setCommandPaletteOpen(false)

  // Build items
  const allItems = useMemo((): CommandItem[] => {
    const items: CommandItem[] = []

    // Navigation commands
    const pages: [string, string, React.ComponentType<any>][] = [
      ['briefing', 'Daily Briefing', Zap],
      ['dashboard', 'Dashboard', BarChart3],
      ['calendar', 'Calendar', Calendar],
      ['clients', 'Clients', Users],
      ['contacts', 'Contacts', UserCircle],
      ['projects', 'Projects', FolderKanban],
      ['tasks', 'Tasks', CheckSquare],
      ['meetings', 'Meetings', Clock],
      ['invoices', 'Invoices', FileText],
      ['financials', 'Financials', DollarSign],
      ['profitability', 'Profitability', TrendingUp],
      ['outreach', 'Outreach', Mail],
      ['campaigns', 'Campaigns', Megaphone],
      ['services', 'Services', Briefcase],
      ['templates', 'Templates', LayoutTemplate],
      ['goals', 'Goals', Target],
      ['credentials', 'Credentials', Shield],
      ['brand-assets', 'Brand Assets', Palette],
      ['documents', 'Documents', FileBox],
      ['sops', 'SOPs', BookOpen],
      ['notes', 'Notes', StickyNote],
      ['activity', 'Activity Log', Clock],
      ['settings', 'Settings', Settings],
    ]

    pages.forEach(([page, label, icon]) => {
      items.push({
        id: `nav-${page}`,
        label: `Go to ${label}`,
        icon,
        type: 'navigation',
        action: () => { setCurrentPage(page); close() },
      })
    })

    // Action commands
    items.push(
      { id: 'action-ai', label: 'Open AI Assist', icon: Sparkles, type: 'action', action: () => { setAiPanelOpen(true); close() } },
      { id: 'action-new-task', label: 'New Task', sublabel: 'Create a task', icon: Plus, type: 'action', action: () => { setCurrentPage('tasks'); close() } },
      { id: 'action-new-project', label: 'New Project', sublabel: 'Create a project', icon: Plus, type: 'action', action: () => { setCurrentPage('projects'); close() } },
      { id: 'action-new-invoice', label: 'New Invoice', sublabel: 'Create an invoice', icon: Plus, type: 'action', action: () => { setCurrentPage('invoices'); close() } },
      { id: 'action-new-client', label: 'New Client', sublabel: 'Add a client', icon: Plus, type: 'action', action: () => { setCurrentPage('clients'); close() } },
      { id: 'action-new-event', label: 'New Event', sublabel: 'Add calendar event', icon: Plus, type: 'action', action: () => { setCurrentPage('calendar'); close() } },
    )

    // Entity search: clients
    clients.forEach(c => {
      items.push({
        id: `client-${c.id}`,
        label: c.name,
        sublabel: c.service || 'Client',
        icon: Users,
        type: 'entity',
        action: () => { setSelectedClientId(c.id); setCurrentPage('clients'); close() },
      })
    })

    // Entity search: tasks
    tasks.filter(t => !t.done).forEach(t => {
      items.push({
        id: `task-${t.id}`,
        label: t.text,
        sublabel: t.client_name || 'Task',
        icon: CheckSquare,
        type: 'entity',
        action: () => { setCurrentPage('tasks'); close() },
      })
    })

    // Entity search: projects
    projects.filter(p => p.status !== 'done').forEach(p => {
      items.push({
        id: `project-${p.id}`,
        label: p.title,
        sublabel: p.client_name || 'Project',
        icon: FolderKanban,
        type: 'entity',
        action: () => { setCurrentPage('projects'); close() },
      })
    })

    // Entity search: invoices
    invoices.filter(i => i.status !== 'paid').forEach(i => {
      items.push({
        id: `invoice-${i.id}`,
        label: `${i.num} — ${i.client_name}`,
        sublabel: `$${i.amount} ${i.status}`,
        icon: FileText,
        type: 'entity',
        action: () => { setCurrentPage('invoices'); close() },
      })
    })

    // Entity search: contacts
    contacts.forEach(c => {
      items.push({
        id: `contact-${c.id}`,
        label: c.name,
        sublabel: c.client_name || c.role || 'Contact',
        icon: UserCircle,
        type: 'entity',
        action: () => { setCurrentPage('contacts'); close() },
      })
    })

    // Entity search: leads
    leads.forEach(l => {
      items.push({
        id: `lead-${l.id}`,
        label: l.name,
        sublabel: `${l.stage} lead`,
        icon: Mail,
        type: 'entity',
        action: () => { setCurrentPage('outreach'); close() },
      })
    })

    return items
  }, [clients, tasks, projects, invoices, contacts, leads, setCurrentPage, setSelectedClientId, setAiPanelOpen])

  // Filter
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Show navigation + actions when no query
      return allItems.filter(i => i.type !== 'entity').slice(0, 20)
    }
    return allItems.filter(i =>
      fuzzyMatch(query, i.label) || (i.sublabel && fuzzyMatch(query, i.sublabel))
    ).slice(0, 30)
  }, [query, allItems])

  // Reset index on filter change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filtered.length, query])

  // Keyboard nav
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      filtered[selectedIndex].action()
    } else if (e.key === 'Escape') {
      close()
    }
  }

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!commandPaletteOpen) return null

  const typeLabel = (type: string) => {
    if (type === 'navigation') return 'GO TO'
    if (type === 'action') return 'ACTION'
    return 'SEARCH'
  }

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[15vh] z-[200]" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="bg-surface border border-border w-[95vw] max-w-[560px] overflow-hidden" style={{ maxHeight: '60vh' }}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={14} className="text-dim flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, clients, tasks..."
            className="flex-1 bg-transparent text-polar outline-none placeholder:text-dim"
            style={{ fontSize: '15px' }}
          />
          <kbd className="text-dim font-mono border border-border-hard px-1.5 py-0.5" style={{ fontSize: '11px' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 'calc(60vh - 50px)' }}>
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-dim" style={{ fontSize: '13px' }}>
              No results found
            </div>
          )}
          {filtered.map((item, idx) => {
            const Icon = item.icon
            const isSelected = idx === selectedIndex
            return (
              <button
                key={item.id}
                onClick={() => item.action()}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isSelected ? 'bg-surface-2 text-polar' : 'text-steel hover:bg-surface-2'
                }`}
              >
                <Icon size={14} className={isSelected ? 'text-polar' : 'text-dim'} />
                <div className="flex-1 min-w-0">
                  <span style={{ fontSize: '14px' }}>{item.label}</span>
                  {item.sublabel && (
                    <span className="text-dim ml-2" style={{ fontSize: '12px' }}>{item.sublabel}</span>
                  )}
                </div>
                <span className="text-dim font-mono uppercase" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>
                  {typeLabel(item.type)}
                </span>
                {isSelected && <ArrowRight size={10} className="text-dim" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
