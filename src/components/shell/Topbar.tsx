import { useAppStore } from '@/lib/store'
import { Search, Timer, Sparkles, Clock, Menu, Moon, Sun } from 'lucide-react'
import { format } from 'date-fns'
import { useState, useEffect } from 'react'

interface TopbarProps {
  onLock?: () => void
}

export default function Topbar({ onLock }: TopbarProps) {
  const { setCommandPaletteOpen, aiPanelOpen, setAiPanelOpen, settings, runningTimer, sidebarOpen, setSidebarOpen, theme, setTheme } = useAppStore()
  const displayName = settings.display_name || 'Omar Alladina'
  const initials = settings.avatar_initials || 'OA'
  const [currentTime, setCurrentTime] = useState(new Date())
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // Timer elapsed display
  useEffect(() => {
    if (!runningTimer) { setElapsed(''); return }
    const update = () => {
      const start = new Date(runningTimer.started_at).getTime()
      const diff = Date.now() - start
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setElapsed(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [runningTimer])

  return (
    <header className="h-11 border-b border-border flex items-center px-2 md:px-4 gap-2 md:gap-4 flex-shrink-0 select-none text-white" style={{ backgroundColor: '#111111' }}>
      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden flex items-center justify-center w-8 h-8 text-white/70 hover:text-white transition-colors"
      >
        <Menu size={18} />
      </button>
      {/* Logo + wordmark */}
      <div className="flex items-center gap-2.5">
        <img src="./icon.png" alt="GTH" className="w-[26px] h-[26px]" draggable={false} style={{ filter: 'brightness(0) invert(1)' }} />
        <span
          className="font-sans font-[800] uppercase hidden md:inline"
          style={{ fontSize: '14px', letterSpacing: '0.04em', color: '#FFFFFF' }}
        >
          Operations Command Center
        </span>
      </div>

      <div className="flex-1" />

      {/* Search trigger */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="hidden md:flex items-center gap-2 transition-colors px-3 py-1.5 border"
        style={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.2)' }}
        title="Search (Ctrl+K)"
      >
        <Search size={12} />
        <span className="font-mono" style={{ fontSize: '11px' }}>Ctrl+K</span>
      </button>

      {/* Timer */}
      {runningTimer && elapsed && (
        <div className="flex items-center gap-2 text-ok">
          <Timer size={12} />
          <span className="font-mono font-bold" style={{ fontSize: '12px' }}>{elapsed}</span>
        </div>
      )}

      {/* AI Panel toggle */}
      <button
        onClick={() => setAiPanelOpen(!aiPanelOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 transition-colors"
        style={{
          color: aiPanelOpen ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
          backgroundColor: aiPanelOpen ? 'rgba(255,255,255,0.15)' : 'transparent',
        }}
        title="AI Assist (Ctrl+J)"
      >
        <Sparkles size={13} />
        <span style={{ fontSize: '11px', fontWeight: 600 }}>AI</span>
      </button>

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="flex items-center justify-center w-8 h-8 transition-colors"
        style={{ color: 'rgba(255,255,255,0.5)' }}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
      </button>

      {/* Time */}
      <span className="font-mono hidden md:inline" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
        {format(currentTime, 'h:mm a')}
      </span>

      {/* User */}
      <div className="flex items-center gap-2">
        <span className="hidden md:inline" style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
          {displayName}
        </span>
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
          <span className="font-bold" style={{ fontSize: '10px', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.8)' }}>
            {initials}
          </span>
        </div>
      </div>
    </header>
  )
}
