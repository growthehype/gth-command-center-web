import { useState, useCallback } from 'react'
import { Building2, Mail, FileText, Palette, ArrowRight, ArrowLeft, Check, Upload } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { settings as settingsApi, services as servicesApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'

const STEPS = [
  { icon: Building2, title: 'Your Company', desc: 'Business name and contact info' },
  { icon: Mail, title: 'Email & Invoicing', desc: 'Invoice defaults and email signature' },
  { icon: Palette, title: 'Brand', desc: 'Logo and tagline' },
  { icon: FileText, title: 'Services', desc: 'What you offer' },
]

interface Props {
  open: boolean
  onComplete: () => void
}

export default function OnboardingWizard({ open, onComplete }: Props) {
  const { refreshSettings, services: existingServices } = useAppStore()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Step 1 — Company
  const [companyName, setCompanyName] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')

  // Step 2 — Email & Invoicing
  const [gstNumber, setGstNumber] = useState('')
  const [invoicePrefix, setInvoicePrefix] = useState('INV')
  const [currency, setCurrency] = useState('CAD')
  const [paymentInstructions, setPaymentInstructions] = useState('Payments can be made via e-transfer or credit card')
  const [emailSigName, setEmailSigName] = useState('')
  const [emailSigTitle, setEmailSigTitle] = useState('')
  const [termsText, setTermsText] = useState('Work begins once the initial deposit is received.\nPayment is due within the terms stated above. Late payments are subject to a 5% monthly service charge.\nAll creative, strategy, and digital assets remain the property of the provider until this invoice is paid in full.\nBy submitting payment, the client confirms acceptance of the deliverables and scope outlined in the original project agreement.')

  // Step 3 — Brand
  const [tagline, setTagline] = useState('')
  const [logoUrl, setLogoUrl] = useState('')

  // Step 4 — Services
  const [serviceList, setServiceList] = useState<string[]>([''])

  const saveSetting = useCallback(async (key: string, value: string) => {
    if (value.trim()) {
      await settingsApi.set(key, value.trim())
    }
  }, [])

  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      // Save all settings in parallel
      await Promise.all([
        saveSetting('company_name', companyName),
        saveSetting('company_email', companyEmail),
        saveSetting('company_phone', companyPhone),
        saveSetting('company_address', companyAddress),
        saveSetting('company_website', companyWebsite),
        saveSetting('gst_number', gstNumber),
        saveSetting('invoice_prefix', invoicePrefix || 'INV'),
        saveSetting('currency', currency),
        saveSetting('invoice_payment_instructions', paymentInstructions),
        saveSetting('invoice_terms_text', termsText),
        saveSetting('email_sig_name', emailSigName || companyName),
        saveSetting('email_sig_title', emailSigTitle),
        saveSetting('company_tagline', tagline),
        saveSetting('company_logo_url', logoUrl),
        saveSetting('onboarding_completed', 'true'),
        saveSetting('display_name', emailSigName || companyName),
      ])

      // Create services if entered
      for (const svc of serviceList.filter(s => s.trim())) {
        try {
          await servicesApi.create({ name: svc.trim(), pricing_model: 'fixed', active: 1 })
        } catch { /* skip duplicates */ }
      }

      await refreshSettings()
      showToast('Setup complete! Welcome to your Command Center.', 'success')
      onComplete()
    } catch (err) {
      console.error('Onboarding save error:', err)
      showToast('Failed to save — try again', 'error')
    } finally {
      setSaving(false)
    }
  }, [companyName, companyEmail, companyPhone, companyAddress, companyWebsite, gstNumber, invoicePrefix, currency, paymentInstructions, termsText, emailSigName, emailSigTitle, tagline, logoUrl, serviceList, saveSetting, refreshSettings, onComplete])

  if (!open) return null

  const canNext = step === 0 ? companyName.trim().length > 0 : true

  const inputClass = 'w-full bg-cell border border-border px-3 py-2 text-polar placeholder:text-dim focus:outline-none focus:border-dim transition-colors'
  const labelClass = 'label text-steel block mb-1.5'

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
      <div className="bg-surface border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-polar font-[800] uppercase" style={{ fontSize: '14px', letterSpacing: '0.1em' }}>
            Setup Your Command Center
          </h2>
          <p className="text-dim mt-1" style={{ fontSize: '12px' }}>
            {step + 1} of {STEPS.length} — {STEPS[step].desc}
          </p>
          {/* Progress */}
          <div className="flex gap-1.5 mt-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 transition-colors"
                style={{ backgroundColor: i <= step ? '#FFFFFF' : 'rgba(255,255,255,0.1)' }}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-5 space-y-4">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-2">
            {(() => { const Icon = STEPS[step].icon; return <Icon size={18} className="text-polar" /> })()}
            <h3 className="text-polar font-[700]" style={{ fontSize: '15px' }}>{STEPS[step].title}</h3>
          </div>

          {step === 0 && (
            <>
              <div>
                <label className={labelClass}>Company / Business Name *</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="Acme Marketing Inc." autoFocus />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="hello@company.com" />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input type="tel" value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="(555) 123-4567" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Address</label>
                <input type="text" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="123 Main Street, City, Province/State, Postal Code, Country" />
              </div>
              <div>
                <label className={labelClass}>Website</label>
                <input type="text" value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="www.company.com" />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Your Name (for email signature)</label>
                  <input type="text" value={emailSigName} onChange={e => setEmailSigName(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="John Smith" autoFocus />
                </div>
                <div>
                  <label className={labelClass}>Your Title</label>
                  <input type="text" value={emailSigTitle} onChange={e => setEmailSigTitle(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="CEO / Founder / Director" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Invoice Prefix</label>
                  <input type="text" value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value.toUpperCase())} className={inputClass} style={{ fontSize: '13px' }} placeholder="INV" maxLength={6} />
                  <span className="text-dim mt-1 block" style={{ fontSize: '10px' }}>e.g. {invoicePrefix || 'INV'}-001</span>
                </div>
                <div>
                  <label className={labelClass}>Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputClass} style={{ fontSize: '13px' }}>
                    <option value="CAD">CAD</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Tax / GST Number</label>
                  <input type="text" value={gstNumber} onChange={e => setGstNumber(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="Optional" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Payment Instructions</label>
                <input type="text" value={paymentInstructions} onChange={e => setPaymentInstructions(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="How clients should pay you" />
              </div>
              <div>
                <label className={labelClass}>Invoice Terms & Conditions</label>
                <textarea value={termsText} onChange={e => setTermsText(e.target.value)} className={inputClass} style={{ fontSize: '12px', minHeight: '80px' }} placeholder="Legal terms for your invoices..." />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className={labelClass}>Tagline / Slogan</label>
                <input type="text" value={tagline} onChange={e => setTagline(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="Strategic Marketing & Creative Services" autoFocus />
                <span className="text-dim mt-1 block" style={{ fontSize: '10px' }}>Appears on invoices and the topbar</span>
              </div>
              <div>
                <label className={labelClass}>Logo URL</label>
                <input type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} className={inputClass} style={{ fontSize: '13px' }} placeholder="https://i.imgur.com/your-logo.png" />
                <span className="text-dim mt-1 block" style={{ fontSize: '10px' }}>Direct link to your logo image (PNG recommended). Used in email signatures.</span>
              </div>
              {logoUrl && (
                <div className="flex items-center gap-4 mt-2">
                  <div className="bg-obsidian border border-border p-3 flex items-center justify-center" style={{ width: '80px', height: '80px' }}>
                    <img src={logoUrl} alt="Logo preview" className="max-w-full max-h-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                  <span className="text-dim" style={{ fontSize: '11px' }}>Preview</span>
                </div>
              )}
              <div className="card bg-obsidian/50 mt-2">
                <p className="text-dim" style={{ fontSize: '11px', lineHeight: '1.6' }}>
                  The app icon (shield) in the topbar uses the local <code className="mono text-steel">/icon.png</code> file. To change it, replace that file in your public folder and redeploy.
                </p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-dim" style={{ fontSize: '12px' }}>
                List the services you offer. These will appear as presets in your invoice builder and services page.
              </p>
              <div className="space-y-2">
                {serviceList.map((svc, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={svc}
                      onChange={e => {
                        const next = [...serviceList]
                        next[i] = e.target.value
                        setServiceList(next)
                      }}
                      className={inputClass}
                      style={{ fontSize: '13px' }}
                      placeholder={i === 0 ? 'e.g. Website Design' : i === 1 ? 'e.g. Social Media Management' : 'Add another service...'}
                      autoFocus={i === 0}
                    />
                    {serviceList.length > 1 && (
                      <button
                        onClick={() => setServiceList(serviceList.filter((_, j) => j !== i))}
                        className="text-dim hover:text-err transition-colors cursor-pointer p-1"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setServiceList([...serviceList, ''])}
                className="btn-ghost flex items-center gap-1.5"
              >
                <span>+</span> Add Service
              </button>
              {existingServices.length > 0 && (
                <div className="mt-2">
                  <span className="label text-dim">You already have {existingServices.length} services defined — these will be added alongside them.</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="btn-ghost flex items-center gap-1.5">
                <ArrowLeft size={12} /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < STEPS.length - 1 && (
              <button
                onClick={() => onComplete()}
                className="text-dim hover:text-steel transition-colors cursor-pointer"
                style={{ fontSize: '11px' }}
              >
                Skip Setup
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="btn-primary flex items-center gap-1.5"
                disabled={!canNext}
                style={{ opacity: canNext ? 1 : 0.4 }}
              >
                Next <ArrowRight size={12} />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                className="btn-primary flex items-center gap-1.5"
                disabled={saving}
              >
                {saving ? 'Saving...' : <><Check size={12} /> Launch Command Center</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
