import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/lib/store'
import Login from '@/pages/Login'
import Shell from '@/components/shell/Shell'

export default function App() {
  const [loading, setLoading] = useState(true)
  const user = useAppStore((s) => s.user)
  const setUser = useAppStore((s) => s.setUser)
  const loadAllData = useAppStore((s) => s.loadAllData)

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [setUser])

  // Load data when user becomes authenticated
  useEffect(() => {
    if (user) {
      loadAllData()
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
