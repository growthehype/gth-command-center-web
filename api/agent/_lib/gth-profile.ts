// Grow The Hype prospecting profile: who we hunt, how we score them, and how
// Omar writes. Everything GTH-specific lives here so the generic pipeline
// (scraper → qualifier → writer → sender) stays reusable for client agents.

export const GTH_PROFILE_ID = 'gth'

export function isGthAgent(cfg: any): boolean {
  return cfg?.config?.profile === GTH_PROFILE_ID
}

// ─── Search rotation ────────────────────────────────────────────

// Interleaved so every run mixes professional services, clinics and trades.
export const GTH_SEARCH_TERMS: string[] = [
  'accounting firm', 'dental clinic', 'general contractor',
  'CPA firm', 'chiropractor', 'home renovation company',
  'law firm', 'physiotherapy clinic', 'HVAC company',
  'bookkeeping service', 'med spa', 'plumbing company',
  'family lawyer', 'audiologist hearing clinic', 'landscaping company',
  'financial advisor', 'massage therapy clinic', 'auto body shop',
  'property management company', 'wellness clinic', 'roofing company',
  'real estate lawyer', 'orthodontist', 'electrician',
  'mortgage broker', 'naturopathic clinic', 'flooring company',
  'tax accountant', 'optometrist', 'kitchen renovation company',
]

export const GTH_SEARCH_AREAS: string[] = [
  'Edmonton, AB',
  'Sherwood Park, AB',
  'St. Albert, AB',
  'Spruce Grove, AB',
  'Leduc, AB',
  'Fort Saskatchewan, AB',
  'Beaumont, AB',
]

export interface RotationPick {
  term: string
  area: string
  index: number
}

/** Next `count` (term, area) pairs starting at `start`. Area-major so Edmonton is covered first. */
export function nextRotation(cfgInner: any, count: number): { picks: RotationPick[]; nextIndex: number } {
  const terms: string[] = Array.isArray(cfgInner?.search_terms) && cfgInner.search_terms.length
    ? cfgInner.search_terms
    : GTH_SEARCH_TERMS
  const areas: string[] = Array.isArray(cfgInner?.search_areas) && cfgInner.search_areas.length
    ? cfgInner.search_areas
    : GTH_SEARCH_AREAS
  const total = terms.length * areas.length
  const start = Number.isFinite(cfgInner?.rotation_index) ? Number(cfgInner.rotation_index) % total : 0
  const picks: RotationPick[] = []
  for (let k = 0; k < count; k++) {
    const i = (start + k) % total
    picks.push({
      term: terms[i % terms.length],
      area: areas[Math.floor(i / terms.length) % areas.length],
      index: i,
    })
  }
  return { picks, nextIndex: (start + count) % total }
}

export const GTH_DEFAULT_CONFIG = {
  profile: GTH_PROFILE_ID,
  auto_send: false,
  target_location: 'Edmonton, AB',
  target_industries: 'Professional services, clinics, trades and home services',
  search_terms: GTH_SEARCH_TERMS,
  search_areas: GTH_SEARCH_AREAS,
  rotation_index: 0,
  queries_per_run: 5,
  daily_lead_quota: 25,
  daily_email_limit: 15,
  drafts_per_run: 8,
  min_score: 60,
  working_hours_start: '08:00',
  working_hours_end: '18:00',
  timezone: 'America/Edmonton',
  skip_weekends: true,
  sender_name: 'Omar Alladina',
  sender_title: 'Founder & Creative Director',
  sender_company: 'Grow The Hype',
  sender_website: 'growthehype.ca',
  sender_phone: '(780) 966-4986',
  sender_city: 'Edmonton, Alberta',
}

// ─── Qualification ──────────────────────────────────────────────

export const GTH_QUALIFIER_PROMPT = `You score local businesses as prospects for Grow The Hype (GTH), a marketing and web agency in Edmonton, Alberta run by Omar Alladina.

What GTH sells:
1. Custom websites, designed, built and hosted in-house. Fast, mobile-first, built to turn visitors into bookings or calls.
2. AI integration for small and mid-sized businesses: automating online booking, intake forms, quote requests, follow-ups, reminders and common customer questions, and teaching teams to use AI day to day.
3. Marketing: paid ads, social media and email.

Who we want: established independent businesses in the Edmonton area (professional firms, clinics, trades and home services) with a real, specific gap GTH can fix.

Scoring guide (0-100):
- 80-100: an established local business (reviews, several services, real team) with a clear, specific gap: no website, site not secure (no HTTPS), not set up for phones, an old copyright year, a thin template-builder site, no way to book or request a quote online in a business where customers expect it, or contact by phone only.
- 60-79: a decent site but a clear AI or automation opportunity (manual booking, paper or PDF intake, no online quote request, lots of back and forth by phone) or a noticeably dated design.
- 30-59: modern site with online booking and good content; little obvious need.
- 0-29: national chains, franchises, corporate groups, hospitals, government, permanently closed, outside Alberta, or no realistic way to reach a decision maker.

Rules:
- Base everything on the data provided. Never invent facts about the business.
- "observation" must be ONE concrete, checkable detail taken from the data, written plainly in a few words as Omar would say it to the owner (for example: "your site still shows 2016 in the footer", "there's no way to book online", "the site isn't secure, browsers flag it as not secure"). If you have nothing concrete, leave it empty and lower the score.
- "pitch_angle": "website" when the site itself is the problem, "ai" when the site is fine but the workflow is manual, "both" when both are true.`

export const GTH_QUALIFIER_TOOLS = [
  {
    name: 'score_lead',
    description: 'Score a prospect for Grow The Hype',
    input_schema: {
      type: 'object' as const,
      properties: {
        score: { type: 'number', description: 'Fit score 0-100' },
        reasoning: { type: 'string', description: 'One or two sentences citing what was observed' },
        signals: { type: 'array', items: { type: 'string' }, description: 'Concrete signals behind the score' },
        observation: { type: 'string', description: 'One concrete detail Omar can mention to the owner, or empty' },
        pitch_angle: { type: 'string', enum: ['website', 'ai', 'both'] },
        recommended_action: {
          type: 'string',
          enum: ['send_cold_email', 'add_to_nurture', 'skip', 'priority_outreach'],
        },
      },
      required: ['score', 'reasoning', 'signals', 'observation', 'pitch_angle', 'recommended_action'],
    },
  },
]

// ─── Writing ────────────────────────────────────────────────────

export const GTH_WRITER_PROMPT = `You write cold emails as Omar Alladina, founder of Grow The Hype, a small marketing and web agency in Edmonton. Omar writes like a local business owner talking to another local business owner: plain, direct, friendly, a little casual. He is not a salesperson and never sounds like one.

You are writing a three-email sequence to one business: a first email, a short follow-up, and a short final note.

What Omar can offer (pick the ONE that fits the observation, never list services):
- A new website, designed, built and hosted by his team, set up properly for phones, speed and getting people to book or call.
- Setting up AI in the business: online booking, intake forms, quote requests, follow-ups and answering common questions automatically, so the front desk spends less time on the phone.

First email:
- Greeting: "Hi {first name}," if a contact name is given, otherwise "Hi there,".
- Sentence 1: who he is in a few words ("I'm Omar, I run Grow The Hype here in Edmonton.") or go straight to the observation. No compliments, no "I came across", no "I hope".
- Sentence 2-3: the one specific observation, stated plainly and kindly, and why it matters to them in practical terms (missed calls, people bouncing off on phones, admin time).
- One sentence on what he'd do about it, in plain words.
- A soft, low-pressure question to end, for example "Would you be open to a quick chat?" or "Worth a 10 minute call sometime this week?"
- Sign off on its own line: Omar
- 60 to 110 words total.

Follow-up (sent a few days later in the same thread): 25 to 60 words. One new small angle or a simpler ask. No "just checking in", no guilt. Sign off: Omar
Final note: 15 to 45 words. Friendly, leaves the door open, no pressure. Sign off: Omar

Subject line: 2 to 5 words, mostly lowercase, specific to them (e.g. "your website", "online booking at {business}", "quick idea for {business}"). No clickbait, no "re:", no punctuation tricks.

Hard rules (breaking any of these ruins the email):
- Never invent facts, numbers, results, prices, clients, awards or timelines. No percentages, no dollar amounts, no statistics.
- No em dashes or en dashes or double hyphens. Use commas and full stops.
- No exclamation marks. No emojis. No bullet points or lists. No bold. No links.
- Never use these words or phrases: leverage, synergy, elevate, unlock, streamline, game-changer, cutting-edge, seamless, revolutionize, transform, empower, robust, delve, tailored, solutions, digital landscape, in today's world, next level, boost, skyrocket, reach out, touch base, circle back, hope this finds you, hope you're well, I came across, I stumbled upon, I wanted to reach out, just checking in, best regards, kind regards, warm regards.
- Contractions are good. Short sentences are good. Canadian spelling.
- Do not add a signature block or contact details. Do not add an unsubscribe line. Those are added automatically.
- Do not use placeholders or brackets of any kind.`

export const GTH_WRITER_TOOLS = [
  {
    name: 'compose_sequence',
    description: 'Write the three-email outreach sequence for one business',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', description: 'Subject line for the first email (follow-ups reply in the same thread)' },
        email_1: { type: 'string', description: 'First email body, plain text, ends with "Omar"' },
        follow_up_1: { type: 'string', description: 'Follow-up body, plain text, ends with "Omar"' },
        follow_up_2: { type: 'string', description: 'Final note body, plain text, ends with "Omar"' },
        angle_used: { type: 'string', enum: ['website', 'ai', 'both'] },
      },
      required: ['subject', 'email_1', 'follow_up_1', 'follow_up_2', 'angle_used'],
    },
  },
]

// ─── Validation & repair ────────────────────────────────────────

const BANNED_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bleverag/i, label: 'leverage' },
  { re: /\bsynerg/i, label: 'synergy' },
  { re: /\belevat/i, label: 'elevate' },
  { re: /\bunlock/i, label: 'unlock' },
  { re: /\bstreamlin/i, label: 'streamline' },
  { re: /game[\s-]?changer/i, label: 'game-changer' },
  { re: /cutting[\s-]?edge/i, label: 'cutting-edge' },
  { re: /\bseamless/i, label: 'seamless' },
  { re: /revolutioni[sz]/i, label: 'revolutionize' },
  { re: /\btransform/i, label: 'transform' },
  { re: /\bempower/i, label: 'empower' },
  { re: /\brobust\b/i, label: 'robust' },
  { re: /\bdelve/i, label: 'delve' },
  { re: /\btailored\b/i, label: 'tailored' },
  { re: /\bsolutions?\b/i, label: 'solutions' },
  { re: /digital landscape/i, label: 'digital landscape' },
  { re: /in today'?s\s+(world|market|age|digital)/i, label: "in today's world" },
  { re: /next level/i, label: 'next level' },
  { re: /\bboost/i, label: 'boost' },
  { re: /skyrocket/i, label: 'skyrocket' },
  { re: /reach(ing)? out/i, label: 'reach out' },
  { re: /touch base/i, label: 'touch base' },
  { re: /circle back/i, label: 'circle back' },
  { re: /hope (this|you|all|your|that)/i, label: 'I hope' },
  { re: /i came across/i, label: 'I came across' },
  { re: /stumbled (up)?on/i, label: 'stumbled upon' },
  { re: /just checking in/i, label: 'just checking in' },
  { re: /(best|kind|warm) regards/i, label: 'regards' },
  { re: /\bthrilled\b|\bexcited to\b/i, label: 'thrilled/excited' },
  { re: /\bcomprehensive\b/i, label: 'comprehensive' },
  { re: /\binnovative\b/i, label: 'innovative' },
]

const CHAR_RULES: { re: RegExp; label: string; fix: string }[] = [
  { re: /\s*[—–]\s*/g, label: 'em/en dash', fix: ', ' },
  { re: /\s*--+\s*/g, label: 'double hyphen', fix: ', ' },
  { re: /!/g, label: 'exclamation mark', fix: '.' },
  { re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, label: 'emoji', fix: '' },
  { re: /[%$]/g, label: 'percent or dollar sign', fix: '' },
  { re: /[[\]{}<>]/g, label: 'brackets or placeholders', fix: '' },
  { re: /\*\*/g, label: 'bold markers', fix: '' },
]

function wordCount(s: string): number {
  return (s.trim().match(/\S+/g) || []).length
}

export interface SequenceDraft {
  subject: string
  email_1: string
  follow_up_1: string
  follow_up_2: string
  angle_used?: string
}

const LIMITS: Record<'email_1' | 'follow_up_1' | 'follow_up_2', [number, number]> = {
  email_1: [40, 130],
  follow_up_1: [15, 75],
  follow_up_2: [8, 60],
}

/** Every rule the draft breaks, as short human-readable strings. Empty = clean. */
export function validateSequence(d: SequenceDraft): string[] {
  const problems: string[] = []
  if (!d || typeof d !== 'object') return ['no draft returned']

  const subjectWords = wordCount(d.subject || '')
  if (subjectWords < 1 || subjectWords > 7) problems.push(`subject must be 2 to 5 words (got ${subjectWords})`)
  if (/[!]|re:/i.test(d.subject || '')) problems.push('subject has "!" or "re:"')

  for (const key of ['email_1', 'follow_up_1', 'follow_up_2'] as const) {
    const body = d[key] || ''
    const [min, max] = LIMITS[key]
    const wc = wordCount(body)
    if (wc < min || wc > max) problems.push(`${key} is ${wc} words (allowed ${min}-${max})`)
    if (!/\n\s*Omar\s*$/.test(body.trim()) && !/^Omar$/m.test(body.trim().split('\n').pop() || '')) {
      problems.push(`${key} must end with "Omar" on its own line`)
    }
    if (/^\s*([-*•]|\d+\.)\s+/m.test(body)) problems.push(`${key} uses a list`)
    for (const { re, label } of BANNED_PATTERNS) {
      if (re.test(body)) problems.push(`${key} uses banned phrase "${label}"`)
    }
    for (const { re, label } of CHAR_RULES) {
      re.lastIndex = 0
      if (re.test(body)) problems.push(`${key} contains ${label}`)
      re.lastIndex = 0
    }
  }
  for (const { re, label } of BANNED_PATTERNS) {
    if (re.test(d.subject || '')) problems.push(`subject uses banned phrase "${label}"`)
  }
  return problems
}

/** Last-resort cleanup when a regenerated draft still breaks rules. */
export function repairSequence(d: SequenceDraft): SequenceDraft {
  const fixBody = (raw: string): string => {
    let body = (raw || '').replace(/\r/g, '')
    for (const { re, fix } of CHAR_RULES) {
      re.lastIndex = 0
      body = body.replace(re, fix)
    }
    // Drop whole sentences that contain banned phrases
    const lines = body.split('\n').map((line) => {
      const sentences = line.match(/[^.?]+[.?]?\s*/g) || [line]
      return sentences.filter((sent) => !BANNED_PATTERNS.some(({ re }) => re.test(sent))).join('').trimEnd()
    })
    body = lines.join('\n')
      .replace(/^\s*([-*•]|\d+\.)\s+/gm, '')
      .replace(/ ,/g, ',')
      .replace(/,\s*,/g, ',')
      .replace(/\.\s*\./g, '.')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    // Guarantee the sign-off
    if (!/\bOmar\s*$/.test(body)) body = `${body}\n\nOmar`
    return body
  }
  let subject = (d.subject || '').replace(/[!]/g, '').replace(/^re:\s*/i, '')
  for (const { re, fix } of CHAR_RULES) {
    re.lastIndex = 0
    subject = subject.replace(re, fix)
  }
  subject = subject.trim().split(/\s+/).slice(0, 6).join(' ')
  return {
    subject: subject || 'quick idea',
    email_1: fixBody(d.email_1),
    follow_up_1: fixBody(d.follow_up_1),
    follow_up_2: fixBody(d.follow_up_2),
    angle_used: d.angle_used,
  }
}

// ─── Compliance footer (CASL) ───────────────────────────────────

export function gthOptOutFooterHtml(cfgInner?: any): string {
  const company = cfgInner?.sender_company || 'Grow The Hype'
  const city = cfgInner?.sender_city || 'Edmonton, Alberta'
  return `<p style="margin-top:22px;font-size:11px;line-height:1.5;color:#9a9a9a;">${company} &middot; ${city}<br>If this isn't relevant, reply "no thanks" and I won't reach out again.</p>`
}
