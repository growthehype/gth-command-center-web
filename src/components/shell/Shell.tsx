import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import Topbar from './Topbar'
import Sidebar from './Sidebar'
import ToastContainer from '@/components/ui/Toast'
import CommandPalette from '@/components/command-palette/CommandPalette'
import AiPanel from '@/components/ai-panel/AiPanel'
import { Plus } from 'lucide-react'

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
}

export default function Shell({ onLock }: ShellProps) {
  const { currentPage, setCommandPaletteOpen, setCurrentPage, setAiPanelOpen, aiPanelOpen } = useAppStore()

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
          case 'n': e.preventDefault(); setCommandPaletteOpen(true); return
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

      // / to focus search
      if (e.key === '/') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onLock, setCommandPaletteOpen, setCurrentPage, setAiPanelOpen, aiPanelOpen])

  const PageComponent = pageMap[currentPage] || DailyBriefing

  return (
    <div className="h-screen w-screen flex flex-col bg-obsidian overflow-hidden">
      <Topbar onLock={onLock} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <PageComponent />
        </main>
        {aiPanelOpen && <AiPanel />}
      </div>

      {/* FAB */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-polar text-obsidian flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity z-50"
        title="Quick Add"
      >
        <Plus size={20} strokeWidth={2.5} />
      </button>

      <CommandPalette />
      <ToastContainer />
    </div>
  )
}
