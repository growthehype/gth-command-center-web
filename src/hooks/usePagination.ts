import { useState, useMemo } from 'react'

interface PaginationResult<T> {
  /** Items for the current page */
  pageItems: T[]
  /** Current page number (1-based) */
  page: number
  /** Total number of pages */
  totalPages: number
  /** Total item count */
  totalItems: number
  /** Go to a specific page */
  setPage: (p: number) => void
  /** Go to next page */
  nextPage: () => void
  /** Go to previous page */
  prevPage: () => void
  /** Whether there's a next page */
  hasNext: boolean
  /** Whether there's a previous page */
  hasPrev: boolean
  /** Items per page */
  perPage: number
  /** Change items per page */
  setPerPage: (n: number) => void
}

export function usePagination<T>(items: T[], defaultPerPage = 25): PaginationResult<T> {
  const [page, setPage] = useState(1)
  const [perPage, setPerPageState] = useState(defaultPerPage)

  const totalPages = Math.max(1, Math.ceil(items.length / perPage))

  // Clamp page if items shrink
  const safePage = Math.min(page, totalPages)
  if (safePage !== page) setPage(safePage)

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * perPage
    return items.slice(start, start + perPage)
  }, [items, safePage, perPage])

  return {
    pageItems,
    page: safePage,
    totalPages,
    totalItems: items.length,
    setPage: (p: number) => setPage(Math.max(1, Math.min(p, totalPages))),
    nextPage: () => setPage(p => Math.min(p + 1, totalPages)),
    prevPage: () => setPage(p => Math.max(p - 1, 1)),
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
    perPage,
    setPerPage: (n: number) => { setPerPageState(n); setPage(1) },
  }
}
