import { useMemo, useState } from 'react'
import { format, subDays, startOfWeek, parseISO, getDay } from 'date-fns'
import { useAppStore } from '@/lib/store'

// Color scale for activity intensity (dark theme greens)
const COLOR_EMPTY = '#1a1a1a'
const COLOR_1 = '#0e4429'
const COLOR_2 = '#006d32'
const COLOR_3 = '#26a641'
const COLOR_4 = '#39d353'

function getColor(count: number): string {
  if (count === 0) return COLOR_EMPTY
  if (count <= 2) return COLOR_1
  if (count <= 5) return COLOR_2
  if (count <= 9) return COLOR_3
  return COLOR_4
}

const CELL_SIZE = 10
const CELL_GAP = 2
const CELL_STEP = CELL_SIZE + CELL_GAP

// Day labels: show only M, W, F (rows 1, 3, 5 in Mon-Sun layout)
const DAY_LABELS: { row: number; label: string }[] = [
  { row: 0, label: 'M' },
  { row: 2, label: 'W' },
  { row: 4, label: 'F' },
]

interface DayCell {
  date: string       // YYYY-MM-DD
  count: number
  col: number
  row: number        // 0=Mon, 6=Sun
  displayDate: string // "Mon, Apr 7"
}

export default function ActivityHeatmap() {
  const { activity, tasks } = useAppStore()
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const { grid, weeks, monthLabels, activeDays } = useMemo(() => {
    const today = new Date()
    const totalDays = 182 // ~26 weeks

    // Build a count map: date string -> count
    const countMap: Record<string, number> = {}

    // Count activity entries
    for (const a of activity) {
      if (!a.timestamp) continue
      try {
        const dateStr = a.timestamp.slice(0, 10)
        countMap[dateStr] = (countMap[dateStr] || 0) + 1
      } catch { /* skip */ }
    }

    // Count completed tasks
    for (const t of tasks) {
      if (t.done && t.completed_at) {
        try {
          const dateStr = t.completed_at.slice(0, 10)
          countMap[dateStr] = (countMap[dateStr] || 0) + 1
        } catch { /* skip */ }
      }
    }

    // Generate grid cells
    // We want the grid to end at today and start ~totalDays ago
    // Columns are weeks (Mon-Sun), rows are days of week (0=Mon, 6=Sun)
    const startDate = subDays(today, totalDays - 1)
    // Align to start of week (Monday)
    const weekStart = startOfWeek(startDate, { weekStartsOn: 1 })

    const cells: DayCell[] = []
    let activeDayCount = 0
    const monthLabelMap: { col: number; label: string }[] = []
    let lastMonth = -1

    let currentDate = new Date(weekStart)
    let col = 0
    let maxCol = 0

    while (currentDate <= today) {
      const dayOfWeek = getDay(currentDate) // 0=Sun, 1=Mon, ...
      // Convert to Mon=0, Sun=6
      const row = dayOfWeek === 0 ? 6 : dayOfWeek - 1

      // If it's Monday (row 0) and not the first iteration with an offset
      if (row === 0 && cells.length > 0) {
        col++
      }

      const dateStr = format(currentDate, 'yyyy-MM-dd')
      const count = countMap[dateStr] || 0
      if (count > 0) activeDayCount++

      // Track month labels
      const month = currentDate.getMonth()
      if (month !== lastMonth) {
        monthLabelMap.push({ col, label: format(currentDate, 'MMM') })
        lastMonth = month
      }

      cells.push({
        date: dateStr,
        count,
        col,
        row,
        displayDate: format(currentDate, 'EEE, MMM d'),
      })

      if (col > maxCol) maxCol = col

      currentDate = new Date(currentDate)
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return {
      grid: cells,
      weeks: maxCol + 1,
      monthLabels: monthLabelMap,
      activeDays: activeDayCount,
    }
  }, [activity, tasks])

  const leftPad = 20 // space for day labels
  const topPad = 16  // space for month labels
  const svgWidth = leftPad + weeks * CELL_STEP
  const svgHeight = topPad + 7 * CELL_STEP

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 className="section-header" style={{ marginBottom: 0 }}>Activity</h3>
        <span className="text-dim mono" style={{ fontSize: 11 }}>
          {activeDays} active day{activeDays !== 1 ? 's' : ''} in the last 6 months
        </span>
      </div>

      <div
        className="card"
        style={{ padding: '16px 20px', overflowX: 'auto', position: 'relative' }}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ display: 'block' }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={`month-${i}`}
              x={leftPad + m.col * CELL_STEP}
              y={10}
              fill="#888"
              fontSize={9}
              fontFamily="monospace"
            >
              {m.label}
            </text>
          ))}

          {/* Day labels */}
          {DAY_LABELS.map((d) => (
            <text
              key={`day-${d.row}`}
              x={0}
              y={topPad + d.row * CELL_STEP + CELL_SIZE - 1}
              fill="#888"
              fontSize={9}
              fontFamily="monospace"
            >
              {d.label}
            </text>
          ))}

          {/* Cells */}
          {grid.map((cell) => (
            <rect
              key={cell.date}
              x={leftPad + cell.col * CELL_STEP}
              y={topPad + cell.row * CELL_STEP}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              ry={2}
              fill={getColor(cell.count)}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                const rect = (e.target as SVGRectElement).getBoundingClientRect()
                const parent = (e.target as SVGRectElement).closest('.card')?.getBoundingClientRect()
                if (parent) {
                  setTooltip({
                    x: rect.left - parent.left + rect.width / 2,
                    y: rect.top - parent.top - 4,
                    text: `${cell.count} activit${cell.count === 1 ? 'y' : 'ies'} on ${cell.displayDate}`,
                  })
                }
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -100%)',
              background: '#2a2a2a',
              color: '#e0e0e0',
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: '1px solid #444',
              zIndex: 10,
            }}
          >
            {tooltip.text}
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 8 }}>
          <span className="text-dim" style={{ fontSize: 10, marginRight: 4 }}>Less</span>
          {[COLOR_EMPTY, COLOR_1, COLOR_2, COLOR_3, COLOR_4].map((c, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: c,
              }}
            />
          ))}
          <span className="text-dim" style={{ fontSize: 10, marginLeft: 4 }}>More</span>
        </div>
      </div>
    </div>
  )
}
