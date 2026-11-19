// The Grow The Hype build standard for homepage concepts and client sites.
// Distilled from the briefs behind the builds Omar holds up as the bar
// (Tetz Powell, NAKH, Ideal Integration, T&C, Granville House, Sumar, Banwest).
// Returned with every lead brief so any Claude chat builds to the same level.

export const BUILD_STANDARD = `GROW THE HYPE BUILD STANDARD

The bar: it must read like a $250,000 custom build, specific to this business. If any part looks like a template, a theme or an AI-generated site, it fails. Omar rates it 10 out of 10 or it does not ship.

HOW TO WORK
- Run silently. Do not narrate steps. Deliver the finished work with a short summary.
- Self-QA before delivering. If something is obviously off, fix it first rather than waiting for Omar to find it.
- Read the whole lead brief before designing. Look at their logo, every photo and the screenshots of their current site before choosing a direction.

SKILLS (load each at its phase; where a skill conflicts with this standard, this standard wins)
1. Architecture: site-architecture (page map, internal links, redirects from their old URLs).
2. Direction: impeccable (init to write PRODUCT.md from the brief, then shape), design-taste-frontend, frontend-design. Write DESIGN.md before any UI.
3. Visual craft: high-end-visual-design, used selectively. Take its custom easing, press physics, transform and opacity only motion, generous spacing, banned fonts and performance guardrails. Ignore its floating glass pill nav, pill eyebrow badges, double-bezel cards, 2rem squircle radii, bento grids and blur fade-up on everything: those are the signature of AI-built sites.
4. Motion and touch: emil-design-eng, animate, find-animation-opportunities, mobile-native. Purposeful, restrained motion with full prefers-reduced-motion support.
5. Copy: copy-editing on every line, every CTA, every meta description.
6. Search: seo-audit and ai-seo (schema.org JSON-LD for the business type, local SEO, robots.txt that allows AI crawlers, llms.txt, sitemap.xml, Open Graph, favicon set).
7. Conversion: page-cro (one clear primary action per page, booking or quote flow that fits the business).
8. Finish: review-animations, then impeccable audit and impeccable polish. full-output-enforcement throughout: no truncated files, no TODO stubs, no "rest of page here".
Do not use: gpt-taste, industrial-brutalist-ui, minimalist-ui, design-taste-frontend-v1, stitch-design-taste, any imagegen skill, image-to-code.

BANNED (each one is an automatic fail)
- Italic or handwritten serif accent words inside headings.
- Uneven edges: every column, rule and text block shares a grid line. Omar checks alignment first.
- Floating glass pill navigation, pill eyebrow labels above headings, section numbers, bento grids, three identical icon cards in a row, gradient text, glows, emoji, stock-photo people, fake testimonials, invented statistics, logo walls of brands they don't work with.
- The logo in a white box on a dark background, stretched, recoloured, redrawn or re-lettered.
- Generic marketing language ("elevate", "unlock", "seamless", "solutions", "in today's world", "your trusted partner"), exclamation marks, em dashes and double hyphens.

CONTENT RULES
- Use only facts from the lead brief or that Omar supplies. Keep every real fact; rewrite every sentence. Never invent credentials, years, awards, client counts, prices, team members or testimonials. Real Google reviews may be quoted with the reviewer's first name.
- Anything you cannot verify goes in OPEN-QUESTIONS.md, never on the page.
- Use their real logo and real photos. Automatic logo detection can pick the wrong image: confirm the logo is actually their logo. If the photos are too few, too small or too weak for a premium site (no team or space photos, under about 1200px wide), stop and ask Omar for better ones instead of building around them.
- Canadian spelling. Voice: plain, warm and precise, written for the people who use this business.

BUILD
- Fully custom static site (hand-written HTML, CSS and JavaScript, or Astro), deployed on Netlify. No WordPress, Webflow or page builders.
- Mobile first and checked at 390px, 768px, 1280px and 1440px. Proper mobile menu. No horizontal scroll.
- Performance: Lighthouse 95+ on mobile, images in AVIF or WebP with width and height set, fonts self-hosted with font-display swap.
- Accessibility: WCAG AA contrast, real headings in order, labelled form fields, visible focus, alt text from what the photo actually shows.
- Netlify: Netlify Forms with a honeypot; netlify.toml with CSS and JS on max-age=0, must-revalidate and fonts, images and video on long-term cache; ?v= version strings on CSS and JS links.
- Look at every page in a real browser at desktop and phone width before calling it done, and fix anything misaligned, overlapping or cut off.

FOR A HOMEPAGE CONCEPT
- Build the homepage only, to full production quality, using their logo, photos and facts. Forms show a note that this is a concept.
- Deploy it to its own Netlify site, give Omar the link and a zip, and wait for his approval.
- Only after Omar approves, call attach_concept with the live link so the lead's first email can share it. Never contact the lead yourself.`
