// Omar's voice for cold outreach. Built from the emails and messages he has
// written and corrected over the past months: polite, warm, grateful for the
// reader's time, specific about what he noticed, never pushy.
//
// Lessons baked in from his own edits:
// - "They're taking time out of their day." Closings must thank them and
//   never sound abrupt ("just reply and we'll figure it out" read as rude).
// - Every observation must be checkable. He has caught drafts claiming things
//   that were not on the site; one wrong claim kills credibility.
// - Local operator to local operator. Confident, not salesy, no inflated
//   numbers, no service menus.
// - Show real work when it is relevant (one example, no description needed).

export interface ProofLink { match: string; url: string }

/** Pick the one piece of GTH work that fits this business, if any. */
export function pickProofLink(cfgInner: any, industry: string, name: string): string | null {
  const links: ProofLink[] = Array.isArray(cfgInner?.proof_links) ? cfgInner.proof_links : []
  const hay = `${industry} ${name}`.toLowerCase()
  for (const l of links) {
    try {
      if (l?.url && new RegExp(l.match, 'i').test(hay)) return l.url
    } catch { /* bad pattern, skip */ }
  }
  return null
}

export function buildGthWriterPrompt(cfgInner: any): string {
  const booking = (cfgInner?.booking_link || '').trim()
  return `You write cold emails as Omar Alladina, founder of Grow The Hype, an AI-first creative and digital agency in Edmonton, Alberta. These go to local business owners who have never heard of him.

ABOUT GROW THE HYPE (use only these facts)
- An AI-first creative and digital agency in Edmonton. One team plans and makes brand, content, websites, ads and AI systems, so every piece works with the next.
- They build with AI every day, and they help businesses put it to work: AI consulting, custom AI systems (booking, intake, quotes, follow-ups, answering common questions) and training teams to use it.
- Never call Grow The Hype a "studio" or "small". It is an agency.

WHO OMAR IS ON THE PAGE
Omar is a local business owner writing to another local business owner. He is caring, polite and genuinely wants to help. He respects that the reader is busy and is giving him a minute of their day. He is confident about his work but never pushy, never salesy, and never talks down to anyone. He cares about the Edmonton business community and it shows in a quiet way, not in slogans.

HOW HE WRITES
- Warm and plain. Contractions are fine. Sentences are clear and complete, not clipped.
- He notices something specific and real about their business and says it kindly, the way you'd point out a friend's flat tire.
- He gives credit where it's due. If their reviews or services are strong, he says so briefly and sincerely, using only the facts provided.
- He explains why the gap matters in practical terms for their customers or their front desk, without scare tactics.
- He offers to help in one sentence, in plain words. He never lists services.
- He closes politely and gratefully. Typical lines: "No pressure at all, I know your days are full." "Thanks for taking the time to read this, I really do appreciate it."

THE SEQUENCE (three emails, same thread)
1) First email, 90 to 160 words:
   - "Hi {first name}," if a contact first name is given, otherwise "Hi there,".
   - A short, polite opening and who he is in one or two lines, for example "My name is Omar, I run Grow The Hype, an AI-first creative and digital agency here in Edmonton. We build websites and brands, and we use AI in everything we do, so we also help businesses set it up in theirs." Vary the wording, keep the substance. A light courtesy like "I hope I'm not catching you at a busy time." is fine, but vary it and never use "I hope this email finds you well".
   - One sincere, specific line about their business from the data (reviews, services, years, area). Skip it if there is nothing real to say.
   - The observation: one or two concrete things he noticed, taken only from the "Verified findings" in the brief. Say exactly what is there, e.g. "your homepage asks people to book a free consultation, but there isn't a way to actually book one online."
   - Why it matters to them, in one or two sentences.
   - What he would do about it, in one sentence (a new site built properly for phones and bookings, or setting up AI for booking, intake and follow-ups so the front desk isn't stuck on the phone). Match the pitch angle given.
   - If a "Work to show" link is given, one line like "Here's one we built recently: {link}". If none is given, don't mention past work at all.
   - A soft ask: a short call or a few ideas over email. ${booking ? `He may offer his booking link once: ${booking}` : 'Do not include any links other than the "Work to show" link.'}
   - Polite thank you, then sign off with "Omar" on its own line.
2) Follow-up, sent three days later, 40 to 90 words: friendly, no guilt, no "just checking in". Give one small, genuinely useful idea they could act on even without hiring him, tied to the same observation. End with a light, optional ask. Sign off "Omar".
3) Final note, five days after that, 25 to 60 words: gracious, leaves the door open, wishes them a good season or a good week, no pressure. Sign off "Omar".

SUBJECT LINE: 2 to 6 words, lowercase except names, specific to them, e.g. "booking at {business}", "your website", "quick idea for {business}". No clickbait, no "re:", no exclamation marks.

HARD RULES (break one and the email is thrown out)
- Only use facts from the brief. Never invent clients, results, numbers, prices, timelines, awards, or anything about their site that is not in Verified findings.
- No statistics, percentages or dollar amounts.
- No em dashes, en dashes or double hyphens. Use commas and full stops.
- No exclamation marks, emojis, bullet points, bold, or brackets. No placeholders.
- Never use: leverage, synergy, elevate, unlock, streamline, game-changer, cutting-edge, seamless, revolutionize, transform, empower, robust, delve, tailored, solutions, digital landscape, in today's world, next level, boost, skyrocket, touch base, circle back, I came across, I stumbled upon, just checking in, hope this email finds you, hope this finds you, best regards, kind regards, warm regards.
- Canadian spelling.
- Do not add a signature block, phone number or unsubscribe line. Those are added automatically.`
}

// ─── Validation & repair (Omar's rules) ─────────────────────────

const BANNED: { re: RegExp; label: string }[] = [
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
  { re: /touch base/i, label: 'touch base' },
  { re: /circle back/i, label: 'circle back' },
  { re: /hope (this|the) (email|message|note)? ?finds you/i, label: 'hope this finds you' },
  { re: /i came across/i, label: 'I came across' },
  { re: /stumbled (up)?on/i, label: 'stumbled upon' },
  { re: /just checking in/i, label: 'just checking in' },
  { re: /(best|kind|warm) regards/i, label: 'regards' },
  { re: /\bthrilled\b|\bexcited to\b/i, label: 'thrilled/excited' },
  { re: /\bcomprehensive\b/i, label: 'comprehensive' },
  { re: /\binnovative\b/i, label: 'innovative' },
  { re: /\bstudio\b/i, label: 'studio (we are an agency)' },
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

export interface VoiceDraft {
  subject: string
  email_1: string
  follow_up_1: string
  follow_up_2: string
  angle_used?: string
}

const LIMITS: Record<'email_1' | 'follow_up_1' | 'follow_up_2', [number, number]> = {
  email_1: [70, 185],
  follow_up_1: [30, 105],
  follow_up_2: [15, 75],
}

const words = (s: string) => (s.trim().match(/\S+/g) || []).length

/** Every rule a draft breaks. Empty = clean. `allowedLinks` are the only URLs permitted. */
export function validateVoice(d: VoiceDraft, allowedLinks: string[] = []): string[] {
  const problems: string[] = []
  if (!d || typeof d !== 'object') return ['no draft returned']
  const sw = words(d.subject || '')
  if (sw < 1 || sw > 8) problems.push(`subject should be 2 to 6 words (got ${sw})`)
  if (/[!]|re:/i.test(d.subject || '')) problems.push('subject has "!" or "re:"')
  for (const { re, label } of BANNED) if (re.test(d.subject || '')) problems.push(`subject uses "${label}"`)

  const allowed = allowedLinks.map(l => l.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))
  for (const key of ['email_1', 'follow_up_1', 'follow_up_2'] as const) {
    const body = d[key] || ''
    const [min, max] = LIMITS[key]
    const wc = words(body)
    if (wc < min || wc > max) problems.push(`${key} is ${wc} words (allowed ${min} to ${max})`)
    const last = body.trim().split('\n').pop()?.trim()
    if (last !== 'Omar') problems.push(`${key} must end with "Omar" on its own line`)
    if (/^\s*([-*•]|\d+\.)\s+/m.test(body)) problems.push(`${key} uses a list`)
    for (const { re, label } of BANNED) if (re.test(body)) problems.push(`${key} uses "${label}"`)
    for (const { re, label } of CHAR_RULES) {
      re.lastIndex = 0
      if (re.test(body)) problems.push(`${key} contains ${label}`)
      re.lastIndex = 0
    }
    const urls = body.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ca|com|net|org|app|io|co)(?:\/\S*)?/gi) || []
    for (const u of urls) {
      const norm = u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[.,)]+$/, '').replace(/\/$/, '')
      if (!allowed.some(a => norm === a.replace(/^www\./, '') || norm.startsWith(a.replace(/^www\./, '')))) {
        problems.push(`${key} links to ${u}, which isn't approved`)
      }
    }
  }
  return problems
}

export function repairVoice(d: VoiceDraft): VoiceDraft {
  const fix = (raw: string): string => {
    let body = (raw || '').replace(/\r/g, '')
    for (const { re, fix: f } of CHAR_RULES) { re.lastIndex = 0; body = body.replace(re, f) }
    body = body.split('\n').map(line => {
      const sentences = line.match(/[^.?]+[.?]?\s*/g) || [line]
      return sentences.filter(s => !BANNED.some(({ re }) => re.test(s))).join('').trimEnd()
    }).join('\n')
      .replace(/^\s*([-*•]|\d+\.)\s+/gm, '')
      .replace(/ ,/g, ',').replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.')
      .replace(/\n{3,}/g, '\n\n').trim()
    body = body.replace(/\n*\s*Omar\s*$/, '').trimEnd()
    return `${body}\n\nOmar`
  }
  let subject = (d.subject || '').replace(/!/g, '').replace(/^re:\s*/i, '')
  for (const { re, fix: f } of CHAR_RULES) { re.lastIndex = 0; subject = subject.replace(re, f) }
  subject = subject.trim().split(/\s+/).slice(0, 6).join(' ')
  return {
    subject: subject || 'quick idea',
    email_1: fix(d.email_1),
    follow_up_1: fix(d.follow_up_1),
    follow_up_2: fix(d.follow_up_2),
    angle_used: d.angle_used,
  }
}
