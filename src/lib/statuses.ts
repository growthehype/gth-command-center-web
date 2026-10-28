import type { StatusOption } from '@/components/ui/StatusMenu'

/** One source of truth for status labels and tones across the CRM. */
export const CLIENT_STATUS_OPTIONS: StatusOption[] = [
  { value: 'active', label: 'Active', tone: 'ok', hint: 'Current client' },
  { value: 'prospect', label: 'Prospect', tone: 'warn', hint: 'In conversation' },
  { value: 'paused', label: 'Paused', tone: 'neutral', hint: 'On hold' },
  { value: 'done', label: 'Done', tone: 'neutral', hint: 'Work complete' },
]

export const PROJECT_STATUS_OPTIONS: StatusOption[] = [
  { value: 'backlog', label: 'Backlog', tone: 'neutral' },
  { value: 'progress', label: 'In progress', tone: 'warn' },
  { value: 'review', label: 'Review', tone: 'info' },
  { value: 'done', label: 'Done', tone: 'ok' },
]
