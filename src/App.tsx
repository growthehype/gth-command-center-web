import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/lib/store'
import { captureTokenFromUrl, initGoogleToken } from '@/lib/google-calendar'
import { captureGmailToken, restoreGmailConnection } from '@/lib/gmail'
import { setCurrentTenantId, initScope, tenants as tenantsApi } from '@/lib/api'
import { isOverdue } from '@/lib/utils'
import { useFaviconBadge } from '@/hooks/useFaviconBadge'
import Login from '@/pages/Login'
import Shell from '@/components/shell/Shell'
import ClientPortal from '@/pages/ClientPortal'

// If URL contains ?portal= parameter, render the client portal directly
const isPortalView = new URLSearchParams(window.location.search).has('portal')

export default function App() {
  if (isPortalView) return <ClientPortal />
  const [loading, setLoading] = useState(true)
  const user = useAppStore((s) => s.user)
  const setUser = useAppStore((s) => s.setUser)
  const loadAllData = useAppStore((s) => s.loadAllData)
  const demoMode = useAppStore((s) => s.demoMode)
  const tasks = useAppStore((s) => s.tasks)
  const dataLoadedRef = useRef(false)

  // Count overdue tasks for favicon badge
  const overdueCount = useMemo(
    () => tasks.filter((t) => !t.done && isOverdue(t.due_date)).length,
    [tasks]
  )
  useFaviconBadge(overdueCount)

  // Capture Google OAuth token from URL hash on mount (after redirect),
  // then hydrate from Supabase if needed
  useEffect(() => {
    // Capture Gmail token first (check state=gmail), then calendar token
    const gmailCaptured = captureGmailToken()
    if (!gmailCaptured) {
      captureTokenFromUrl().then(() => {
        if (useAppStore.getState().user) {
          initGoogleToken()
        }
      })
    }
  }, [])

  // On login: restore Gmail/Calendar connection from server (cross-device)
  // Checks Supabase for stored refresh token, refreshes access token if found
  useEffect(() => {
    if (user) {
      restoreGmailConnection().then(() => {
        initGoogleToken()
      })
    }
  }, [user])

  // Apply saved theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('gth_theme') as 'light' | 'dark'
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme)
    }
  }, [])

  // If demo mode is active on mount, load demo data and skip auth
  useEffect(() => {
    if (demoMode) {
      if (!dataLoadedRef.current) {
        dataLoadedRef.current = true
        loadAllData()
      }
      setLoading(false)
      return
    }

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = useAppStore.getState().user
      const newUser = session?.user ?? null
      if (newUser?.id !== currentUser?.id) {
        setUser(newUser)
        dataLoadedRef.current = false
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, demoMode, loadAllData])

  // Load tenant context, then data, ONCE when user becomes authenticated (non-demo)
  useEffect(() => {
    if (user && !demoMode && !dataLoadedRef.current) {
      dataLoadedRef.current = true
      // Load tenants first, set context, then load all data
      tenantsApi.getUserTenants()
        .then((userTenants: any[]) => {
          if (userTenants.length > 0) {
            // Auto-select first tenant (or last used from localStorage)
            const savedTenantId = localStorage.getItem('gth_current_tenant')
            const tenant = userTenants.find((t: any) => t.tenant_id === savedTenantId) || userTenants[0]
            setCurrentTenantId(tenant.tenant_id)
            localStorage.setItem('gth_current_tenant', tenant.tenant_id)
            useAppStore.getState().setCurrentTenant(tenant.tenant_id, tenant.role, tenant.tenant_name)
          }
          return loadAllData()
        })
        .catch(async (err: any) => {
          console.warn('Tenant load failed (pre-migration?) — falling back to user_id:', err?.message)
          // Fallback: init scope with user_id and load data
          await initScope()
          loadAllData().catch(() => {
            /* silently handled */
          })
        })
    }
  }, [user, loadAllData, demoMode])

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center">
        <div className="text-center">
          <img src="/icon.png" alt="GTH" className="w-12 h-12 mx-auto mb-3 rounded-lg animate-pulse" />
          <p className="text-frost text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // Demo mode — skip auth, render Shell directly
  if (demoMode) {
    return <Shell />
  }

  if (!user) {
    return <Login />
  }

  return <Shell />
}
