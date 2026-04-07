import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
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
  category: string
  action: () => void
  searchableText?: string
}

// Highlight matched substring in text
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold text-polar">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

const CATEGORY_ORDER = ['Clients', 'Contacts', 'Tasks', 'Projects', 'Invoices', 'Leads', 'Actions', 'Pages']

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

  // Build items by category
  const allItems = useMemo((): CommandItem[] => {
    const items: CommandItem[] = []

    // Entity search: clients
    clients.forEach(c => {
      items.push({
        id: `client-${c.id}`,
        label: c.name,
        sublabel: c.service || c.status || 'Client',
        icon: Users,
        category: 'Clients',
        searchableText: c.name,
        action: () => { setSelectedClientId(c.id); setCurrentPage('client-detail'); close() },
      })
    })

    // Entity search: contacts
    contacts.forEach(c => {
      items.push({
        id: `contact-${c.id}`,
        label: c.name,
        sublabel: c.email || c.client_name || c.role || 'Contact',
        icon: UserCircle,
        category: 'Contacts',
        searchableText: `${c.name} ${c.email || ''}`,
        action: () => { setCurrentPage('contacts'); close() },
      })
    })

    // Entity search: tasks
    tasks.filter(t => !t.done).forEach(t => {
      items.push({
        id: `task-${t.id}`,
        label: t.text,
        sublabel: t.client_name || 'Task',
        icon: CheckSquare,
        category: 'Tasks',
        searchableText: t.text,
        action: () => { setCurrentPage('tasks'); close() },
      })
    })

    // Entity search: projects
    projects.forEach(p => {
      items.push({
        id: `project-${p.id}`,
        label: p.title,
        sublabel: p.status ? `${p.client_name || 'Project'} \u00b7 ${p.status}` : (p.client_name || 'Project'),
        icon: FolderKanban,
        category: 'Projects',
        searchableText: p.title,
        action: () => { setCurrentPage('projects'); close() },
      })
    })

    // Entity search: invoices
    invoices.forEach(i => {
      items.push({
        id: `invoice-${i.id}`,
        label: `${i.num} \u2014 ${i.client_name}`,
        sublabel: `$${i.amount} ${i.status}`,
        icon: FileText,
        category: 'Invoices',
        searchableText: `${i.num} ${i.client_name}`,
        action: () => { setCurrentPage('invoices'); close() },
      })
    })

    // Entity search: leads
    leads.forEach(l => {
      items.push({
        id: `lead-${l.id}`,
        label: l.name,
        sublabel: `${l.stage} lead`,
        icon: Mail,
        category: 'Leads',
        searchableText: l.name,
        action: () => { setCurrentPage('outreach'); close() },
      })
    })

    // Action commands
    items.push(
      { id: 'action-ai', label: 'Open AI Assist', icon: Sparkles, category: 'Actions', action: () => { setAiPanelOpen(true); close() } },
      { id: 'action-new-task', label: 'New Task', sublabel: 'Create a task', icon: Plus, category: 'Actions', action: () => { setCurrentPage('tasks'); close() } },
      { id: 'action-new-project', label: 'New Project', sublabel: 'Create a project', icon: Plus, category: 'Actions', action: () => { setCurrentPage('projects'); close() } },
      { id: 'action-new-invoice', label: 'New Invoice', sublabel: 'Create an invoice', icon: Plus, category: 'Actions', action: () => { setCurrentPage('invoices'); close() } },
      { id: 'action-new-client', label: 'New Client', sublabel: 'Add a client', icon: Plus, category: 'Actions', action: () => { setCurrentPage('clients'); close() } },
      { id: 'action-new-event', label: 'New Event', sublabel: 'Add calendar event', icon: Plus, category: 'Actions', action: () => { setCurrentPage('calendar'); close() } },
    )

    // Navigation commands (pages)
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
        category: 'Pages',
        action: () => { setCurrentPage(page); close() },
      })
    })

    return items
  }, [clients, tasks, projects, invoices, contacts, leads, setCurrentPage, setSelectedClientId, setAiPanelOpen])

  // Filter and group
  const { grouped, flatList } = useMemo(() => {
    const entityCategories = ['Clients', 'Contacts', 'Tasks', 'Projects', 'Invoices', 'Leads']
    let matchedItems: CommandItem[]

    if (!query.trim()) {
      // No query: show actions and pages only
      matchedItems = allItems.filter(i => !entityCategories.includes(i.category))
    } else {
      // Filter all items by query
      matchedItems = allItems.filter(i =>
        fuzzyMatch(query, i.label) ||
        (i.sublabel && fuzzyMatch(query, i.sublabel)) ||
        (i.searchableText && fuzzyMatch(query, i.searchableText))
      )
    }

    // Group by category, limit 5 per entity category
    const grouped: Record<string, CommandItem[]> = {}
    for (const item of matchedItems) {
      if (!grouped[item.category]) grouped[item.category] = []
      if (entityCategories.includes(item.category) && grouped[item.category].length >= 5) continue
      grouped[item.category].push(item)
    }

    // Build flat list in category order
    const flatList: CommandItem[] = []
    for (const cat of CATEGORY_ORDER) {
      if (grouped[cat]) flatList.push(...grouped[cat])
    }

    return { grouped, flatList }
  }, [query, allItems])

  // Reset index on filter change
  useEffect(() => {
    setSelectedIndex(0)
  }, [flatList.length, query])

  // Keyboard nav
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, flatList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatList[selectedIndex]) {
      e.preventDefault()
      flatList[selectedIndex].action()
    } else if (e.key === 'Escape') {
      close()
    }
  }

  // Scroll selected into view
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const el = container.querySelector(`[data-cmd-index="${selectedIndex}"]`) as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!commandPaletteOpen) return null

  // Build render sections
  let globalIndex = 0
  const sections: { category: string; items: { item: CommandItem; index: number }[] }[] = []
  for (const cat of CATEGORY_ORDER) {
    if (!grouped[cat] || grouped[cat].length === 0) continue
    const sectionItems: { item: CommandItem; index: number }[] = []
    for (const item of grouped[cat]) {
      sectionItems.push({ item, index: globalIndex })
      globalIndex++
    }
    sections.push({ category: cat, items: sectionItems })
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
            placeholder="Search clients, contacts, tasks, projects, invoices..."
            className="flex-1 bg-transparent text-polar outline-none placeholder:text-dim"
            style={{ fontSize: '15px' }}
          />
          <kbd className="text-dim font-mono border border-border-hard px-1.5 py-0.5" style={{ fontSize: '11px' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 'calc(60vh - 50px)' }}>
          {flatList.length === 0 && (
            <div className="px-4 py-8 text-center text-dim" style={{ fontSize: '13px' }}>
              No results found
            </div>
          )}
          {sections.map(section => (
            <Fragment key={section.category}>
              {/* Section header */}
              <div
                className="px-4 py-1.5 text-dim font-mono uppercase sticky top-0 bg-surface border-b border-border"
                style={{ fontSize: '10px', letterSpacing: '0.1em' }}
              >
                {section.category}
              </div>
              {section.items.map(({ item, index }) => {
                const Icon = item.icon
                const isSelected = index === selectedIndex
                return (
                  <button
                    key={item.id}
                    data-cmd-index={index}
                    onClick={() => item.action()}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSelected ? 'bg-surface-2 text-polar' : 'text-steel hover:bg-surface-2'
                    }`}
                  >
                    <Icon size={14} className={isSelected ? 'text-polar' : 'text-dim'} />
                    <div className="flex-1 min-w-0">
                      <span style={{ fontSize: '14px' }}>
                        <HighlightMatch text={item.label} query={query} />
                      </span>
                      {item.sublabel && (
                        <span className="text-dim ml-2" style={{ fontSize: '12px' }}>
                          <HighlightMatch text={item.sublabel} query={query} />
                        </span>
                      )}
                    </div>
                    {isSelected && <ArrowRight size={10} className="text-dim" />}
                  </button>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
