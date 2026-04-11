import { create } from 'zustand'
import { clients as clientsApi, tasks as tasksApi, projects as projectsApi, invoices as invoicesApi, outreach as outreachApi, events as eventsApi, campaigns as campaignsApi, contacts as contactsApi, meetings as meetingsApi, services as servicesApi, templates as templatesApi, goals as goalsApi, activity as activityApi, credentials as credentialsApi, sops as sopsApi, timeEntries as timeEntriesApi, settings as settingsApi, team as teamApi, invitations as invitationsApi } from '@/lib/api'
import { demoData } from '@/lib/demo-data'
import type { User } from '@supabase/supabase-js'

// Types
export interface Client {
  id: string; name: string; service: string | null; retainer: string | null; mrr: number; status: string; platform: string | null; contact: string | null; email: string | null; phone: string | null; website: string | null; colors: string | null; logo_path: string | null; last_activity: string | null; notes: string | null; tags: string | null; created_at: string; updated_at: string
}

export interface Task {
  id: string; text: string; description: string | null; priority: string; done: number; client_id: string | null; client_name?: string; due_date: string | null; tags: string | null; recurring: string | null; created_at: string; completed_at: string | null
}

export interface Project {
  id: string; client_id: string | null; client_name?: string; title: string; description: string | null; priority: string | null; status: string; due_date: string | null; hours: number; links: string | null; recurring: string | null; created_at: string; updated_at: string
}

export interface Invoice {
  id: string; num: string; client_id: string | null; client_name?: string; amount: number; sent_date: string | null; due_date: string | null; status: string; file_path: string | null; notes: string | null; created_at: string; paid_at: string | null
}

export interface OutreachLead {
  id: string; name: string; industry: string | null; stage: string; last_contact: string | null; next_follow_up: string | null; deal_value: number; notes: string | null; created_at: string; converted_client_id: string | null;
  // ----- Fields populated by AI agents (Sarah, Selina, client agents) -----
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  rating?: number | null;
  google_maps_url?: string | null;
  google_place_id?: string | null;
  business_status?: string | null;
  source?: string | null;
  agent_name?: string | null;
  agent_type?: string | null;
  agent_config_id?: string | null;
  agent_run_id?: string | null;
  qualification_score?: number | null;
  qualification_reason?: string | null;
  contact_name?: string | null;
  enrichment_data?: Record<string, any> | null;
}

export interface CalendarEvent {
  id: string; date: string; start_time: string; end_time: string; title: string; type: string; client_id: string | null; client_name?: string; recurring: string | null; created_at: string
}

export interface Campaign {
  id: string; client_id: string | null; client_name?: string; platform: string | null; name: string; status: string; spend: number; conversions: number; updated_at: string
}

export interface Contact {
  id: string; client_id: string | null; client_name?: string; name: string; role: string | null; email: string | null; phone: string | null; is_primary: number; notes: string | null; last_contacted: string | null; created_at: string
}

export interface MeetingNote {
  id: string; client_id: string | null; client_name?: string; contact_id: string | null; contact_name?: string; title: string; date: string; type: string; attendees: string | null; notes: string | null; action_items: string | null; created_at: string
}

export interface Service {
  id: string; name: string; category: string | null; description: string | null; pricing_model: string; default_price: number | null; typical_hours: number | null; deliverables: string | null; active: number; created_at: string
}

export interface EmailTemplate {
  id: string; name: string; category: string | null; subject: string | null; body: string; variables: string | null; use_count: number; created_at: string
}

export interface Goal {
  id: string; title: string; description: string | null; metric_type: string; target_value: number | null; current_value: number | null; target_date: string | null; status: string; created_at: string
}

export interface ActivityEntry {
  id: string; type: string; entity: string | null; entity_id: string | null; description: string; timestamp: string
}

export interface TimeEntry {
  id: string; project_id: string | null; project_title?: string; client_id: string | null; client_name?: string; started_at: string; ended_at: string | null; duration_minutes: number | null; notes: string | null; billable: number
}

export interface Credential {
  id: string; platform: string; client_id: string | null; client_name?: string | null; fields: string | null; created_at: string
}

export interface Sop {
  id: string; title: string; area: string | null; status: string; url: string | null; updated_at: string
}

// Main app store
interface AppStore {
  // Auth
  user: User | null
  setUser: (user: User | null) => void

  // Demo mode
  demoMode: boolean
  enterDemoMode: () => void
  exitDemoMode: () => void

  // Data
  clients: Client[]
  tasks: Task[]
  projects: Project[]
  invoices: Invoice[]
  leads: OutreachLead[]
  events: CalendarEvent[]
  campaigns: Campaign[]
  contacts: Contact[]
  meetings: MeetingNote[]
  services: Service[]
  templates: EmailTemplate[]
  goals: Goal[]
  activity: ActivityEntry[]
  credentials: Credential[]
  sops: Sop[]
  timeEntries: TimeEntry[]
  settings: Record<string, string>

  // Tenant
  currentTenantId: string | null
  currentTenantRole: string | null
  currentTenantName: string | null
  setCurrentTenant: (id: string | null, role: string | null, name: string | null) => void
  teamMembers: any[]
  pendingInvites: any[]
  refreshTeamMembers: () => Promise<void>
  refreshPendingInvites: () => Promise<void>

  // UI state
  currentPage: string
  selectedClientId: string | null
  selectedProjectId: string | null
  selectedTaskId: string | null
  selectedMeetingId: string | null
  selectedCredentialId: string | null
  selectedInvoiceId: string | null
  commandPaletteOpen: boolean
  aiPanelOpen: boolean
  pomodoroOpen: boolean
  pomodoroActive: boolean
  pomodoroDisplay: string  // e.g. "Focus 24:13" or "Break 04:50"
  pomodoroPhase: 'work' | 'break'
  focusMode: boolean
  setFocusMode: (on: boolean) => void
  sidebarOpen: boolean
  runningTimer: TimeEntry | null
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void

  // Actions
  setCurrentPage: (page: string, pushHistory?: boolean) => void
  setSelectedClientId: (id: string | null) => void
  setSelectedProjectId: (id: string | null) => void
  setSelectedTaskId: (id: string | null) => void
  setSelectedMeetingId: (id: string | null) => void
  setSelectedCredentialId: (id: string | null) => void
  setSelectedInvoiceId: (id: string | null) => void
  setCommandPaletteOpen: (open: boolean) => void
  setAiPanelOpen: (open: boolean) => void
  setPomodoroOpen: (open: boolean) => void
  setPomodoroStatus: (active: boolean, display: string, phase: 'work' | 'break') => void
  setSidebarOpen: (open: boolean) => void

  // Data loading
  loadAllData: () => Promise<void>
  refreshClients: () => Promise<void>
  refreshTasks: () => Promise<void>
  refreshProjects: () => Promise<void>
  refreshInvoices: () => Promise<void>
  refreshLeads: () => Promise<void>
  refreshEvents: () => Promise<void>
  refreshCampaigns: () => Promise<void>
  refreshContacts: () => Promise<void>
  refreshMeetings: () => Promise<void>
  refreshServices: () => Promise<void>
  refreshTemplates: () => Promise<void>
  refreshGoals: () => Promise<void>
  refreshActivity: () => Promise<void>
  refreshCredentials: () => Promise<void>
  refreshSops: () => Promise<void>
  refreshTimeEntries: () => Promise<void>
  refreshSettings: () => Promise<void>
  refreshRunningTimer: () => Promise<void>
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  demoMode: localStorage.getItem('gth_demo_mode') === 'true',
  enterDemoMode: () => {
    localStorage.setItem('gth_demo_mode', 'true')
    set({ demoMode: true, ...demoData })
  },
  exitDemoMode: () => {
    localStorage.removeItem('gth_demo_mode')
    set({
      demoMode: false,
      clients: [], tasks: [], projects: [], invoices: [], leads: [], events: [],
      campaigns: [], contacts: [], meetings: [], services: [], templates: [],
      goals: [], activity: [], credentials: [], sops: [], timeEntries: [],
      settings: {}, runningTimer: null, currentPage: 'briefing',
    })
  },

  currentTenantId: null,
  currentTenantRole: 'owner',
  currentTenantName: null,
  setCurrentTenant: (id, role, name) => set({ currentTenantId: id, currentTenantRole: role, currentTenantName: name }),
  teamMembers: [],
  pendingInvites: [],
  refreshTeamMembers: async () => { try { set({ teamMembers: await teamApi.getMembers() }) } catch (e) { console.error('refreshTeamMembers:', e) } },
  refreshPendingInvites: async () => { try { set({ pendingInvites: await invitationsApi.getPending() }) } catch (e) { console.error('refreshPendingInvites:', e) } },

  clients: [],
  tasks: [],
  projects: [],
  invoices: [],
  leads: [],
  events: [],
  campaigns: [],
  contacts: [],
  meetings: [],
  services: [],
  templates: [],
  goals: [],
  activity: [],
  credentials: [],
  sops: [],
  timeEntries: [],
  settings: {},

  currentPage: 'briefing',
  selectedClientId: null,
  selectedProjectId: null,
  selectedTaskId: null,
  selectedMeetingId: null,
  selectedCredentialId: null,
  selectedInvoiceId: null,
  commandPaletteOpen: false,
  aiPanelOpen: false,
  pomodoroOpen: false,
  pomodoroActive: false,
  pomodoroDisplay: '',
  pomodoroPhase: 'work' as const,
  focusMode: false,
  setFocusMode: (on) => set({ focusMode: on, sidebarOpen: false }),
  sidebarOpen: false,
  runningTimer: null,
  theme: (localStorage.getItem('gth_theme') as 'light' | 'dark') || 'light',
  setTheme: (theme) => {
    localStorage.setItem('gth_theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },

  setCurrentPage: (page, pushHistory = true) => {
    const prev = useAppStore.getState().currentPage
    if (page === prev) return
    if (pushHistory) {
      window.history.pushState({ page }, '', `#${page}`)
    }
    set({ currentPage: page })
  },
  setSelectedClientId: (id) => set({ selectedClientId: id }),
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  setSelectedMeetingId: (id) => set({ selectedMeetingId: id }),
  setSelectedCredentialId: (id) => set({ selectedCredentialId: id }),
  setSelectedInvoiceId: (id) => set({ selectedInvoiceId: id }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
  setPomodoroOpen: (open) => set({ pomodoroOpen: open }),
  setPomodoroStatus: (active, display, phase) => set({ pomodoroActive: active, pomodoroDisplay: display, pomodoroPhase: phase }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  loadAllData: async () => {
    // In demo mode, load demo data instead of calling Supabase
    if (useAppStore.getState().demoMode) {
      set({ ...demoData })
      return
    }
    try {
      const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
        try { return await fn() } catch { return fallback }
      }
      // Batch queries in groups of 6 to avoid Supabase rate limits
      const [clients, tasks, projects, invoices, leads, events] = await Promise.all([
        safe(() => clientsApi.getAll(), []),
        safe(() => tasksApi.getAll(), []),
        safe(() => projectsApi.getAll(), []),
        safe(() => invoicesApi.getAll(), []),
        safe(() => outreachApi.getAll(), []),
        safe(() => eventsApi.getAll(), []),
      ])
      set({ clients, tasks, projects, invoices, leads, events })

      const [campaigns, contacts, meetings, services, templates, goals] = await Promise.all([
        safe(() => campaignsApi.getAll(), []),
        safe(() => contactsApi.getAll(), []),
        safe(() => meetingsApi.getAll(), []),
        safe(() => servicesApi.getAll(), []),
        safe(() => templatesApi.getAll(), []),
        safe(() => goalsApi.getAll(), []),
      ])
      set({ campaigns, contacts, meetings, services, templates, goals })

      const [activity, credentials, sops, timeEntries, settings, runningTimer] = await Promise.all([
        safe(() => activityApi.getAll(50, 0), []),
        safe(() => credentialsApi.getAll(), []),
        safe(() => sopsApi.getAll(), []),
        safe(() => timeEntriesApi.getAll(), []),
        safe(() => settingsApi.getAll(), {}),
        safe(() => timeEntriesApi.getRunning(), null),
      ])
      set({ activity, credentials, sops, timeEntries, settings, runningTimer })
    } catch (err) {
      console.error('loadAllData failed:', err)
    }
  },

  refreshClients: async () => { try { set({ clients: await clientsApi.getAll() }) } catch (e) { console.error('refreshClients:', e) } },
  refreshTasks: async () => { try { set({ tasks: await tasksApi.getAll() }) } catch (e) { console.error('refreshTasks:', e) } },
  refreshProjects: async () => { try { set({ projects: await projectsApi.getAll() }) } catch (e) { console.error('refreshProjects:', e) } },
  refreshInvoices: async () => { try { set({ invoices: await invoicesApi.getAll() }) } catch (e) { console.error('refreshInvoices:', e) } },
  refreshLeads: async () => { try { set({ leads: await outreachApi.getAll() }) } catch (e) { console.error('refreshLeads:', e) } },
  refreshEvents: async () => { try { set({ events: await eventsApi.getAll() }) } catch (e) { console.error('refreshEvents:', e) } },
  refreshCampaigns: async () => { try { set({ campaigns: await campaignsApi.getAll() }) } catch (e) { console.error('refreshCampaigns:', e) } },
  refreshContacts: async () => { try { set({ contacts: await contactsApi.getAll() }) } catch (e) { console.error('refreshContacts:', e) } },
  refreshMeetings: async () => { try { set({ meetings: await meetingsApi.getAll() }) } catch (e) { console.error('refreshMeetings:', e) } },
  refreshServices: async () => { try { set({ services: await servicesApi.getAll() }) } catch (e) { console.error('refreshServices:', e) } },
  refreshTemplates: async () => { try { set({ templates: await templatesApi.getAll() }) } catch (e) { console.error('refreshTemplates:', e) } },
  refreshGoals: async () => { try { set({ goals: await goalsApi.getAll() }) } catch (e) { console.error('refreshGoals:', e) } },
  refreshActivity: async () => { try { set({ activity: await activityApi.getAll(50, 0) }) } catch (e) { console.error('refreshActivity:', e) } },
  refreshCredentials: async () => { try { set({ credentials: await credentialsApi.getAll() }) } catch (e) { console.error('refreshCredentials:', e) } },
  refreshSops: async () => { try { set({ sops: await sopsApi.getAll() }) } catch (e) { console.error('refreshSops:', e) } },
  refreshTimeEntries: async () => { try { set({ timeEntries: await timeEntriesApi.getAll() }) } catch (e) { console.error('refreshTimeEntries:', e) } },
  refreshSettings: async () => { try { set({ settings: await settingsApi.getAll() }) } catch (e) { console.error('refreshSettings:', e) } },
  refreshRunningTimer: async () => { try { set({ runningTimer: await timeEntriesApi.getRunning() }) } catch (e) { console.error('refreshRunningTimer:', e) } },
}))
