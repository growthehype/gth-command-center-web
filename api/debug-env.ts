// Temporary diagnostic — DELETE after confirming
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const raw = process.env.GOOGLE_CLIENT_SECRET || '(NOT SET)'
  const cleaned = raw.trim().replace(/\\n/g, '')
  res.json({
    length_raw: raw.length,
    length_cleaned: cleaned.length,
    starts_with: cleaned.slice(0, 6),
    ends_with: cleaned.slice(-4),
    has_quotes: raw.includes('"'),
    has_backslash_n: raw.includes('\\n'),
    has_newline: raw.includes('\n'),
    has_carriage_return: raw.includes('\r'),
    first_5_charCodes: [...raw.slice(0, 5)].map(c => c.charCodeAt(0)),
    last_5_charCodes: [...raw.slice(-5)].map(c => c.charCodeAt(0)),
  })
}
