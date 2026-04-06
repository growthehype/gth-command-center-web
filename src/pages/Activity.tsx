import { useState, useEffect, useMemo, useCallback } from 'react'
import { Activity as ActivityIcon } from 'lucide-react'
import { useAppStore, type ActivityEntry } from '@/lib/store'
import { activity as activityApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import { relativeDate, sanitizeActivityHtml } from '@/lib/utils'
import EmptyState from '@/components/ui/EmptyState'

const PAGE_SIZE = 50

const ENTITY_FILTERS = [
  'All', 'clients', 'tasks', 'projects', 'invoices',
  'leads', 'events', 'campaigns', 'contacts', 'meetings',
  'services', 'templates', 'goals', 'credentials', 'sops',
] as const

type EntityFilter = typeof ENTITY_FILTERS[number]

const DOT_COLORS: Record<string, string> = {
  create: '#22C55E',
  update: '#E8E8E8',
  delete: '#FF3333',
  upload: '#3B82F6',
}

export default function Activity() {
  const { activity, refreshActivity } = useAppStore()
  const [allEntries, setAllEntries] = useState<ActivityEntry[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<EntityFilter>('All')

  /* ── Initial load from store ── */
  useEffect(() => {
    setAllEntries(activity)
    setOffset(activity.length)
    setHasMore(activity.length >= PAGE_SIZE)
  }, [activity])

  /* ── Load more ── */
  const loadMore = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const more = await activityApi.getAll(PAGE_SIZE, offset)
      if (more.length < PAGE_SIZE) setHasMore(false)
      setAllEntries(prev => [...prev, ...more])
      setOffset(prev => prev + more.length)
    } catch {
      showToast('Failed to load activity', 'error')
    } finally {
      setLoading(false)
    }
  }, [offset, loading])

  /* ── Filtered entries ── */
  const filtered = useMemo(() => {
    if (filter === 'All') return allEntries
    return allEntries.filter(e => e.entity === filter)
  }, [allEntries, filter])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1>Activity</h1>
        <ActivityIcon size={14} className="text-dim" />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {ENTITY_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 font-sans cursor-pointer transition-all duration-150 border ${
              filter === f
                ? 'bg-polar text-obsidian border-polar'
                : 'bg-transparent text-steel border-border-hard hover:border-dim hover:text-polar'
            }`}
            style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Activity list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          description="Actions across your workspace will appear here."
        />
      ) : (
        <div>
          {filtered.map(entry => (
            <div
              key={entry.id}
              className="table-row flex items-start gap-3 py-2.5 px-2"
            >
              {/* Colored dot */}
              <div className="flex-shrink-0 mt-1.5">
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    backgroundColor: DOT_COLORS[entry.type] || '#6B7280',
                  }}
                />
              </div>

              {/* Description */}
              <div className="flex-1 min-w-0">
                <span
                  className="text-polar"
                  style={{ fontSize: '13px', lineHeight: '1.6' }}
                  dangerouslySetInnerHTML={{ __html: sanitizeActivityHtml(entry.description) }}
                />
              </div>

              {/* Entity badge */}
              {entry.entity && (
                <span
                  className="flex-shrink-0 badge badge-neutral"
                  style={{ fontSize: '9px' }}
                >
                  {entry.entity}
                </span>
              )}

              {/* Timestamp */}
              <span
                className="flex-shrink-0 text-dim mono"
                style={{ fontSize: '11px', minWidth: '80px', textAlign: 'right' }}
              >
                {relativeDate(entry.timestamp)}
              </span>
            </div>
          ))}

          {/* Load more */}
          {hasMore && filter === 'All' && (
            <div className="flex justify-center pt-4 pb-2">
              <button
                onClick={loadMore}
                disabled={loading}
                className="btn-ghost"
                style={{ opacity: loading ? 0.5 : 1 }}
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
