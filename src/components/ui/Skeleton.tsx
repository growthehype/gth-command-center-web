import React from 'react'

/* ── Base Skeleton ── */

interface SkeletonProps {
  width?: string | number
  height?: string | number
  className?: string
  variant?: 'text' | 'circle' | 'rect'
}

export default function Skeleton({
  width,
  height,
  className = '',
  variant = 'text',
}: SkeletonProps) {
  const base = 'skeleton-shimmer'

  const variantClass =
    variant === 'circle'
      ? 'rounded-full'
      : variant === 'text'
        ? 'rounded-sm'
        : ''

  const defaultHeight = variant === 'text' ? '14px' : variant === 'circle' ? '40px' : '100px'
  const defaultWidth = variant === 'circle' ? '40px' : '100%'

  return (
    <div
      className={`${base} ${variantClass} ${className}`}
      style={{
        width: width ?? defaultWidth,
        height: height ?? defaultHeight,
      }}
    />
  )
}

/* ── SkeletonTable ── */

interface SkeletonTableProps {
  rows?: number
  columns?: number
}

export function SkeletonTable({ rows = 5, columns = 4 }: SkeletonTableProps) {
  return (
    <div className="border border-border overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 bg-surface border-b border-border"
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`h-${i}`}
            variant="text"
            height="10px"
            width={i === 0 ? '60px' : `${80 + Math.random() * 40}px`}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={`r${r}-c${c}`}
              variant="text"
              height="13px"
              width={c === 0 ? '30%' : `${40 + Math.random() * 30}%`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ── SkeletonCard ── */

export function SkeletonCard() {
  return (
    <div className="bg-cell border border-border p-4 flex flex-col gap-3">
      {/* Icon placeholder */}
      <Skeleton variant="rect" width="40px" height="40px" className="bg-surface" />
      {/* Title */}
      <Skeleton variant="text" width="70%" height="14px" />
      {/* Badge + size */}
      <div className="flex items-center gap-2">
        <Skeleton variant="text" width="60px" height="10px" />
        <Skeleton variant="text" width="40px" height="10px" />
      </div>
      {/* Date */}
      <Skeleton variant="text" width="50%" height="10px" />
    </div>
  )
}

/* ── SkeletonList ── */

interface SkeletonListProps {
  rows?: number
}

export function SkeletonList({ rows = 4 }: SkeletonListProps) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-2.5 px-2 border-b border-border last:border-b-0"
        >
          {/* Dot */}
          <Skeleton variant="circle" width="6px" height="6px" />
          {/* Text line */}
          <Skeleton variant="text" height="13px" width={`${55 + Math.random() * 30}%`} />
          {/* Badge */}
          <div className="ml-auto flex-shrink-0">
            <Skeleton variant="text" width="50px" height="10px" />
          </div>
          {/* Timestamp */}
          <div className="flex-shrink-0">
            <Skeleton variant="text" width="70px" height="11px" />
          </div>
        </div>
      ))}
    </div>
  )
}
