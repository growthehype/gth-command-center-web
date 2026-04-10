// CSV export for outreach leads — used by client lead-gen agents to share
// scraped leads with clients (e.g. Frank at Ideal Integration).
import type { OutreachLead } from '@/lib/store'

// Strip Google Places `types` array noise like "general_contractor, service,
// point_of_interest, establishment" down to a single human-readable label.
const _NOISE = new Set([
  'establishment', 'point_of_interest', 'service', 'store',
  'premise', 'subpremise', 'food', 'finance',
])
const _LABELS: Record<string, string> = {
  general_contractor: 'Contractor',
  home_goods_store: 'Home Goods',
  electrician: 'Electrician',
  plumber: 'Plumber',
  roofing_contractor: 'Roofing',
  painter: 'Painter',
  locksmith: 'Locksmith',
  car_dealer: 'Car Dealer',
  car_repair: 'Auto Repair',
  car_wash: 'Car Wash',
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  bakery: 'Bakery',
  bar: 'Bar',
  meal_takeaway: 'Takeaway',
  meal_delivery: 'Delivery',
  doctor: 'Doctor',
  dentist: 'Dentist',
  hospital: 'Hospital',
  pharmacy: 'Pharmacy',
  physiotherapist: 'Physio',
  veterinary_care: 'Veterinary',
  real_estate_agency: 'Real Estate',
  insurance_agency: 'Insurance',
  lawyer: 'Lawyer',
  accounting: 'Accounting',
  bank: 'Bank',
  hair_care: 'Hair Salon',
  beauty_salon: 'Beauty',
  spa: 'Spa',
  gym: 'Gym',
  pet_store: 'Pet Store',
  clothing_store: 'Clothing',
  furniture_store: 'Furniture',
  hardware_store: 'Hardware',
}
function cleanIndustryForCsv(raw: string | null | undefined): string {
  if (!raw) return ''
  if (!raw.includes(',') && !raw.includes('_')) return raw
  const types = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  for (const t of types) {
    if (_NOISE.has(t)) continue
    if (_LABELS[t]) return _LABELS[t]
    return t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  return ''
}

const COLUMNS: { key: keyof OutreachLead | 'created_at_friendly'; label: string }[] = [
  { key: 'name',              label: 'Business Name' },
  { key: 'industry',          label: 'Industry' },
  { key: 'phone',             label: 'Phone' },
  { key: 'email',             label: 'Email' },
  { key: 'website',           label: 'Website' },
  { key: 'address',           label: 'Address' },
  { key: 'rating',            label: 'Google Rating' },
  { key: 'business_status',   label: 'Business Status' },
  { key: 'google_maps_url',   label: 'Google Maps URL' },
  { key: 'qualification_score', label: 'AI Score' },
  { key: 'stage',             label: 'Stage' },
  { key: 'source',            label: 'Source' },
  { key: 'agent_name',        label: 'Agent' },
  { key: 'notes',             label: 'Notes' },
  { key: 'created_at_friendly', label: 'Discovered' },
]

function escapeCell(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // RFC 4180 — escape quotes by doubling, wrap in quotes if it contains
  // a comma, newline, carriage return, or quote.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function leadsToCsv(leads: OutreachLead[]): string {
  const header = COLUMNS.map(c => escapeCell(c.label)).join(',')
  const rows = leads.map(lead => {
    return COLUMNS.map(col => {
      if (col.key === 'created_at_friendly') {
        try {
          return escapeCell(lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '')
        } catch {
          return ''
        }
      }
      if (col.key === 'industry') {
        return escapeCell(cleanIndustryForCsv(lead.industry))
      }
      const v = (lead as any)[col.key]
      return escapeCell(v)
    }).join(',')
  })
  return [header, ...rows].join('\r\n')
}

/** Triggers a CSV download in the browser. Returns the filename it used. */
export function downloadLeadsCsv(leads: OutreachLead[], baseName = 'leads'): string {
  const csv = leadsToCsv(leads)
  // Add a UTF-8 BOM so Excel opens it with the correct encoding
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  const safe = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'leads'
  const filename = `${safe}-${stamp}.csv`
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return filename
}
