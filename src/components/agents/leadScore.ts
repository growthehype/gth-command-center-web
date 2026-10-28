import type { OutreachLead } from '@/lib/store'

export type Tier = 'hot' | 'warm' | 'cold' | 'skip' | 'unchecked'

export const TIER_LABEL: Record<Tier, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
  skip: 'Not a fit',
  unchecked: 'Not checked',
}

export const TIER_HINT: Record<Tier, string> = {
  hot: 'Clear, visible problem we can fix. Contact first.',
  warm: 'Real opportunity, worth a thoughtful email.',
  cold: 'Site is in good shape. Little reason to reach out.',
  skip: 'Chain, franchise, corporate or out of area.',
  unchecked: 'Waiting for the agent to check it.',
}

export interface BreakdownRow {
  key: string
  group: 'need' | 'fit' | 'reach'
  label: string
  points: number
  max: number
  status: 'pass' | 'fail' | 'unknown'
  detail?: string
}

export interface Qual {
  version: number
  score: number
  tier: Tier
  need: number
  fit: number
  reach: number
  adjustment?: { points: number; reason: string } | null
  breakdown: BreakdownRow[]
  design?: { verdict?: string; note?: string; screenshot_url?: string; desktop_url?: string; footer_url?: string; perf?: number; perf_desktop?: number; seo?: number; accessibility?: number } | null
  visual?: {
    checked: boolean
    footer_text?: string | null
    footer_year?: number | null
    booking_visible?: string
    form_visible?: string
    main_cta?: string | null
    findings?: { key: string; claim: string; evidence: string }[]
    urls?: { mobile_top?: string | null; desktop_top?: string | null; desktop_footer?: string | null; desktop_middle?: string | null }
  } | null
  observation?: string
  pitch_angle?: string
  disqualifier?: string | null
  checked_at?: string
}

export function leadQual(lead: OutreachLead): Qual | null {
  const q = lead.enrichment_data?.qual
  return q && q.version >= 2 ? (q as Qual) : null
}

export function leadTier(lead: OutreachLead): Tier {
  if (lead.enrichment_data?.user_feedback === 'bad') return 'skip'
  const q = leadQual(lead)
  if (q?.tier) return q.tier
  const s = lead.qualification_score
  if (s == null) return 'unchecked'
  if (s >= 70) return 'hot'
  if (s >= 60) return 'warm'
  if (s < 20) return 'skip'
  return 'cold'
}

export function leadObservation(lead: OutreachLead): string {
  return leadQual(lead)?.observation || lead.enrichment_data?.observation || ''
}

export const ANGLE_LABEL: Record<string, string> = {
  website: 'New website',
  ai: 'AI for booking and intake',
  both: 'Website and AI',
}
