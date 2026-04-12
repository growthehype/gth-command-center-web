import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationBarProps {
  page: number
  totalPages: number
  totalItems: number
  perPage: number
  hasNext: boolean
  hasPrev: boolean
  onNext: () => void
  onPrev: () => void
  onPageChange: (page: number) => void
  onPerPageChange?: (n: number) => void
  noun?: string
}

export default function PaginationBar({
  page,
  totalPages,
  totalItems,
  perPage,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  onPageChange,
  onPerPageChange,
  noun = 'items',
}: PaginationBarProps) {
  if (totalItems <= perPage && totalPages <= 1) return null

  const start = (page - 1) * perPage + 1
  const end = Math.min(page * perPage, totalItems)

  return (
    <div className="flex items-center justify-between gap-4 py-2 px-1" style={{ fontSize: '11px' }}>
      <span className="text-dim">
        {start}–{end} of {totalItems} {noun}
      </span>

      <div className="flex items-center gap-1">
        {onPerPageChange && (
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            className="bg-surface border border-border rounded px-1.5 py-0.5 text-polar mr-2"
            style={{ fontSize: '11px' }}
          >
            {[10, 25, 50, 100].map(n => (
              <option key={n} value={n}>{n}/page</option>
            ))}
          </select>
        )}

        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="p-1 rounded hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed text-dim hover:text-polar transition-colors"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Page numbers */}
        {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
          let pageNum: number
          if (totalPages <= 7) {
            pageNum = i + 1
          } else if (page <= 4) {
            pageNum = i + 1
          } else if (page >= totalPages - 3) {
            pageNum = totalPages - 6 + i
          } else {
            pageNum = page - 3 + i
          }

          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`min-w-[24px] h-6 rounded text-center transition-colors ${
                pageNum === page
                  ? 'bg-accent text-white font-semibold'
                  : 'text-dim hover:bg-surface hover:text-polar'
              }`}
              style={{ fontSize: '11px' }}
            >
              {pageNum}
            </button>
          )
        })}

        <button
          onClick={onNext}
          disabled={!hasNext}
          className="p-1 rounded hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed text-dim hover:text-polar transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
