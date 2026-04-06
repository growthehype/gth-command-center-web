import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/lib/store'
import { storeTokens } from '@/lib/google-calendar'
import Login from '@/pages/Login'
import Shell from '@/components/shell/Shell'

export default function App() {
  const [loading, setLoading] = useState(true)
  const user = useAppStore((s) => s.user)
  const setUser = useAppStore((s) => s.setUser)
  const loadAllData = useAppStore((s) => s.loadAllData)
  const dataLoadedRef = useRef(false)

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      // Capture Google OAuth tokens if present (after redirect)
      if (session?.provider_token) {
        storeTokens(session.provider_token, session.provider_refresh_token)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Capture Google OAuth tokens on any auth event
      if (session?.provider_token) {
        storeTokens(session.provider_token, session.provider_refresh_token)
      }

      const currentUser = useAppStore.getState().user
      const newUser = session?.user ?? null
      if (newUser?.id !== currentUser?.id) {
        setUser(newUser)
        dataLoadedRef.current = false
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser])

  // Load data ONCE when user becomes authenticated
  useEffect(() => {
    if (user && !dataLoadedRef.current) {
      dataLoadedRef.current = true
      loadAllData().catch(() => {
        console.error('Failed to load data — check Supabase tables exist')
      })
    }
  }, [user, loadAllData])

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

  if (!user) {
    return <Login />
  }

  return <Shell />
}
