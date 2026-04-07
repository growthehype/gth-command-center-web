import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/lib/store'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
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

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-obsidian flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <img
            src="/icon.png"
            alt="GTH Logo"
            className="w-16 h-16 mx-auto mb-4 rounded-lg"
          />
          <h1 className="text-2xl font-bold text-polar tracking-tight">
            GTH Operations Command Center
          </h1>
          <p className="text-sm text-frost mt-1">
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div className="bg-charcoal border border-graphite rounded-xl p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-frost mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2 bg-obsidian border border-graphite rounded-lg text-polar placeholder-frost/40 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-frost mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                minLength={6}
                className="w-full px-3 py-2 bg-obsidian border border-graphite rounded-lg text-polar placeholder-frost/40 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="Your password"
              />
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-frost/60 hover:text-frost transition-colors mt-1.5 cursor-pointer bg-transparent border-none p-0"
              >
                Forgot password?
              </button>
            </div>

            {/* Success message */}
            {resetMsg && (
              <div className="text-green-400 text-sm bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
                {resetMsg}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait...' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-graphite" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-charcoal px-2 text-frost/50">or</span>
            </div>
          </div>

          {/* Demo button */}
          <button
            onClick={enterDemoMode}
            className="w-full py-2.5 rounded-lg font-medium border border-graphite text-frost hover:bg-graphite/40 transition-colors"
          >
            Try Demo
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-frost/40 mt-6">
          GTH Digital Marketing Agency
        </p>
      </div>
    </div>
  )
}
