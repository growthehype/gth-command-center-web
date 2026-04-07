import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { LayoutDashboard, Bot, CheckSquare, Users } from 'lucide-react'

const STORAGE_KEY = 'gth_onboarded'

const features = [
  { icon: LayoutDashboard, label: 'Dashboard', desc: 'Real-time overview of your agency metrics' },
  { icon: Bot, label: 'AI Assistant', desc: 'Get answers and insights with Ctrl+J' },
  { icon: CheckSquare, label: 'Task Management', desc: 'Prioritized tasks with smart reminders' },
  { icon: Users, label: 'Client Tracking', desc: 'Full CRM with health scores and activity' },
]

const tips = [
  { kbd: 'Ctrl+K', text: 'for search' },
  { kbd: 'Ctrl+J', text: 'for AI' },
  { kbd: '?', text: 'for all shortcuts' },
]

export default function WelcomeModal() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [fadeClass, setFadeClass] = useState('welcome-fade-in')
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== 'true') {
      setOpen(true)
    }
  }, [])

  if (!open) return null

  const close = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setOpen(false)
  }

  const goStep = (next: number) => {
    setFadeClass('welcome-fade-out')
    setTimeout(() => {
      setStep(next)
      setFadeClass('welcome-fade-in')
    }, 180)
  }

  const handleAddClient = () => {
    close()
    setCurrentPage('clients')
  }

  const handleExplore = () => {
    close()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      >
        {/* Modal */}
        <div
          className="relative w-full max-w-md mx-4 border border-border bg-surface"
          style={{
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            animation: 'welcome-scale-in 0.25s ease-out',
          }}
        >
          {/* Content area */}
          <div className={`px-7 pt-8 pb-6 ${fadeClass}`} style={{ minHeight: '320px' }}>
            {step === 0 && (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-polar mb-2" style={{ letterSpacing: '-0.01em' }}>
                    Welcome to your Command Center
                  </h2>
                  <p className="text-steel" style={{ fontSize: '13px' }}>
                    Your AI-powered CRM is ready. Here's a quick tour.
                  </p>
                </div>
                <div className="space-y-3">
                  {features.map((f) => (
                    <div key={f.label} className="flex items-center gap-4 px-4 py-3 border border-border rounded bg-surface-2/40">
                      <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center border border-border rounded" style={{ backgroundColor: 'var(--color-surface-2, #1a1a2e)' }}>
                        <f.icon size={16} className="text-polar" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-polar font-semibold" style={{ fontSize: '13px' }}>{f.label}</div>
                        <div className="text-dim" style={{ fontSize: '11px' }}>{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-end">
                  <button className="btn-primary px-6" onClick={() => goStep(1)}>Next</button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-polar mb-2">Quick Tips</h2>
                  <p className="text-steel" style={{ fontSize: '13px' }}>
                    A few things to help you move fast.
                  </p>
                </div>
                <div className="space-y-4">
                  {/* Keyboard shortcuts */}
                  <div className="px-4 py-3 border border-border rounded bg-surface-2/40">
                    <div className="text-polar font-semibold mb-2" style={{ fontSize: '13px' }}>Keyboard Shortcuts</div>
                    <div className="flex flex-wrap gap-3">
                      {tips.map((t) => (
                        <div key={t.kbd} className="flex items-center gap-1.5">
                          <kbd className="px-1.5 py-0.5 border border-border rounded text-polar font-mono" style={{ fontSize: '11px', backgroundColor: 'var(--color-surface-2, #1a1a2e)' }}>
                            {t.kbd}
                          </kbd>
                          <span className="text-dim" style={{ fontSize: '11px' }}>{t.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tips list */}
                  <div className="space-y-2 px-1">
                    <div className="flex items-start gap-3">
                      <span className="text-ok mt-0.5" style={{ fontSize: '14px' }}>&#x2713;</span>
                      <p className="text-steel" style={{ fontSize: '13px' }}>Your sidebar has everything organized by category</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-ok mt-0.5" style={{ fontSize: '14px' }}>&#x2713;</span>
                      <p className="text-steel" style={{ fontSize: '13px' }}>Try the Daily Briefing each morning for a productivity boost</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-between">
                  <button className="btn-ghost px-4" onClick={() => goStep(0)}>Back</button>
                  <button className="btn-primary px-6" onClick={() => goStep(2)}>Next</button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-polar mb-2">You're all set!</h2>
                  <p className="text-steel" style={{ fontSize: '13px' }}>
                    Start by adding your first client, or explore the demo data.
                  </p>
                </div>
                <div className="flex items-center justify-center" style={{ minHeight: '140px' }}>
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-surface-2, #1a1a2e)', border: '2px solid var(--color-ok, #A3BE8C)' }}>
                      <span style={{ fontSize: '28px' }}>&#x2713;</span>
                    </div>
                    <p className="text-dim" style={{ fontSize: '12px' }}>Your Command Center is ready to go.</p>
                  </div>
                </div>
                <div className="mt-6 flex justify-center gap-3">
                  <button className="btn-ghost px-5" onClick={handleExplore}>Explore Dashboard</button>
                  <button className="btn-primary px-5" onClick={handleAddClient}>Add First Client</button>
                </div>
              </>
            )}
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 pb-5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: step === i ? '20px' : '6px',
                  height: '6px',
                  backgroundColor: step === i ? 'var(--color-polar, #E5E9F0)' : 'var(--color-border-hard, #555)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes welcome-scale-in {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .welcome-fade-in {
          animation: welcome-step-in 0.2s ease-out forwards;
        }
        .welcome-fade-out {
          animation: welcome-step-out 0.15s ease-in forwards;
        }
        @keyframes welcome-step-in {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes welcome-step-out {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(-12px); }
        }
      `}</style>
    </>
  )
}
