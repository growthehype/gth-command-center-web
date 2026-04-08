import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import Topbar from './Topbar'
import Sidebar from './Sidebar'
import ToastContainer from '@/components/ui/Toast'
import CommandPalette from '@/components/command-palette/CommandPalette'
import AiPanel from '@/components/ai-panel/AiPanel'
import KeyboardShortcutsModal from '@/components/ui/KeyboardShortcutsModal'
import QuickAddModal from '@/components/ui/QuickAddModal'
import WelcomeModal from '@/components/ui/WelcomeModal'
import { Plus } from 'lucide-react'
import ErrorBoundary from '@/components/ui/ErrorBoundary'

// Page imports
import DailyBriefing from '@/pages/DailyBriefing'
import Dashboard from '@/pages/Dashboard'
import CalendarPage from '@/pages/Calendar'
import Clients from '@/pages/Clients'
import Contacts from '@/pages/Contacts'
import Projects from '@/pages/Projects'
import Tasks from '@/pages/Tasks'
import Meetings from '@/pages/Meetings'
import Invoices from '@/pages/Invoices'
import Financials from '@/pages/Financials'
import Profitability from '@/pages/Profitability'
import Outreach from '@/pages/Outreach'
import Campaigns from '@/pages/Campaigns'
import Services from '@/pages/Services'
import Templates from '@/pages/Templates'
import Goals from '@/pages/Goals'
import Credentials from '@/pages/Credentials'
import BrandAssets from '@/pages/BrandAssets'
import Documents from '@/pages/Documents'
import SOPs from '@/pages/SOPs'
import Notes from '@/pages/Notes'
import ActivityPage from '@/pages/Activity'
import SettingsPage from '@/pages/Settings'
import ClientDetail from '@/pages/ClientDetail'

interface ShellProps {
  onLock?: () => void
}

const pageMap: Record<string, React.ComponentType> = {
  briefing: DailyBriefing,
  dashboard: Dashboard,
  calendar: CalendarPage,
  clients: Clients,
  contacts: Contacts,
  projects: Projects,
  tasks: Tasks,
  meetings: Meetings,
  invoices: Invoices,
  financials: Financials,
  profitability: Profitability,
  outreach: Outreach,
  campaigns: Campaigns,
  services: Services,
  templates: Templates,
  goals: Goals,
  credentials: Credentials,
  'brand-assets': BrandAssets,
  documents: Documents,
  sops: SOPs,
  notes: Notes,
  activity: ActivityPage,
  settings: SettingsPage,
  'client-detail': ClientDetail,
}

export default function Shell({ onLock }: ShellProps) {
  const { currentPage, setCommandPaletteOpen, setCurrentPage, setAiPanelOpen, aiPanelOpen, sidebarOpen, setSidebarOpen, demoMode, exitDemoMode } = useAppStore()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  // Keyboard shortcuts
  useEffect(() => {
    let gPressed = false
    let gTimeout: ReturnType<typeof setTimeout>

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Ctrl/Cmd shortcuts work always
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'k': e.preventDefault(); setCommandPaletteOpen(true); return
          case 'j': e.preventDefault(); setAiPanelOpen(!aiPanelOpen); return
          case 'n': e.preventDefault(); setQuickAddOpen(prev => !prev); return
          case 'l': e.preventDefault(); onLock?.(); return
          case ',': e.preventDefault(); setCurrentPage('settings'); return
        }
      }

      if (isInput) return

      // Escape
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false)
        setAiPanelOpen(false)
        return
      }

      // G+key navigation
      if (e.key === 'g' || e.key === 'G') {
        gPressed = true
        clearTimeout(gTimeout)
        gTimeout = setTimeout(() => { gPressed = false }, 500)
        return
      }

      if (gPressed) {
        gPressed = false
        const goMap: Record<string, string> = {
          b: 'briefing', d: 'dashboard', c: 'clients', l: 'contacts',
          p: 'projects', t: 'tasks', i: 'invoices', f: 'financials',
          o: 'outreach', m: 'meetings',
        }
        const page = goMap[e.key.toLowerCase()]
        if (page) { e.preventDefault(); setCurrentPage(page) }
      }

      // ? to show keyboard shortcuts
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(prev => !prev)
        return
      }

      // / to focus search
      if (e.key === '/') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onLock, setCommandPaletteOpen, setCurrentPage, setAiPanelOpen, aiPanelOpen])

  // Browser back/forward button support
  useEffect(() => {
    // Push initial state so the first page is in history
    if (!window.history.state?.page) {
      window.history.replaceState({ page: currentPage }, '', `#${currentPage}`)
    }

    const handlePopState = (e: PopStateEvent) => {
      const page = e.state?.page
      if (page && pageMap[page]) {
        // Use pushHistory=false to avoid pushing again during back navigation
        setCurrentPage(page, false)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const PageComponent = pageMap[currentPage] || DailyBriefing

  return (
    <div className="h-screen w-screen flex flex-col bg-obsidian overflow-hidden">
      <Topbar onLock={onLock} onHelpClick={() => setShortcutsOpen(true)} />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        {/* Sidebar - hidden on mobile unless open */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-56 transform transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] md:relative md:translate-x-0 md:w-48 md:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `} style={{ top: 'var(--topbar-h, 44px)' }}>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>
        <main className="shell-main flex-1 overflow-y-auto p-3 md:p-6">
          {demoMode && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-amber-500/15 border border-amber-500/30 px-4 py-2 text-sm text-amber-300">
              <span className="font-semibold tracking-wide">DEMO MODE — Sample data shown</span>
              <button
                onClick={exitDemoMode}
                className="shrink-0 rounded-md bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/30 transition-colors"
              >
                Exit Demo
              </button>
            </div>
          )}
          <ErrorBoundary key={currentPage}>
            <div className="page-enter">
              <PageComponent />
            </div>
          </ErrorBoundary>
        </main>
        {aiPanelOpen && <AiPanel />}
      </div>

      {/* FAB */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="fixed bottom-5 right-5 w-11 h-11 md:w-12 md:h-12 md:bottom-6 md:right-6 bg-polar text-obsidian flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity z-50 rounded-full md:rounded-none"
        title="Quick Add"
        aria-label="Open command palette"
      >
        <Plus size={20} strokeWidth={2.5} />
      </button>

      <CommandPalette />
      <QuickAddModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <WelcomeModal />
      <ToastContainer />
    </div>
  )
}
