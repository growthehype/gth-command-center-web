// How long work takes a skilled senior person at a good agency, doing it by hand
// without AI. Every "by hand" estimate is built from these lines, so the same
// work always gets the same number, and a question about an estimate is
// answered by showing the lines, not by guessing again.
//
// hours = per one unit. The CRM multiplies by the quantity and adds them up.

export interface RateItem { key: string; label: string; unit: string; hours: number }

export const RATE_CARD: RateItem[] = [
  // Websites
  { key: 'site_homepage', label: 'Custom homepage, designed and built (responsive, motion)', unit: 'page', hours: 14 },
  { key: 'site_page', label: 'Interior page, designed and built', unit: 'page', hours: 5 },
  { key: 'site_onepager', label: 'One-page website, designed and built', unit: 'site', hours: 20 },
  { key: 'landing_page', label: 'Ad landing page, designed and built', unit: 'page', hours: 8 },
  { key: 'site_section', label: 'New or redesigned section on an existing page', unit: 'section', hours: 2 },
  { key: 'site_change', label: 'Small website change (copy, image, link, style fix)', unit: 'change', hours: 0.25 },
  { key: 'interactive_feature', label: 'Interactive feature or signature animation (map, explorer, diagram, calculator)', unit: 'feature', hours: 6 },
  { key: 'seo_setup', label: 'SEO and AI search setup (schema, sitemap, llms.txt, meta, OG)', unit: 'site', hours: 3 },
  { key: 'launch_setup', label: 'Launch and hosting setup (Netlify, DNS, forms, redirects, caching)', unit: 'site', hours: 2 },
  { key: 'site_qa', label: 'Cross-device QA pass with fixes', unit: 'pass', hours: 1.5 },
  // Software and apps
  { key: 'app_screen', label: 'App screen designed and built (UI, states, responsive)', unit: 'screen', hours: 6 },
  { key: 'app_feature_small', label: 'Small app feature or setting', unit: 'feature', hours: 3 },
  { key: 'app_feature', label: 'App feature (logic, data, API, UI)', unit: 'feature', hours: 10 },
  { key: 'app_feature_large', label: 'Large app feature or integration (third-party system, queue, agent)', unit: 'feature', hours: 24 },
  { key: 'automated_tests', label: 'Automated tests', unit: 'test', hours: 0.4 },
  { key: 'infra_setup', label: 'Infrastructure or deployment setup (cloud, database, CI)', unit: 'environment', hours: 8 },
  { key: 'security_review', label: 'Security review and hardening', unit: 'review', hours: 6 },
  { key: 'tech_doc', label: 'Technical or security document', unit: 'page', hours: 1 },
  // Design and brand
  { key: 'logo_direction', label: 'Logo direction (concept, refined)', unit: 'direction', hours: 6 },
  { key: 'brand_kit', label: 'Brand kit (colours, type, usage, components)', unit: 'kit', hours: 16 },
  { key: 'brand_kit_update', label: 'Brand kit update (font, colour or rule change across the kit)', unit: 'update', hours: 2 },
  { key: 'deck_template', label: 'Slide template design', unit: 'template', hours: 2.5 },
  { key: 'deck_slide', label: 'Slide written and laid out on an existing template', unit: 'slide', hours: 0.5 },
  { key: 'print_piece', label: 'Print or signage piece designed, print ready', unit: 'piece', hours: 3 },
  { key: 'social_post', label: 'Social post or ad creative designed', unit: 'creative', hours: 0.75 },
  { key: 'mockup', label: 'Mockup or composite image', unit: 'image', hours: 1 },
  { key: 'image_edit', label: 'Photo retouch, crop, cut-out or screenshot prep', unit: 'image', hours: 0.2 },
  // Writing
  { key: 'copy', label: 'Finished copy written and edited', unit: '100 words', hours: 0.3 },
  { key: 'email', label: 'Client or prospect email', unit: 'email', hours: 0.3 },
  { key: 'proposal', label: 'Proposal, agreement or plan document', unit: 'document', hours: 5 },
  { key: 'report', label: 'Report or audit write-up', unit: 'page', hours: 1 },
  { key: 'invoice', label: 'Invoice prepared', unit: 'invoice', hours: 0.25 },
  // Ads and marketing
  { key: 'ads_audit', label: 'Ad account audit', unit: 'account', hours: 5 },
  { key: 'ads_campaign_setup', label: 'Ad campaign built (structure, targeting, tracking)', unit: 'campaign', hours: 4 },
  { key: 'ads_change', label: 'Ad account change (keywords, bids, ads, negatives)', unit: 'change batch', hours: 1 },
  { key: 'tracking_setup', label: 'Conversion or analytics tracking set up', unit: 'setup', hours: 1.5 },
  // Thinking
  { key: 'research', label: 'Research (market, technical, competitor, pricing)', unit: 'topic', hours: 1.5 },
  { key: 'strategy', label: 'Strategy or recommendation worked out', unit: 'decision', hours: 1 },
  { key: 'admin', label: 'CRM, file or account admin', unit: 'task', hours: 0.25 },
]

const BY_KEY = new Map(RATE_CARD.map(r => [r.key, r]))

export interface EstimateLine { item: string; qty: number; note?: string; hours?: number }
export interface PricedLine { item: string; label: string; qty: number; unit: string; each: number; hours: number; note?: string }

/** Turn the writer's lines into priced lines. Unknown items must carry their own hours and a note. */
export function priceEstimate(lines: EstimateLine[]): { lines: PricedLine[]; total: number; problems: string[] } {
  const problems: string[] = []
  const out: PricedLine[] = []
  for (const l of lines || []) {
    const qty = Number(l.qty)
    if (!(qty > 0) || qty > 500) { problems.push(`"${l.item}" needs a quantity between 1 and 500`); continue }
    const r = BY_KEY.get(String(l.item))
    if (r) {
      out.push({ item: r.key, label: r.label, qty, unit: r.unit, each: r.hours, hours: Math.round(qty * r.hours * 100) / 100, note: l.note })
    } else {
      const each = Number(l.hours)
      if (!(each > 0) || each > 40 || !l.note) { problems.push(`"${l.item}" is not on the rate card: give hours per unit (max 40) and a note saying why`); continue }
      out.push({ item: String(l.item).slice(0, 40), label: String(l.note).slice(0, 120), qty, unit: 'unit', each, hours: Math.round(qty * each * 100) / 100, note: l.note })
    }
  }
  const total = Math.round(out.reduce((s, l) => s + l.hours, 0) * 10) / 10
  if (!out.length && !problems.length) problems.push('Give at least one breakdown line')
  return { lines: out, total, problems }
}

/** One line per rate, for tool descriptions. */
export const RATE_CARD_TEXT = RATE_CARD.map(r => `${r.key} = ${r.hours} h per ${r.unit} (${r.label})`).join('; ')
