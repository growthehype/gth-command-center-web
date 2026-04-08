import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Timer, Pause, Play, RotateCcw, SkipForward, ChevronDown, ChevronUp, X, Minus, Coffee, Flame, Settings } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { timeEntries as timeEntriesApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimerPhase = 'work' | 'shortBreak' | 'longBreak'
type TimerStatus = 'idle' | 'running' | 'paused'

interface PomodoroSettings {
  workMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  longBreakInterval: number
}

const WORK_PRESETS = [15, 25, 30, 45, 50]
const SHORT_BREAK_PRESETS = [3, 5, 10]
const LONG_BREAK_PRESETS = [10, 15, 20, 30]

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
}

// ---------------------------------------------------------------------------
// Audio helper  (Web Audio API — no external files)
// ---------------------------------------------------------------------------

function playCompletionTone() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15)
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.15 + 0.04)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.15 + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.15)
      osc.stop(ctx.currentTime + i * 0.15 + 0.4)
    })
    // close context after all notes finish
    setTimeout(() => ctx.close(), 1200)
  } catch {
    // Audio not available — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Circular Progress SVG
// ---------------------------------------------------------------------------

function CircularProgress({
  percent,
  phase,
  size = 180,
  strokeWidth = 6,
}: {
  percent: number
  phase: TimerPhase
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percent)

  const colorMap: Record<TimerPhase, string> = {
    work: 'stroke-orange-500',
    shortBreak: 'stroke-emerald-500',
    longBreak: 'stroke-sky-500',
  }

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-border"
      />
      {/* Progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={colorMap[phase]}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PomodoroTimer({ onClose }: { onClose: () => void }) {
  const { projects, clients, runningTimer, refreshTimeEntries, refreshRunningTimer, setPomodoroStatus } = useAppStore()

  // ---- Settings -----------------------------------------------------------
  const [settings, setSettings] = useState<PomodoroSettings>(() => {
    try {
      const saved = localStorage.getItem('pomodoro-settings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    localStorage.setItem('pomodoro-settings', JSON.stringify(settings))
  }, [settings])

  // ---- Timer state --------------------------------------------------------
  const [phase, setPhase] = useState<TimerPhase>('work')
  const [status, setStatus] = useState<TimerStatus>('idle')
  const [secondsLeft, setSecondsLeft] = useState(settings.workMinutes * 60)
  const [completedPomodoros, setCompletedPomodoros] = useState(0)
  const [minimized, setMinimized] = useState(false)

  // ---- Linking state ------------------------------------------------------
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [billable, setBillable] = useState(true)
  const [notes, setNotes] = useState('')

  // ---- Refs ---------------------------------------------------------------
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeTimeEntryIdRef = useRef<string | null>(null)
  const isStoppingRef = useRef(false)

  // ---- Derived values -----------------------------------------------------
  const totalSeconds = useMemo(() => {
    switch (phase) {
      case 'work': return settings.workMinutes * 60
      case 'shortBreak': return settings.shortBreakMinutes * 60
      case 'longBreak': return settings.longBreakMinutes * 60
    }
  }, [phase, settings])

  const percent = totalSeconds > 0 ? secondsLeft / totalSeconds : 0
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  // ---- Auto-select client when project is chosen --------------------------
  useEffect(() => {
    if (selectedProjectId) {
      const project = projects.find(p => p.id === selectedProjectId)
      if (project?.client_id) {
        setSelectedClientId(project.client_id)
      }
    }
  }, [selectedProjectId, projects])

  // ---- Sync with existing running timer -----------------------------------
  useEffect(() => {
    if (runningTimer && !activeTimeEntryIdRef.current) {
      activeTimeEntryIdRef.current = runningTimer.id
    }
  }, [runningTimer])

  // ---- Timer tick ---------------------------------------------------------
  useEffect(() => {
    if (status !== 'running') {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          handlePhaseComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // ---- Phase completion ---------------------------------------------------
  const handlePhaseComplete = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setStatus('idle')
    playCompletionTone()

    if (phase === 'work') {
      // Stop time entry
      await stopTimeEntry()
      const newCount = completedPomodoros + 1
      setCompletedPomodoros(newCount)
      showToast(`Pomodoro #${newCount} complete! Time for a break.`, 'success')

      // Determine next break type
      if (newCount % settings.longBreakInterval === 0) {
        setPhase('longBreak')
        setSecondsLeft(settings.longBreakMinutes * 60)
      } else {
        setPhase('shortBreak')
        setSecondsLeft(settings.shortBreakMinutes * 60)
      }
    } else {
      // Break finished
      showToast('Break over — ready to focus!', 'info')
      setPhase('work')
      setSecondsLeft(settings.workMinutes * 60)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, completedPomodoros, settings])

  // ---- Time entry helpers -------------------------------------------------
  const startTimeEntry = async () => {
    try {
      const entry = await timeEntriesApi.start({
        project_id: selectedProjectId || null,
        client_id: selectedClientId || null,
        notes: notes || 'Pomodoro session',
        billable: billable ? 1 : 0,
      })
      activeTimeEntryIdRef.current = entry.id
      await Promise.all([refreshTimeEntries(), refreshRunningTimer()])
    } catch (err) {
      console.error('Failed to start time entry:', err)
      showToast('Could not start time tracking', 'error')
    }
  }

  const stopTimeEntry = async () => {
    if (isStoppingRef.current) return
    const id = activeTimeEntryIdRef.current
    if (!id) return
    isStoppingRef.current = true
    try {
      await timeEntriesApi.stop(id, notes || 'Pomodoro session')
      activeTimeEntryIdRef.current = null
      await Promise.all([refreshTimeEntries(), refreshRunningTimer()])
    } catch (err) {
      console.error('Failed to stop time entry:', err)
      showToast('Could not stop time tracking', 'error')
    } finally {
      isStoppingRef.current = false
    }
  }

  // ---- Controls -----------------------------------------------------------
  const handleStart = async () => {
    setStatus('running')
    if (phase === 'work') {
      await startTimeEntry()
    }
  }

  const handlePause = () => {
    setStatus('paused')
  }

  const handleResume = () => {
    setStatus('running')
  }

  const handleReset = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setStatus('idle')
    if (phase === 'work') await stopTimeEntry()
    setSecondsLeft(totalSeconds)
  }

  const handleSkip = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setStatus('idle')
    if (phase === 'work') await stopTimeEntry()
    // Move to next phase
    if (phase === 'work') {
      const newCount = completedPomodoros + 1
      setCompletedPomodoros(newCount)
      if (newCount % settings.longBreakInterval === 0) {
        setPhase('longBreak')
        setSecondsLeft(settings.longBreakMinutes * 60)
      } else {
        setPhase('shortBreak')
        setSecondsLeft(settings.shortBreakMinutes * 60)
      }
    } else {
      setPhase('work')
      setSecondsLeft(settings.workMinutes * 60)
    }
  }

  // ---- Broadcast state to store (so topbar can show it) ------------------
  useEffect(() => {
    if (status === 'running' || status === 'paused') {
      const label = phase === 'work' ? 'Focus' : 'Break'
      setPomodoroStatus(true, `${label} ${display}`, phase === 'work' ? 'work' : 'break')
    } else {
      setPomodoroStatus(false, '', 'work')
    }
  }, [status, phase, display, setPomodoroStatus])

  // Clear pomodoro status on unmount (close)
  useEffect(() => {
    return () => { setPomodoroStatus(false, '', 'work') }
  }, [setPomodoroStatus])

  // ---- Phase label --------------------------------------------------------
  const phaseLabel = phase === 'work' ? 'Focus' : phase === 'shortBreak' ? 'Short Break' : 'Long Break'
  const phaseIcon = phase === 'work' ? <Flame size={14} /> : <Coffee size={14} />
  const phaseColor = phase === 'work' ? 'text-orange-400' : phase === 'shortBreak' ? 'text-emerald-400' : 'text-sky-400'

  // ---- Minimized view -----------------------------------------------------
  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 shadow-xl cursor-pointer select-none"
        onClick={() => setMinimized(false)}
      >
        <Timer size={16} className={phaseColor} />
        <span className={`font-mono text-sm ${phaseColor}`}>{display}</span>
        {status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />}
        <button onClick={(e) => { e.stopPropagation(); onClose() }} className="ml-1 text-dim hover:text-polar transition-colors">
          <X size={14} />
        </button>
      </div>
    )
  }

  // ---- Full panel ---------------------------------------------------------
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Timer size={16} className="text-polar" />
          <span className="text-sm font-medium text-polar">Pomodoro</span>
          <span className="text-xs text-dim ml-1">#{completedPomodoros + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSettings(!showSettings)} className="p-1 text-dim hover:text-polar transition-colors rounded" title="Settings">
            <Settings size={14} />
          </button>
          <button onClick={() => setMinimized(true)} className="p-1 text-dim hover:text-polar transition-colors rounded" title="Minimize">
            <Minus size={14} />
          </button>
          <button onClick={onClose} className="p-1 text-dim hover:text-polar transition-colors rounded" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-border space-y-3">
          <div>
            <label className="label text-dim text-[10px] uppercase tracking-wider">Work (min)</label>
            <div className="flex gap-1 mt-1">
              {WORK_PRESETS.map(m => (
                <button key={m} disabled={status !== 'idle'}
                  onClick={() => { setSettings(s => ({ ...s, workMinutes: m })); if (phase === 'work') setSecondsLeft(m * 60) }}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${settings.workMinutes === m ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'border-border text-dim hover:text-polar'} ${status !== 'idle' ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label text-dim text-[10px] uppercase tracking-wider">Short Break (min)</label>
            <div className="flex gap-1 mt-1">
              {SHORT_BREAK_PRESETS.map(m => (
                <button key={m} disabled={status !== 'idle'}
                  onClick={() => { setSettings(s => ({ ...s, shortBreakMinutes: m })); if (phase === 'shortBreak') setSecondsLeft(m * 60) }}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${settings.shortBreakMinutes === m ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'border-border text-dim hover:text-polar'} ${status !== 'idle' ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label text-dim text-[10px] uppercase tracking-wider">Long Break (min)</label>
            <div className="flex gap-1 mt-1">
              {LONG_BREAK_PRESETS.map(m => (
                <button key={m} disabled={status !== 'idle'}
                  onClick={() => { setSettings(s => ({ ...s, longBreakMinutes: m })); if (phase === 'longBreak') setSecondsLeft(m * 60) }}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${settings.longBreakMinutes === m ? 'bg-sky-500/20 border-sky-500/40 text-sky-300' : 'border-border text-dim hover:text-polar'} ${status !== 'idle' ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timer Display */}
      <div className="flex flex-col items-center py-5 px-4">
        {/* Phase Badge */}
        <div className={`flex items-center gap-1.5 text-xs font-medium mb-4 ${phaseColor}`}>
          {phaseIcon}
          <span>{phaseLabel}</span>
        </div>

        {/* Circular Progress + Time */}
        <div className="relative flex items-center justify-center">
          <CircularProgress percent={percent} phase={phase} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-mono text-4xl font-semibold tracking-tight ${phaseColor}`}>{display}</span>
            {status === 'running' && (
              <span className="text-[10px] text-dim mt-1 uppercase tracking-wider">
                {phase === 'work' ? 'Focusing...' : 'Resting...'}
              </span>
            )}
            {status === 'paused' && (
              <span className="text-[10px] text-warn mt-1 uppercase tracking-wider">Paused</span>
            )}
          </div>
        </div>

        {/* Session dots */}
        <div className="flex items-center gap-1.5 mt-4">
          {Array.from({ length: settings.longBreakInterval }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i < (completedPomodoros % settings.longBreakInterval)
                  ? 'bg-orange-500'
                  : 'bg-border'
              }`}
            />
          ))}
          {completedPomodoros > 0 && (
            <span className="text-[10px] text-dim ml-2">{completedPomodoros} done</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 mt-5">
          {status === 'idle' && (
            <button onClick={handleStart} className="btn-primary flex items-center gap-1.5 px-5 py-2 text-sm">
              <Play size={14} /> Start
            </button>
          )}
          {status === 'running' && (
            <>
              <button onClick={handlePause} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm">
                <Pause size={14} /> Pause
              </button>
              <button onClick={handleSkip} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm text-dim">
                <SkipForward size={14} /> Skip
              </button>
            </>
          )}
          {status === 'paused' && (
            <>
              <button onClick={handleResume} className="btn-primary flex items-center gap-1.5 px-5 py-2 text-sm">
                <Play size={14} /> Resume
              </button>
              <button onClick={handleReset} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm text-dim">
                <RotateCcw size={14} /> Reset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Linking Section */}
      <div className="px-4 pb-4 space-y-2.5 border-t border-border pt-3">
        {/* Project */}
        <div>
          <label className="label text-dim text-[10px] uppercase tracking-wider">Project</label>
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            disabled={status === 'running'}
            className="w-full bg-cell border border-border px-3 py-2 text-polar text-xs rounded mt-1 disabled:opacity-50"
          >
            <option value="">No project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.title}{p.client_name ? ` (${p.client_name})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Client */}
        <div>
          <label className="label text-dim text-[10px] uppercase tracking-wider">Client</label>
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            disabled={status === 'running'}
            className="w-full bg-cell border border-border px-3 py-2 text-polar text-xs rounded mt-1 disabled:opacity-50"
          >
            <option value="">No client</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="label text-dim text-[10px] uppercase tracking-wider">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="What are you working on?"
            className="w-full bg-cell border border-border px-3 py-2 text-polar text-xs rounded mt-1 placeholder:text-steel"
          />
        </div>

        {/* Billable toggle */}
        <div className="flex items-center justify-between">
          <label className="label text-dim text-[10px] uppercase tracking-wider">Billable</label>
          <button
            onClick={() => setBillable(!billable)}
            disabled={status === 'running'}
            className={`relative w-9 h-5 rounded-full transition-colors ${billable ? 'bg-orange-500' : 'bg-border'} ${status === 'running' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${billable ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>
    </div>
  )
}
