import { formatDistanceToNow, format, isToday, isTomorrow, isYesterday, isPast, differenceInDays, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval } from 'date-fns'

// Date formatting
export function relativeDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

export function formatDate(dateStr: string | null, fmt: string = 'MMM d, yyyy'): string {
  if (!dateStr) return ''
  try {
    return format(parseISO(dateStr), fmt)
  } catch {
    return dateStr
  }
}

export function friendlyDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = parseISO(dateStr)
    if (isToday(d)) return 'Today'
    if (isTomorrow(d)) return 'Tomorrow'
    if (isYesterday(d)) return 'Yesterday'
    const days = differenceInDays(d, new Date())
    if (days > 0 && days <= 7) return format(d, 'EEEE')
    return format(d, 'MMM d')
  } catch {
    return dateStr
  }
}

export function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false
  try {
    return isPast(parseISO(dateStr)) && !isToday(parseISO(dateStr))
  } catch {
    return false
  }
}

export function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity
  try {
    return differenceInDays(new Date(), parseISO(dateStr))
  } catch {
    return Infinity
  }
}

// Week helpers for calendar
export function getWeekDays(date: Date, weekStart: 0 | 1 = 1): Date[] {
  const start = startOfWeek(date, { weekStartsOn: weekStart })
  const end = endOfWeek(date, { weekStartsOn: weekStart })
  return eachDayOfInterval({ start, end })
}

export function nextWeek(date: Date): Date { return addWeeks(date, 1) }
export function prevWeek(date: Date): Date { return subWeeks(date, 1) }

// Currency formatting
export function formatCurrency(amount: number, currency: string = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCurrencyFull(amount: number, currency: string = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Time of day greeting
export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// Health status
export function clientHealth(daysSinceActivity: number): { color: string; label: string } {
  if (daysSinceActivity <= 7) return { color: '#22C55E', label: 'Healthy' }
  if (daysSinceActivity <= 14) return { color: '#F59E0B', label: 'Needs check-in' }
  if (daysSinceActivity <= 21) return { color: '#FF3333', label: 'Stale' }
  return { color: '#FF3333', label: 'At risk' }
}

// Sanitize HTML for activity log (only allow <strong> tags)
export function sanitizeActivityHtml(html: string): string {
  // First escape all HTML entities, then selectively restore <strong> tags
  const escaped = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  // Restore only <strong> and </strong>
  return escaped
    .replace(/&lt;strong&gt;/gi, '<strong>')
    .replace(/&lt;\/strong&gt;/gi, '</strong>')
}

// Fuzzy search
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

// Email validation
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Parse JSON safely
export function safeParseJSON<T>(str: string | null, fallback: T): T {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}
