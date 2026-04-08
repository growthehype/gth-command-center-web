import { useAppStore } from '@/lib/store'

export interface CompanyProfile {
  companyName: string
  companyEmail: string
  companyPhone: string
  companyAddress: string
  companyWebsite: string
  companyLogoUrl: string
  companyTagline: string
  gstNumber: string
  invoicePrefix: string
  invoiceTermsText: string
  invoicePaymentInstructions: string
  emailSigName: string
  emailSigTitle: string
  currency: string
  onboardingCompleted: boolean
}

const DEFAULTS: CompanyProfile = {
  companyName: '',
  companyEmail: '',
  companyPhone: '',
  companyAddress: '',
  companyWebsite: '',
  companyLogoUrl: '',
  companyTagline: '',
  gstNumber: '',
  invoicePrefix: 'INV',
  invoiceTermsText: '',
  invoicePaymentInstructions: 'Payments can be made via e-transfer or credit card',
  emailSigName: '',
  emailSigTitle: '',
  currency: 'CAD',
  onboardingCompleted: false,
}

export function useCompanyProfile(): CompanyProfile {
  const settings = useAppStore((s) => s.settings)
  return {
    companyName: settings.company_name || DEFAULTS.companyName,
    companyEmail: settings.company_email || DEFAULTS.companyEmail,
    companyPhone: settings.company_phone || DEFAULTS.companyPhone,
    companyAddress: settings.company_address || DEFAULTS.companyAddress,
    companyWebsite: settings.company_website || DEFAULTS.companyWebsite,
    companyLogoUrl: settings.company_logo_url || DEFAULTS.companyLogoUrl,
    companyTagline: settings.company_tagline || DEFAULTS.companyTagline,
    gstNumber: settings.gst_number || DEFAULTS.gstNumber,
    invoicePrefix: settings.invoice_prefix || DEFAULTS.invoicePrefix,
    invoiceTermsText: settings.invoice_terms_text || DEFAULTS.invoiceTermsText,
    invoicePaymentInstructions: settings.invoice_payment_instructions || DEFAULTS.invoicePaymentInstructions,
    emailSigName: settings.email_sig_name || DEFAULTS.emailSigName,
    emailSigTitle: settings.email_sig_title || DEFAULTS.emailSigTitle,
    currency: settings.currency || DEFAULTS.currency,
    onboardingCompleted: settings.onboarding_completed === 'true',
  }
}

/** Non-hook version for use outside React components (PDF gen, email send, etc.) */
export function getCompanyProfile(): CompanyProfile {
  const settings = useAppStore.getState().settings
  return {
    companyName: settings.company_name || DEFAULTS.companyName,
    companyEmail: settings.company_email || DEFAULTS.companyEmail,
    companyPhone: settings.company_phone || DEFAULTS.companyPhone,
    companyAddress: settings.company_address || DEFAULTS.companyAddress,
    companyWebsite: settings.company_website || DEFAULTS.companyWebsite,
    companyLogoUrl: settings.company_logo_url || DEFAULTS.companyLogoUrl,
    companyTagline: settings.company_tagline || DEFAULTS.companyTagline,
    gstNumber: settings.gst_number || DEFAULTS.gstNumber,
    invoicePrefix: settings.invoice_prefix || DEFAULTS.invoicePrefix,
    invoiceTermsText: settings.invoice_terms_text || DEFAULTS.invoiceTermsText,
    invoicePaymentInstructions: settings.invoice_payment_instructions || DEFAULTS.invoicePaymentInstructions,
    emailSigName: settings.email_sig_name || DEFAULTS.emailSigName,
    emailSigTitle: settings.email_sig_title || DEFAULTS.emailSigTitle,
    currency: settings.currency || DEFAULTS.currency,
    onboardingCompleted: settings.onboarding_completed === 'true',
  }
}
