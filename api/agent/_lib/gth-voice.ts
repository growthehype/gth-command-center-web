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

export interface ProofLink { match: string; url: string; note?: string }

/** Every piece of GTH work that fits this business (up to 3), in config order. */
export function pickProofLinks(cfgInner: any, industry: string, name: string): ProofLink[] {
  const links: ProofLink[] = Array.isArray(cfgInner?.proof_links) ? cfgInner.proof_links : []
  const hay = `${industry} ${name}`.toLowerCase()
  const out: ProofLink[] = []
  for (const l of links) {
    try {
      if (l?.url && new RegExp(l.match, 'i').test(hay) && !out.some(o => o.url === l.url)) out.push(l)
    } catch { /* bad pattern, skip */ }
  }
  return out.slice(0, 4)
}

/** Text for the writer's brief, e.g. "tcllp.netlify.app (custom website); tcllp.netlify.app/alberta-contractors (lead landing page)" */
export function pickProofLink(cfgInner: any, industry: string, name: string): string | null {
  const l = pickProofLinks(cfgInner, industry, name)
  return l.length ? l.map(x => (x.note ? `${x.url} (${x.note})` : x.url)).join('; ') : null
}

export function proofUrls(cfgInner: any, industry: string, name: string): string[] {
  return pickProofLinks(cfgInner, industry, name).map(l => l.url)
}

export function buildGthWriterPrompt(cfgInner: any): string {
  const booking = (cfgInner?.booking_link || '').trim()
  return `You write cold emails as Omar Alladina, who runs Grow The Hype in Edmonton, Alberta. They go to local business owners who have never heard of him. Omar has already decided this business is a good fit, so the email does not need to prove anything or point out problems. It just needs to be warm, simple and easy to say yes to.

THE FEELING
- Relaxed, caring and to the point, like a friendly local business owner sending a short note. No blah blah blah.
- Never critical. Do not list what is wrong with their site, do not mention broken photos, errors, old designs or anything that could feel like a dig. At most say you saw an opportunity.
- Never pushy, never salesy, never upset or guilt-tripping. The reader owes him nothing.
- Short paragraphs, plain words, complete sentences. Contractions are fine.

THE SEQUENCE (three emails, same thread)
1) First email, 60 to 130 words, in this order:
   - "Hi {first name}," if a contact first name is given, otherwise "Hi there,".
   - A sincere compliment on their business. If a Google rating and review count are given, use them, e.g. "A 4.6 rating from 154 Google reviews says a lot about how you treat your customers." If there are no reviews, compliment something real from the brief (years in business, the services they offer, their area). Never invent anything.
   - Why he is writing, in one or two relaxed sentences: he was on their website and saw an opportunity to show them something that might feel more like them. Vary the wording. Never say "I came across" or "I stumbled upon".
   - What his websites are built for, in one plain sentence: they work well on phones, load fast, are set up to be found on Google, and make it easy for people to call, book or ask for a quote (pick the action that fits their business).
   - If a homepage concept link is given: share it as a preview of their new homepage made with their own details, on its own line, e.g. "Here's a preview of what your homepage could look like:" then the link. If no concept link is given and a "Work to show" link is given, share ONE website we built, on its own line, introduced in a few words. Otherwise share no links.
   - A soft close: if they're interested in chatting, he'd love to connect. ${booking ? `He may offer his booking link once: ${booking}` : 'No other links.'} Then one short thank you line, e.g. "Thanks for taking a minute to read this."
   - No sign-off name: Omar's Gmail signature is added below.
2) Follow-up, sent a few days later, 25 to 70 words: kind and light. Say he wanted to make sure his note didn't get buried, share the preview link again on its own line if there is one, and make it clear there's no pressure. No new pitch, no criticism, no guilt. Never say "just checking in". No name sign-off.
3) Final note, 15 to 50 words: gracious and warm. He'll leave it here so he isn't filling their inbox, the door is always open if they ever want to talk about their website, and he wishes them a great season or a great week. No pressure, nothing that sounds disappointed. No name sign-off.

SUBJECT LINE: 3 to 9 words, warm and specific, names the business as people say it. With a concept: "A new homepage for {business}" or "I built {business} a new homepage". Without: something kind and concrete about them, e.g. "{business}, a website idea for you". No "re:", no exclamation marks, no clickbait.

HARD RULES (break one and the email is thrown out)
- Only use facts from the brief. Never invent clients, results, numbers, prices, timelines or awards.
- No statistics, percentages or dollar amounts. The Google rating and review count are the only numbers allowed.
- No em dashes, en dashes or double hyphens. Use commas and full stops.
- No exclamation marks, emojis, bullet points, bold, or brackets. No placeholders.
- Never use: leverage, synergy, elevate, unlock, streamline, game-changer, cutting-edge, seamless, revolutionize, transform, empower, robust, delve, tailored, solutions, digital landscape, in today's world, next level, boost, skyrocket, touch base, circle back, I came across, I stumbled upon, just checking in, hope this email finds you, hope this finds you, best regards, kind regards, warm regards, studio, agency, branding.
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
  { re: /\bstudio\b/i, label: 'studio' },
  { re: /\bbrand(s|ing)?\b|brand identity/i, label: 'brands/branding (talk about their customers instead)' },
  { re: /(creative|digital|marketing) agency|AI-first/i, label: 'agency label (say local team instead)' },
  { re: /websites? and brands?/i, label: 'websites and brands' },
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
  email_1: [50, 150],
  follow_up_1: [18, 85],
  follow_up_2: [12, 60],
}

// Links don't count toward length: an email can carry the concept and two sites
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ca|com|net|org|app|io|co)(?:\/\S*)?/gi
const words = (s: string) => (s.replace(URL_RE, ' ').trim().match(/\S+/g) || []).length
const norm = (u: string) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[.,)]+$/, '').replace(/\/$/, '')

/** Work links that must appear in email 1: two full websites (landing pages only if there aren't two sites). */
export function requiredWorkLinks(cfgInner: any, industry: string, name: string, hasConcept = false): ProofLink[] {
  // Their own homepage preview is the one link that matters; otherwise show one site we built
  if (hasConcept) return []
  const all = pickProofLinks(cfgInner, industry, name)
  const sites = all.filter(l => !/\/[^/]+/.test(norm(l.url)))
  return [...sites, ...all.filter(l => !sites.includes(l))].slice(0, 1)
}

/** Guarantee the work links are in email 1, added before the ask if the writer left them out. */
export function ensureWorkLinks(d: VoiceDraft, links: ProofLink[], industry = ''): VoiceDraft {
  if (!links.length) return d
  const body = d.email_1 || ''
  const missing = links.filter(l => !(body.match(URL_RE) || []).some(u => norm(u) === norm(l.url)))
  if (!missing.length) return d
  const kind = /account|cpa|bookkeep|tax|chartered/i.test(industry) ? 'for accounting firms' : 'for local businesses'
  const all = links.map(l => `https://${norm(l.url)}`)
  const para = all.length === 1 ? `Here's one we built recently ${kind}:\n${all[0]}` : `Here are two we built recently ${kind}:\n${all.join('\n')}`
  // Drop a partial mention so links aren't listed twice, then add before the ask
  const paras = body.split(/\n{2,}/).filter(p => !links.some(l => p.toLowerCase().includes(norm(l.url))))
  const askAt = paras.findIndex(p => /short call|few ideas|thanks for taking|love to connect|interested in chatting/i.test(p))
  const at = askAt > 0 ? askAt : Math.max(1, paras.length - 1)
  paras.splice(at, 0, para)
  return { ...d, email_1: paras.join('\n\n') }
}

/** Every rule a draft breaks. Empty = clean. `allowedLinks` are the only URLs permitted. */
export function validateVoice(d: VoiceDraft, allowedLinks: string[] = [], required: { work?: ProofLink[]; concept?: string | null } = {}): string[] {
  const problems: string[] = []
  if (!d || typeof d !== 'object') return ['no draft returned']
  const sw = words(d.subject || '')
  if (sw < 3 || sw > 9) problems.push(`subject should be 3 to 9 words (got ${sw})`)
  if (/^(a )?(quick (note|idea|question)|homepage idea|your website|following up)\b/i.test((d.subject || '').trim())) problems.push('subject is too vague: name them and say the concrete thing')
  if (/[!]|re:/i.test(d.subject || '')) problems.push('subject has "!" or "re:"')
  for (const { re, label } of BANNED) if (re.test(d.subject || '')) problems.push(`subject uses "${label}"`)

  const allowed = allowedLinks.map(l => l.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))
  const e1Links = (d.email_1 || '').match(URL_RE) || []
  for (const w of required.work || []) {
    if (!e1Links.some(u => norm(u) === norm(w.url))) problems.push(`email_1 must include the work link ${w.url}`)
  }
  if (required.concept && !e1Links.some(u => norm(u) === norm(required.concept!))) problems.push(`email_1 must include the homepage concept link ${required.concept}`)
  for (const key of ['email_1', 'follow_up_1', 'follow_up_2'] as const) {
    const body = d[key] || ''
    const [min, max] = LIMITS[key]
    const wc = words(body)
    if (wc < min || wc > max) problems.push(`${key} is ${wc} words (allowed ${min} to ${max})`)
    const last = body.trim().split('\n').pop()?.trim() || ''
    if (/^(omar|omar alladina|-+\s*omar|cheers,?|thanks,?|best,?|regards,?)$/i.test(last)) problems.push(`${key} must not end with a sign-off or name (the Gmail signature adds it)`)
    if (/^\s*([-*•]|\d+\.)\s+/m.test(body)) problems.push(`${key} uses a list`)
    if (/^\s*subject\s*:/i.test(body)) problems.push(`${key} starts with a "Subject:" line`)
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
    // Writers sometimes repeat the subject line at the top of the body
    let body = (raw || '').replace(/\r/g, '').replace(/^\s*subject\s*:[^\n]*\n+/i, '')
    for (const { re, fix: f } of CHAR_RULES) { re.lastIndex = 0; body = body.replace(re, f) }
    body = body.split('\n').map(line => {
      const sentences = line.match(/[^.?]+[.?]?\s*/g) || [line]
      return sentences.filter(s => !BANNED.some(({ re }) => re.test(s))).join('').trimEnd()
    }).join('\n')
      .replace(/^\s*([-*•]|\d+\.)\s+/gm, '')
      .replace(/ ,/g, ',').replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.')
      .replace(/\n{3,}/g, '\n\n').trim()
    // No name at the bottom: Omar's Gmail signature carries it
    return body.replace(/\n*\s*(?:cheers,?|thanks,?|best,?)?\s*\n*\s*Omar(?: Alladina)?\s*$/i, '').trimEnd()
  }
  let subject = (d.subject || '').replace(/!/g, '').replace(/^re:\s*/i, '')
  for (const { re, fix: f } of CHAR_RULES) { re.lastIndex = 0; subject = subject.replace(re, f) }
  subject = subject.trim().split(/\s+/).slice(0, 9).join(' ')
  return {
    subject: subject || 'quick idea',
    email_1: fix(d.email_1),
    follow_up_1: fix(d.follow_up_1),
    follow_up_2: fix(d.follow_up_2),
    angle_used: d.angle_used,
  }
}
