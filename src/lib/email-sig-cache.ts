import { useAppStore } from '@/lib/store'

/**
 * Sync email signature data from settings to localStorage cache.
 * Gmail.ts reads from this cache to build the HTML signature.
 * Call this whenever company profile settings change.
 */
export function syncEmailSignatureCache(): void {
  const settings = useAppStore.getState().settings
  const cache = {
    name: settings.email_sig_name || settings.display_name || settings.company_name || '',
    title: settings.email_sig_title || '',
    email: settings.company_email || '',
    phone: settings.company_phone || '',
    website: settings.company_website || '',
    logoUrl: settings.company_logo_url || '',
    tagline: settings.company_tagline || '',
    companyName: settings.company_name || '',
  }
  localStorage.setItem('gth_email_sig_cache', JSON.stringify(cache))
}
