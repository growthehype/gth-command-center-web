import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/lib/store'
import { captureTokenFromUrl, initGoogleToken } from '@/lib/google-calendar'
import { captureGmailToken } from '@/lib/gmail'
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

  // Hydrate Google token from Supabase on login (cross-device persistence)
  // Do NOT trigger silentReconnectIfNeeded here — that causes unwanted redirects
  // Silent re-auth is only safe on the Calendar page itself
  useEffect(() => {
    if (user) {
      initGoogleToken()
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

  // Load data ONCE when user becomes authenticated (non-demo)
  useEffect(() => {
    if (user && !demoMode && !dataLoadedRef.current) {
      dataLoadedRef.current = true
      loadAllData().catch(() => {
        console.error('Failed to load data — check Supabase tables exist')
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
