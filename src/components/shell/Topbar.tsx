import { useAppStore } from '@/lib/store'
import { Search, Timer, Sparkles, Clock, Menu, Moon, Sun, HelpCircle, WifiOff, Wifi, Square, Flame } from 'lucide-react'
import { timeEntries as timeEntriesApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { format } from 'date-fns'
import { useState, useEffect, useCallback } from 'react'

interface TopbarProps {
  onLock?: () => void
  onHelpClick?: () => void
}

export default function Topbar({ onLock, onHelpClick }: TopbarProps) {
  const { setCommandPaletteOpen, aiPanelOpen, setAiPanelOpen, pomodoroOpen, setPomodoroOpen, pomodoroActive, pomodoroDisplay, pomodoroPhase, settings, runningTimer, sidebarOpen, setSidebarOpen, theme, setTheme } = useAppStore()
  const connectionStatus = useOnlineStatus()
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
    <header className="topbar-header h-11 flex items-center px-2 md:px-4 gap-2 md:gap-4 flex-shrink-0 select-none text-white" style={{ backgroundColor: '#111111' }}>
      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden flex items-center justify-center w-8 h-8 text-white/70 hover:text-white transition-colors"
        title="Menu"
        aria-label="Toggle navigation menu"
      >
        <Menu size={18} />
      </button>
      {/* Logo + wordmark */}
      <div className="flex items-center gap-2.5">
        <img src="./icon.png" alt="GTH" className="w-[26px] h-[26px]" draggable={false} style={{ filter: 'brightness(0) invert(1)' }} />
        <span
          className="font-sans font-[800] uppercase hidden md:inline"
          style={{ fontSize: '14px', letterSpacing: '0.12em', color: '#FFFFFF' }}
        >
          {settings.company_name ? `${settings.company_name}` : 'Operations Command Center'}
        </span>
      </div>

      <div className="flex-1" />

      {/* Search trigger */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="topbar-icon-btn hidden md:flex items-center gap-2 px-3 py-1.5 border"
        style={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.2)' }}
        title="Search (Ctrl+K)"
      >
        <Search size={12} />
        <span className="font-mono" style={{ fontSize: '11px' }}>Ctrl+K</span>
      </button>

      {/* Connection status */}
      {connectionStatus === 'offline' && (
        <div className="flex items-center gap-1.5" style={{ color: '#FF3333' }}>
          <WifiOff size={12} />
          <span className="font-mono font-bold" style={{ fontSize: '11px' }}>Offline</span>
        </div>
      )}
      {connectionStatus === 'reconnected' && (
        <div className="flex items-center gap-1.5" style={{ color: '#22C55E', animation: 'fadeIn 0.15s ease-out' }}>
          <Wifi size={12} />
          <span className="font-mono font-bold" style={{ fontSize: '11px' }}>Back online</span>
        </div>
      )}

      {/* Timer display — Pomodoro takes priority over generic timer */}
      {pomodoroActive ? (
        <button
          onClick={() => setPomodoroOpen(true)}
          className={`flex items-center gap-2 cursor-pointer transition-colors ${pomodoroPhase === 'work' ? 'text-orange-400 hover:text-orange-300' : 'text-emerald-400 hover:text-emerald-300'}`}
          title="Open Pomodoro Timer"
        >
          <Flame size={12} />
          <span className="font-mono font-bold" style={{ fontSize: '12px' }}>{pomodoroDisplay}</span>
        </button>
      ) : runningTimer && elapsed ? (
        <button
          onClick={async () => {
            try {
              await timeEntriesApi.stop(runningTimer.id, runningTimer.notes || '')
              await useAppStore.getState().refreshTimeEntries()
              await useAppStore.getState().refreshRunningTimer()
              showToast('Timer stopped', 'success')
            } catch { showToast('Failed to stop timer', 'error') }
          }}
          className="flex items-center gap-2 text-ok hover:text-white transition-colors group cursor-pointer"
          title="Click to stop timer"
        >
          <div className="relative">
            <Timer size={12} className="group-hover:hidden" />
            <Square size={12} className="hidden group-hover:block text-err" fill="currentColor" />
          </div>
          <span className="font-mono font-bold" style={{ fontSize: '12px' }}>{elapsed}</span>
          {runningTimer.notes && (
            <span className="hidden md:inline text-dim" style={{ fontSize: '10px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {runningTimer.notes}
            </span>
          )}
        </button>
      ) : null}

      {/* Pomodoro toggle */}
      <button
        onClick={() => setPomodoroOpen(!pomodoroOpen)}
        className="topbar-icon-btn flex items-center gap-1.5 px-2.5 py-1.5"
        style={{
          color: pomodoroOpen ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
          backgroundColor: pomodoroOpen ? 'rgba(255,255,255,0.15)' : 'transparent',
        }}
        title="Pomodoro Timer"
      >
        <Clock size={13} />
        <span className="hidden md:inline" style={{ fontSize: '11px', fontWeight: 600 }}>Focus</span>
      </button>

      {/* AI Panel toggle */}
      <button
        onClick={() => setAiPanelOpen(!aiPanelOpen)}
        className="topbar-icon-btn flex items-center gap-1.5 px-2.5 py-1.5"
        style={{
          color: aiPanelOpen ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
          backgroundColor: aiPanelOpen ? 'rgba(255,255,255,0.15)' : 'transparent',
        }}
        title="AI Assistant (Ctrl+J)"
      >
        <Sparkles size={13} />
        <span style={{ fontSize: '11px', fontWeight: 600 }}>AI</span>
      </button>

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="topbar-icon-btn flex items-center justify-center w-8 h-8"
        style={{ color: 'rgba(255,255,255,0.5)' }}
        title="Toggle dark mode"
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
      </button>

      {/* Keyboard shortcuts help */}
      <button
        onClick={onHelpClick}
        className="topbar-icon-btn hidden md:flex items-center justify-center w-8 h-8"
        style={{ color: 'rgba(255,255,255,0.5)' }}
        title="Keyboard Shortcuts (?)"
        aria-label="Show keyboard shortcuts"
      >
        <HelpCircle size={14} />
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
        <div className="topbar-avatar w-7 h-7 rounded-full flex items-center justify-center" title="Profile" style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.2)' }}>
          <span className="font-bold" style={{ fontSize: '10px', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.8)' }}>
            {initials}
          </span>
        </div>
      </div>
    </header>
  )
}
