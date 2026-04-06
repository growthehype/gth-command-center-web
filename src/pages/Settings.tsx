import { useState, useEffect, useCallback } from 'react'
import { Settings as SettingsIcon, Download, Upload, Database, Shield, Eye, EyeOff } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { showToast } from '@/components/ui/Toast'
import { settings as settingsApi } from '@/lib/api'

const AUTO_LOCK_OPTIONS = [
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '60 minutes' },
  { value: 'never', label: 'Never' },
]

const DATE_FORMATS = ['MMM d, yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']
const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD']
const WEEK_STARTS = [
  { value: '1', label: 'Monday' },
  { value: '0', label: 'Sunday' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-surface">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="font-[800] uppercase" style={{ fontSize: '11px', letterSpacing: '0.14em' }}>{title}</h3>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  )
}

export default function Settings() {
  const { settings, refreshSettings } = useAppStore()

  /* ── Local state ── */
  const [displayName, setDisplayName] = useState('')
  const [avatarInitials, setAvatarInitials] = useState('')
  const [autoLock, setAutoLock] = useState('15')
  const [weekStart, setWeekStart] = useState('1')
  const [dateFormat, setDateFormat] = useState('MMM d, yyyy')
  const [currency, setCurrency] = useState('CAD')
  const [theme, setTheme] = useState('dark')

  // Password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwChanging, setPwChanging] = useState(false)

  // AI
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiKey, setAiKey] = useState('')
  const [aiKeyVisible, setAiKeyVisible] = useState(false)
  const [aiModel, setAiModel] = useState('claude-opus-4-6')

  // Reset confirm
  const [resetCount, setResetCount] = useState(0)

  /* ── Hydrate from settings ── */
  useEffect(() => {
    setDisplayName(settings.display_name || '')
    setAvatarInitials(settings.avatar_initials || '')
    setAutoLock(settings.auto_lock_timeout || '15')
    setWeekStart(settings.week_start || '1')
    setDateFormat(settings.date_format || 'MMM d, yyyy')
    setCurrency(settings.currency || 'CAD')
    setTheme(settings.theme || 'dark')
    setAiEnabled(settings.ai_enabled === 'true')
    setAiKey(settings.ai_api_key || '')
    setAiModel(settings.ai_model || 'claude-opus-4-6')
  }, [settings])

  /* ── Save a single setting ── */
  const saveSetting = useCallback(async (key: string, value: string) => {
    try {
      await settingsApi.set(key, value)
      await refreshSettings()
    } catch {
      showToast('Failed to save setting', 'error')
    }
  }, [refreshSettings])

  /* ── Change password ── */
  const handleChangePassword = useCallback(async () => {
    if (!currentPw || !newPw) return
    if (newPw !== confirmPw) {
      showToast('Passwords do not match', 'error')
      return
    }
    if (newPw.length < 6) {
      showToast('Password must be at least 6 characters', 'error')
      return
    }
    setPwChanging(true)
    try {
      // Password change handled by Supabase auth
      const { error } = await (await import('@/lib/supabase')).supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      showToast('Password changed', 'success')
    } catch {
      showToast('Failed to change password. Check current password.', 'error')
    } finally {
      setPwChanging(false)
    }
  }, [currentPw, newPw, confirmPw])

  /* ── Export / Import / Backup ── */
  const handleExport = useCallback(async () => {
    showToast('Export is not available in the web version', 'info')
  }, [])

  const handleImport = useCallback(async () => {
    showToast('Import is not available in the web version', 'info')
  }, [])

  const handleBackup = useCallback(async () => {
    showToast('Backup is automatic with Supabase', 'info')
  }, [])

  const handleReset = useCallback(async () => {
    if (resetCount < 2) {
      setResetCount(prev => prev + 1)
      showToast(
        resetCount === 0 ? 'Click again to confirm reset' : 'Click one more time to reset everything',
        'warn'
      )
      setTimeout(() => setResetCount(0), 4000)
      return
    }
    showToast('Dashboard reset is not available in the web version', 'info')
    setResetCount(0)
  }, [resetCount])

  const inputClass = 'w-full bg-cell border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors'
  const selectClass = 'w-full bg-cell border border-border px-3 py-2 text-polar focus:outline-none focus:border-dim transition-colors cursor-pointer'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1>Settings</h1>
        <SettingsIcon size={14} className="text-dim" />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* ── System Info ── */}
        <Section title="System Info">
          <div className="flex items-center justify-between">
            <span className="text-steel" style={{ fontSize: '12px' }}>App Version</span>
            <span className="text-polar mono" style={{ fontSize: '12px' }}>1.0.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-steel" style={{ fontSize: '12px' }}>Database</span>
            <span className="text-dim mono truncate ml-4" style={{ fontSize: '11px', maxWidth: '220px' }}>
              {settings.db_path || '~/gth-command-center/data.db'}
            </span>
          </div>
        </Section>

        {/* ── Account ── */}
        <Section title="Account">
          <div>
            <label className="label text-steel block mb-1.5">Current Password</label>
            <input
              type="password"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              className={inputClass}
              style={{ fontSize: '13px' }}
              placeholder="Current password"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-steel block mb-1.5">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                className={inputClass}
                style={{ fontSize: '13px' }}
                placeholder="New password"
              />
            </div>
            <div>
              <label className="label text-steel block mb-1.5">Confirm</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                className={inputClass}
                style={{ fontSize: '13px' }}
                placeholder="Confirm password"
              />
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={handleChangePassword}
            disabled={!currentPw || !newPw || !confirmPw || pwChanging}
            style={{ opacity: currentPw && newPw && confirmPw ? 1 : 0.4 }}
          >
            {pwChanging ? 'Changing...' : 'Change Password'}
          </button>
        </Section>

        {/* ── Profile ── */}
        <Section title="Profile">
          <div>
            <label className="label text-steel block mb-1.5">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onBlur={() => saveSetting('display_name', displayName)}
              className={inputClass}
              style={{ fontSize: '13px' }}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="label text-steel block mb-1.5">Avatar Initials</label>
            <input
              type="text"
              value={avatarInitials}
              onChange={e => setAvatarInitials(e.target.value.toUpperCase().slice(0, 3))}
              onBlur={() => saveSetting('avatar_initials', avatarInitials)}
              className={inputClass}
              style={{ fontSize: '13px', maxWidth: '80px' }}
              placeholder="OM"
              maxLength={3}
            />
          </div>
          <div>
            <label className="label text-steel block mb-1.5">Auto-Lock Timeout</label>
            <select
              value={autoLock}
              onChange={e => { setAutoLock(e.target.value); saveSetting('auto_lock_timeout', e.target.value) }}
              className={selectClass}
              style={{ fontSize: '13px' }}
            >
              {AUTO_LOCK_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </Section>

        {/* ── AI Assist ── */}
        <Section title="AI Assist">
          <div className="flex items-center justify-between">
            <span className="text-steel" style={{ fontSize: '12px' }}>Enable AI</span>
            <button
              onClick={() => { const v = !aiEnabled; setAiEnabled(v); saveSetting('ai_enabled', String(v)) }}
              className={`w-9 h-5 flex items-center px-0.5 transition-colors cursor-pointer ${aiEnabled ? 'bg-ok' : 'bg-border-hard'}`}
            >
              <div
                className="w-4 h-4 bg-polar transition-transform"
                style={{ transform: aiEnabled ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </button>
          </div>
          <div>
            <label className="label text-steel block mb-1.5">API Key</label>
            <div className="relative">
              <input
                type={aiKeyVisible ? 'text' : 'password'}
                value={aiKey}
                onChange={e => setAiKey(e.target.value)}
                onBlur={() => saveSetting('ai_api_key', aiKey)}
                className={inputClass}
                style={{ fontSize: '13px', paddingRight: '36px' }}
                placeholder="sk-ant-..."
              />
              <button
                onClick={() => setAiKeyVisible(!aiKeyVisible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-steel transition-colors cursor-pointer"
              >
                {aiKeyVisible ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </div>
          <div>
            <label className="label text-steel block mb-1.5">Model</label>
            <select
              value={aiModel}
              onChange={e => { setAiModel(e.target.value); saveSetting('ai_model', e.target.value) }}
              className={selectClass}
              style={{ fontSize: '13px' }}
            >
              <option value="claude-opus-4-6">claude-opus-4-6</option>
              <option value="claude-sonnet-4-20250514">claude-sonnet-4-20250514</option>
              <option value="claude-haiku-4-20250414">claude-haiku-4-20250414</option>
            </select>
          </div>
          <p className="text-dim" style={{ fontSize: '10px', lineHeight: '1.6' }}>
            When enabled, your questions and data context are sent to Anthropic's API. Vault credentials are never sent.
          </p>
        </Section>

        {/* ── Google Integrations ── */}
        <Section title="Integrations">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-polar block" style={{ fontSize: '13px', fontWeight: 600 }}>Google Drive</span>
              <span className="text-dim" style={{ fontSize: '10px' }}>Sync files and documents</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-dim" style={{ fontSize: '10px', fontStyle: 'italic' }}>Coming in v1.1</span>
              <button className="btn-ghost" disabled style={{ opacity: 0.3 }}>
                Connect
              </button>
            </div>
          </div>
        </Section>

        {/* ── Preferences ── */}
        <Section title="Preferences">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-steel block mb-1.5">Week Starts On</label>
              <select
                value={weekStart}
                onChange={e => { setWeekStart(e.target.value); saveSetting('week_start', e.target.value) }}
                className={selectClass}
                style={{ fontSize: '13px' }}
              >
                {WEEK_STARTS.map(w => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-steel block mb-1.5">Date Format</label>
              <select
                value={dateFormat}
                onChange={e => { setDateFormat(e.target.value); saveSetting('date_format', e.target.value) }}
                className={selectClass}
                style={{ fontSize: '13px' }}
              >
                {DATE_FORMATS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-steel block mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={e => { setCurrency(e.target.value); saveSetting('currency', e.target.value) }}
                className={selectClass}
                style={{ fontSize: '13px' }}
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-steel block mb-1.5">Theme</label>
              <select
                value={theme}
                onChange={e => { setTheme(e.target.value); saveSetting('theme', e.target.value) }}
                className={selectClass}
                style={{ fontSize: '13px' }}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>
        </Section>

        {/* ── Actions ── */}
        <Section title="Data & Actions">
          <div className="flex items-center gap-3 flex-wrap">
            <button className="btn-ghost flex items-center gap-2" onClick={handleExport}>
              <Download size={11} />
              Export JSON
            </button>
            <button className="btn-ghost flex items-center gap-2" onClick={handleImport}>
              <Upload size={11} />
              Import JSON
            </button>
            <button className="btn-ghost flex items-center gap-2" onClick={handleBackup}>
              <Database size={11} />
              Backup Now
            </button>
          </div>
          <div className="border-t border-border pt-4">
            <button
              className="px-4 py-2 border border-err text-err font-sans uppercase font-bold cursor-pointer hover:bg-err/10 transition-colors"
              style={{ fontSize: '10px', letterSpacing: '0.14em' }}
              onClick={handleReset}
            >
              <div className="flex items-center gap-2">
                <Shield size={10} />
                {resetCount === 0 ? 'Reset Dashboard' : resetCount === 1 ? 'Confirm Reset?' : 'Final Confirm -- DELETE ALL'}
              </div>
            </button>
            <p className="text-dim mt-2" style={{ fontSize: '10px' }}>
              This will permanently delete all data. Click 3 times to confirm.
            </p>
          </div>
        </Section>
      </div>
    </div>
  )
}
