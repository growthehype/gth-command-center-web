import { useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/lib/store'

function PasswordStrength({ password }: { password: string }) {
  const strength = useMemo(() => {
    if (!password) return { level: 0, label: '', color: '' }
    let score = 0
    if (password.length >= 6) score++
    if (password.length >= 10) score++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
    if (/\d/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    if (score <= 2) return { level: 1, label: 'WEAK', color: 'bg-err' }
    if (score <= 3) return { level: 2, label: 'MEDIUM', color: 'bg-warn' }
    return { level: 3, label: 'STRONG', color: 'bg-ok' }
  }, [password])

  if (!password) return null

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-[3px] flex-1 transition-all duration-300 ${
              i <= strength.level ? strength.color : 'bg-border'
            }`}
          />
        ))}
      </div>
      <p
        className="mt-1"
        style={{
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase' as const,
          color: strength.level === 1 ? '#FF3333' : strength.level === 2 ? '#D97706' : '#22C55E',
        }}
      >
        {strength.label}
      </p>
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const enterDemoMode = useAppStore((s) => s.enterDemoMode)

  const handleForgotPassword = async () => {
    setResetMsg(null)
    setError(null)
    if (!email.trim()) {
      setError('Enter your email address first')
      return
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error
      setResetMsg('Password reset email sent! Check your inbox.')
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResetMsg(null)

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }
      try {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setResetMsg('Check your email for a confirmation link.')
      } catch (err: any) {
        setError(err.message || 'Something went wrong')
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login')
    setError(null)
    setResetMsg(null)
    setConfirmPassword('')
  }

  const features = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="18" rx="0" />
          <line x1="2" y1="9" x2="22" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      ),
      label: 'Invoice Builder',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      label: 'Client Portal',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22" />
          <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93" />
          <path d="M8 14h8" />
          <path d="M9 18h6" />
        </svg>
      ),
      label: 'AI Assistant',
    },
  ]

  return (
    <div className="min-h-screen flex bg-obsidian">
      {/* ── Left Panel: Branding (desktop only) ── */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden"
        style={{ background: '#000' }}
      >
        {/* Animated gradient background */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse at 20% 50%, rgba(37, 99, 235, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(37, 99, 235, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(120, 120, 120, 0.06) 0%, transparent 50%)',
            animation: 'loginGradientShift 12s ease-in-out infinite alternate',
          }}
        />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          {/* Logo */}
          <img
            src="/icon.png"
            alt="GTH Logo"
            className="w-20 h-20 mb-10"
            style={{ filter: 'brightness(1.1)' }}
          />

          {/* Title */}
          <h1
            className="text-white mb-4"
            style={{
              fontSize: '13px',
              fontWeight: 800,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              lineHeight: 1.6,
            }}
          >
            Operations
            <br />
            Command Center
          </h1>

          {/* Divider */}
          <div
            className="w-8 mb-6"
            style={{
              height: '2px',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
            }}
          />

          {/* Tagline */}
          <p
            className="text-white/40 mb-16"
            style={{
              fontSize: '12px',
              fontWeight: 500,
              letterSpacing: '0.08em',
            }}
          >
            Run your business from one place.
          </p>

          {/* Feature highlights */}
          <div className="flex gap-10">
            {features.map((f) => (
              <div key={f.label} className="flex flex-col items-center gap-3">
                <div className="text-white/25">{f.icon}</div>
                <span
                  className="text-white/35"
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                  }}
                >
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom credit */}
        <p
          className="absolute bottom-8 text-white/15"
          style={{
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          GTH Digital Marketing Agency
        </p>
      </div>

      {/* ── Right Panel: Form ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <img
              src="/icon.png"
              alt="GTH Logo"
              className="w-14 h-14 mx-auto mb-5"
            />
            <p
              className="text-polar"
              style={{
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
              }}
            >
              Operations Command Center
            </p>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2
              className="text-polar"
              style={{
                fontSize: '22px',
                fontWeight: 900,
                letterSpacing: '-0.02em',
              }}
            >
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </h2>
            <p
              className="text-dim mt-1"
              style={{ fontSize: '12px', fontWeight: 500 }}
            >
              {mode === 'login'
                ? 'Enter your credentials to continue.'
                : 'Set up your account to get started.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-polar mb-2"
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 bg-surface border border-border text-polar placeholder-dim focus:border-info"
                style={{ fontSize: '13px', fontWeight: 500 }}
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-polar mb-2"
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={6}
                className="w-full px-4 py-3 bg-surface border border-border text-polar placeholder-dim focus:border-info"
                style={{ fontSize: '13px', fontWeight: 500 }}
                placeholder={mode === 'login' ? 'Your password' : 'Min. 6 characters'}
              />

              {/* Password strength (signup only) */}
              <div
                className="overflow-hidden transition-all duration-300"
                style={{
                  maxHeight: mode === 'signup' ? '50px' : '0px',
                  opacity: mode === 'signup' ? 1 : 0,
                }}
              >
                {mode === 'signup' && <PasswordStrength password={password} />}
              </div>

              {/* Forgot password (login only) */}
              <div
                className="overflow-hidden transition-all duration-300"
                style={{
                  maxHeight: mode === 'login' ? '30px' : '0px',
                  opacity: mode === 'login' ? 1 : 0,
                }}
              >
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-dim hover:text-polar transition-colors mt-2 cursor-pointer bg-transparent border-none p-0"
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            </div>

            {/* Confirm Password (signup only) */}
            <div
              className="overflow-hidden transition-all duration-300"
              style={{
                maxHeight: mode === 'signup' ? '120px' : '0px',
                opacity: mode === 'signup' ? 1 : 0,
              }}
            >
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-polar mb-2"
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                  }}
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required={mode === 'signup'}
                  autoComplete="new-password"
                  minLength={6}
                  className="w-full px-4 py-3 bg-surface border border-border text-polar placeholder-dim focus:border-info"
                  style={{ fontSize: '13px', fontWeight: 500 }}
                  placeholder="Repeat your password"
                />
              </div>
            </div>

            {/* Success message */}
            {resetMsg && (
              <div
                className="text-ok bg-ok/10 border border-ok/20 px-4 py-3"
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                {resetMsg}
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                className="text-err bg-err/10 border border-err/20 px-4 py-3"
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 font-sans disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em' }}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  {mode === 'login' ? 'SIGNING IN...' : 'CREATING ACCOUNT...'}
                </span>
              ) : mode === 'login' ? (
                'SIGN IN'
              ) : (
                'CREATE ACCOUNT'
              )}
            </button>
          </form>

          {/* Mode switch */}
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={switchMode}
              className="text-dim hover:text-polar transition-colors bg-transparent border-none cursor-pointer p-0"
              style={{ fontSize: '11px', fontWeight: 600 }}
            >
              {mode === 'login' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <span className="text-polar" style={{ fontWeight: 700 }}>
                    Sign Up
                  </span>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <span className="text-polar" style={{ fontWeight: 700 }}>
                    Sign In
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span
                className="bg-obsidian px-3 text-dim"
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                }}
              >
                or
              </span>
            </div>
          </div>

          {/* Demo button */}
          <button
            onClick={enterDemoMode}
            className="btn-ghost w-full py-3"
          >
            Try Demo Mode
          </button>

          {/* Footer (mobile only) */}
          <p
            className="lg:hidden text-center text-dim mt-8"
            style={{
              fontSize: '9px',
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            GTH Digital Marketing Agency
          </p>
        </div>
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes loginGradientShift {
          0% {
            transform: scale(1) translate(0, 0);
          }
          100% {
            transform: scale(1.1) translate(2%, -2%);
          }
        }
      `}</style>
    </div>
  )
}
