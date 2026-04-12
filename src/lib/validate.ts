// Simple validation helpers — no external dependencies

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/** Validate a string field */
export function validateString(value: unknown, fieldName: string, opts?: { min?: number; max?: number; required?: boolean }): string {
  const { min = 0, max = 1000, required = false } = opts || {}
  if (value === null || value === undefined || value === '') {
    if (required) throw new ValidationError(`${fieldName} is required`)
    return ''
  }
  if (typeof value !== 'string') throw new ValidationError(`${fieldName} must be text`)
  const trimmed = value.trim()
  if (required && !trimmed) throw new ValidationError(`${fieldName} is required`)
  if (trimmed.length < min) throw new ValidationError(`${fieldName} must be at least ${min} characters`)
  if (trimmed.length > max) throw new ValidationError(`${fieldName} must be less than ${max} characters`)
  return trimmed
}

/** Validate a number field */
export function validateNumber(value: unknown, fieldName: string, opts?: { min?: number; max?: number }): number {
  const { min = -Infinity, max = Infinity } = opts || {}
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (typeof num !== 'number' || isNaN(num)) throw new ValidationError(`${fieldName} must be a number`)
  if (num < min) throw new ValidationError(`${fieldName} must be at least ${min}`)
  if (num > max) throw new ValidationError(`${fieldName} must be less than ${max}`)
  return num
}

/** Validate an email field */
export function validateEmail(value: unknown, fieldName: string, opts?: { required?: boolean }): string {
  const str = validateString(value, fieldName, opts)
  if (!str) return str // empty is OK if not required
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) throw new ValidationError(`${fieldName} is not a valid email address`)
  return str
}

/** Strip unknown fields — only keep allowed keys */
export function pickFields<T extends Record<string, unknown>>(data: Record<string, unknown>, allowedKeys: string[]): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const key of allowedKeys) {
    if (key in data) result[key] = data[key]
  }
  return result as Partial<T>
}
