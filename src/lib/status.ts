/**
 * Centralized status string normalization.
 * The CRM has mixed conventions (kebab-case, Title Case, snake_case).
 * This module provides canonical values and mappings.
 */

// ── Project statuses (canonical: lowercase kebab) ──
export const PROJECT_STATUS = {
  BACKLOG: 'backlog',
  IN_PROGRESS: 'progress',
  REVIEW: 'review',
  DONE: 'done',
} as const

export const PROJECT_STATUS_ALIASES: Record<string, string> = {
  'in-progress': 'progress',
  'in_progress': 'progress',
  'planning': 'backlog',
  'active': 'progress',
  'completed': 'done',
}

export function normalizeProjectStatus(status: string): string {
  const lower = (status || '').toLowerCase().trim()
  return PROJECT_STATUS_ALIASES[lower] || lower
}

// ── Outreach stages (canonical: Title Case) ──
export const OUTREACH_STAGES = [
  'New Lead',
  'Contacted',
  'Responded',
  'Meeting Set',
  'Closed Won',
  'Closed Lost',
] as const

export const OUTREACH_STAGE_ALIASES: Record<string, string> = {
  'new lead': 'New Lead',
  'new-lead': 'New Lead',
  'contacted': 'Contacted',
  'responded': 'Responded',
  'meeting set': 'Meeting Set',
  'meeting-set': 'Meeting Set',
  'closed won': 'Closed Won',
  'closed-won': 'Closed Won',
  'closed lost': 'Closed Lost',
  'closed-lost': 'Closed Lost',
}

export function normalizeOutreachStage(stage: string): string {
  const lower = (stage || '').toLowerCase().trim()
  return OUTREACH_STAGE_ALIASES[lower] || stage
}

// ── Invoice statuses ──
export const INVOICE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
  OVERDUE: 'overdue',
} as const

// ── Goal statuses ──
export const GOAL_STATUS = {
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  PAUSED: 'paused',
} as const

export const GOAL_STATUS_ALIASES: Record<string, string> = {
  'in_progress': 'in-progress',
  'active': 'in-progress',
  'done': 'completed',
}

export function normalizeGoalStatus(status: string): string {
  const lower = (status || '').toLowerCase().trim()
  return GOAL_STATUS_ALIASES[lower] || lower
}
