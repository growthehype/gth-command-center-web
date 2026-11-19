// Everything about a lead, gathered so Omar can build their homepage concept in
// a separate Claude chat: the CRM record, a fresh read of their Google profile,
// and a browser read of their website (text, logo, photos, colours, screenshots)
// with the images copied to our own storage so any chat can download them.
import { getAdminClient } from './supabase-admin'
import { buildKit, slugify } from './preview'

const STORAGE = 'https://lihziucupctxwayijeoc.supabase.co/storage/v1/object/public/lead-previews'

export async function findLeads(userId: string, q: string) {
  const sb = getAdminClient()
  const term = q.replace(/[%_]/g, '').trim()
  const { data } = await sb.from('outreach_leads').select('*').eq('user_id', userId).ilike('name', `%${term}%`).order('qualification_score', { ascending: false, nullsFirst: false }).limit(6)
  return data || []
}

/** Fresh Google profile from Places (no photos: their file links would carry our API key). */
export async function googleProfile(placeId?: string | null) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key || !placeId) return null
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,googleMapsUri,regularOpeningHours.weekdayDescriptions,editorialSummary,reviews,primaryTypeDisplayName,types,businessStatus,photos.name',
      },
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return { error: `Google said ${res.status}` }
    const d: any = await res.json()
    return {
      name: d.displayName?.text, category: d.primaryTypeDisplayName?.text, address: d.formattedAddress, phone: d.nationalPhoneNumber,
      website: d.websiteUri, rating: d.rating, review_count: d.userRatingCount, maps_link: d.googleMapsUri, status: d.businessStatus,
      hours: d.regularOpeningHours?.weekdayDescriptions || [], about: d.editorialSummary?.text || null,
      reviews: (d.reviews || []).map((r: any) => ({ rating: r.rating, when: r.relativePublishTimeDescription, author: r.authorAttribution?.displayName, text: r.text?.text || r.originalText?.text || '' })),
      photo_count: (d.photos || []).length,
    }
  } catch (e: any) { return { error: String(e?.message || e).slice(0, 120) } }
}

/** Read their website in a real browser and copy the logo and photos into our storage. */
export async function scrapeLeadSite(leadId: string) {
  const sb = getAdminClient()
  const { data: lead } = await sb.from('outreach_leads').select('*').eq('id', leadId).single()
  if (!lead?.website) throw new Error('No website on this lead')
  const slug = `brief-${slugify(lead.name || 'lead').slice(0, 40)}-${String(lead.id).slice(0, 6)}`
  const e = lead.enrichment_data || {}
  await sb.from('outreach_leads').update({ enrichment_data: { ...e, brief: { slug, status: 'reading', started_at: new Date().toISOString() } } }).eq('id', leadId)
  try {
    await buildKit(lead, slug, Date.now() + 240_000, false)
    const { data: fresh } = await sb.from('outreach_leads').select('enrichment_data').eq('id', leadId).single()
    await sb.from('outreach_leads').update({ enrichment_data: { ...(fresh?.enrichment_data || e), brief: { slug, status: 'ready', built_at: new Date().toISOString() } } }).eq('id', leadId)
    return { ok: true, slug }
  } catch (err: any) {
    const { data: fresh } = await sb.from('outreach_leads').select('enrichment_data').eq('id', leadId).single()
    await sb.from('outreach_leads').update({ enrichment_data: { ...(fresh?.enrichment_data || e), brief: { slug, status: 'failed', error: String(err?.message || err).slice(0, 200) } } }).eq('id', leadId)
    return { ok: false, error: String(err?.message || err) }
  }
}

async function readKit(slug: string) {
  const { data } = await getAdminClient().storage.from('lead-previews').download(`${slug}/kit.json`)
  if (!data) return null
  try { return JSON.parse(await data.text()) } catch { return null }
}

/** The full brief for a build chat. Starts a site read in the background when there isn't one yet. */
export async function leadBrief(userId: string, lead: any, opts: { startScrape: (leadId: string) => Promise<void> }) {
  const e = lead.enrichment_data || {}
  const q = e.qual || {}
  const brief = e.brief || null
  const kitSlug = brief?.status === 'ready' ? brief.slug : null
  const kit = kitSlug ? await readKit(kitSlug) : null
  let site: any
  if (kit) {
    site = {
      read_on: brief.built_at,
      title: kit.title, description: kit.description, nav: kit.nav, headings: kit.headings,
      page_text: String(kit.text || '').slice(0, 9000),
      other_pages: (kit.extraPages || []).map((p: any) => ({ url: p.url, text: String(p.text || '').slice(0, 3500) })),
      phones: kit.phones, emails: kit.emails, socials: kit.socials, booking_links: kit.bookingLinks, address: kit.address, hours: kit.hours,
      testimonials: kit.testimonials, colours: kit.colours, fonts: kit.fonts, footer: kit.footerText || null,
      logo: kit.logo ? { url: `${STORAGE}/${kitSlug}/${kit.logo.path}`, size: `${kit.logo.w}x${kit.logo.h}`, note: kit.logoNote || null, check: 'Automatic logo detection can pick the wrong image. Look at it before using it.' } : null,
      photos: (kit.photos || []).map((p: any) => ({ url: `${STORAGE}/${kitSlug}/${p.path}`, size: `${p.w}x${p.h}`, alt: p.alt || '' })),
      screenshots: { desktop: kit.desktopShot, phone: kit.mobileShot },
      structured_data: String(kit.jsonld || '').slice(0, 3000) || null,
    }
  } else if (!lead.website) {
    site = { note: 'No website on their Google listing.' }
  } else if (brief?.status === 'reading' && Date.now() - Date.parse(brief.started_at || 0) < 6 * 60_000) {
    site = { status: 'Reading their website now. Ask again in a minute or two for the text, logo and photos.' }
  } else {
    await opts.startScrape(lead.id)
    site = { status: `Started reading their website${brief?.status === 'failed' ? ` again (last try: ${brief.error})` : ''}. Ask again in about two minutes for the text, logo and photos.` }
  }
  const google = await googleProfile(lead.google_place_id)
  return {
    business: lead.name, industry: lead.industry, website: lead.website, email: lead.email, other_emails: lead.alt_emails || [],
    phone: lead.phone, address: lead.address || lead.location, contact: lead.contact_name || e.decision_makers?.[0]?.name || null,
    decision_makers: e.decision_makers || [], socials: e.social_links || null,
    crm: {
      stage: lead.stage, score: lead.qualification_score, why: lead.qualification_reason, observation: q.observation || e.observation || null,
      pitch_angle: q.pitch_angle || e.pitch_angle || null, services: e.services_found || [], summary: e.website_summary || null,
      website_check: e.website_audit || null, design_verdict: q.design || null,
      issues_seen_on_their_site: (q.visual?.findings || []).map((f: any) => f.claim),
      screenshots_from_qualifying: q.visual?.urls || null, notes: lead.notes || null,
    },
    google,
    site,
    next: 'Build the homepage concept in this chat from these facts and assets only. When it is live, give Omar the link and call attach_concept with it so the first email can share it after he approves.',
  }
}
