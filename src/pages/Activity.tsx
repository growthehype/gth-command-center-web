import { useState, useEffect, useMemo, useCallback } from 'react'
import { Activity as ActivityIcon, ChevronUp, ChevronDown } from 'lucide-react'
import { useAppStore, type ActivityEntry } from '@/lib/store'
import { activity as activityApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import { sanitizeActivityHtml } from '@/lib/utils'
import { useRelativeTime } from '@/hooks/useRelativeTime'
import EmptyState from '@/components/ui/EmptyState'
import FilterChips from '@/components/ui/FilterChips'
import { SkeletonList } from '@/components/ui/Skeleton'

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

/* Sub-component so useRelativeTime can be called per-row */
function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const timeAgo = useRelativeTime(entry.timestamp)

  return (
    <div className="table-row flex items-start gap-3 py-2.5 px-2">
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
        {timeAgo}
      </span>
    </div>
  )
}

export default function Activity() {
  const { activity, refreshActivity } = useAppStore()
  const [allEntries, setAllEntries] = useState<ActivityEntry[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<EntityFilter>('All')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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

  /* ── Filtered + sorted entries ── */
  const filtered = useMemo(() => {
    let list = filter === 'All' ? [...allEntries] : allEntries.filter(e => e.entity === filter)
    list.sort((a, b) => {
      const cmp = (a.timestamp || '').localeCompare(b.timestamp || '')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [allEntries, filter, sortDir])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1>Activity</h1>
          <ActivityIcon size={14} className="text-dim" />
        </div>
        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="btn-ghost flex items-center gap-1.5"
          style={{ fontSize: '11px' }}
        >
          {sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          {sortDir === 'desc' ? 'Newest First' : 'Oldest First'}
        </button>
      </div>

      {/* Filter chips */}
      <FilterChips
        options={ENTITY_FILTERS.map(f => ({ value: f, label: f }))}
        value={filter}
        onChange={(v) => setFilter(v as EntityFilter)}
      />

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
            <ActivityRow key={entry.id} entry={entry} />
          ))}

          {/* Load more */}
          {hasMore && filter === 'All' && (
            <div className="pt-4 pb-2">
              {loading ? (
                <SkeletonList rows={3} />
              ) : (
                <div className="flex justify-center">
                  <button
                    onClick={loadMore}
                    className="btn-ghost"
                  >
                    Load More
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
