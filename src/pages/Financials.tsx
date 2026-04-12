import { useState, useMemo, useEffect, useCallback } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, Clock } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { taxStatus as taxStatusApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import { formatCurrency } from '@/lib/utils'
import Skeleton from '@/components/ui/Skeleton'

function FinancialsSkeleton() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Skeleton variant="text" width="140px" height="24px" />
        <Skeleton variant="text" width="260px" height="13px" className="mt-2" />
      </div>
      {/* Year tabs */}
      <div className="flex gap-1 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="text" width="48px" height="28px" />
        ))}
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="stat-card">
            <Skeleton variant="text" width="90px" height="10px" />
            <Skeleton variant="text" width="100px" height="20px" className="mt-2" />
            <Skeleton variant="text" width="70px" height="12px" className="mt-2" />
          </div>
        ))}
      </div>
      {/* Chart placeholder */}
      <div className="card p-5 mb-6">
        <Skeleton variant="text" width="180px" height="12px" className="mb-4" />
        <Skeleton variant="rect" width="100%" height="200px" />
      </div>
      {/* Bar chart placeholder */}
      <div className="card p-5 mb-6">
        <Skeleton variant="text" width="180px" height="12px" className="mb-4" />
        <Skeleton variant="rect" width="100%" height="180px" />
      </div>
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const TAX_STATUSES = ['not-filed', 'draft', 'filed'] as const
type TaxStatus = (typeof TAX_STATUSES)[number]

const TAX_BADGE: Record<string, string> = {
  'not-filed': 'badge badge-err',
  'draft': 'badge badge-warn',
  'filed': 'badge badge-ok',
}

interface TaxRecord {
  year: number
  status: string
}

/* ------------------------------------------------------------------ */
/*  Revenue Area Chart (inline SVG, no libraries)                     */
/* ------------------------------------------------------------------ */
function RevenueAreaChart({ data, year }: { data: number[]; year: number }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const W = 720
  const H = 220
  const PAD_L = 62
  const PAD_R = 16
  const PAD_T = 20
  const PAD_B = 32

  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  const max = Math.max(...data, 1)
  // nice round grid ceiling
  const gridMax = (() => {
    if (max <= 0) return 1000
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
    const normalized = max / magnitude
    if (normalized <= 1) return magnitude
    if (normalized <= 2) return 2 * magnitude
    if (normalized <= 5) return 5 * magnitude
    return 10 * magnitude
  })()

  const gridLines = 4
  const yStep = gridMax / gridLines

  const xForIdx = (i: number) => PAD_L + (i / 11) * chartW
  const yForVal = (v: number) => PAD_T + chartH - (v / gridMax) * chartH

  const points = data.map((v, i) => ({ x: xForIdx(i), y: yForVal(v), val: v }))

  // build SVG path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD_T + chartH} L${points[0].x},${PAD_T + chartH} Z`

  const gradientId = `rev-grad-${year}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '220px' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6C9BFF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6C9BFF" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* grid lines + Y labels */}
      {Array.from({ length: gridLines + 1 }).map((_, i) => {
        const val = i * yStep
        const y = yForVal(val)
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#333" strokeWidth="0.5" />
            <text x={PAD_L - 8} y={y + 4} textAnchor="end" fill="#888" fontSize="10" fontFamily="'Space Mono', monospace">
              {val >= 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`}
            </text>
          </g>
        )
      })}

      {/* X labels */}
      {MONTHS.map((m, i) => (
        <text key={m} x={xForIdx(i)} y={H - 6} textAnchor="middle" fill="#888" fontSize="10" fontFamily="'Space Mono', monospace">
          {m}
        </text>
      ))}

      {/* area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* line */}
      <path d={linePath} fill="none" stroke="#6C9BFF" strokeWidth="2" strokeLinejoin="round" />

      {/* dots + hover rects */}
      {points.map((p, i) => (
        <g key={i}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx(null)}
          style={{ cursor: 'pointer' }}
        >
          {/* invisible hover area */}
          <rect x={p.x - chartW / 24} y={PAD_T} width={chartW / 12} height={chartH} fill="transparent" />

          {/* dot */}
          <circle
            cx={p.x} cy={p.y} r={hoverIdx === i ? 5 : (p.val > 0 ? 3 : 0)}
            fill={hoverIdx === i ? '#FFF' : '#6C9BFF'}
            stroke={hoverIdx === i ? '#6C9BFF' : 'none'}
            strokeWidth="2"
          />

          {/* tooltip */}
          {hoverIdx === i && p.val > 0 && (
            <g>
              <rect x={p.x - 38} y={p.y - 28} width="76" height="20" fill="#111" stroke="#333" strokeWidth="0.5" />
              <text x={p.x} y={p.y - 14} textAnchor="middle" fill="#FFF" fontSize="11" fontFamily="'Space Mono', monospace">
                {formatCurrency(p.val)}
              </text>
            </g>
          )}
        </g>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Invoice Aging Bars                                                */
/* ------------------------------------------------------------------ */
interface AgingBucket { label: string; color: string; count: number; total: number }

function InvoiceAging({ buckets, grandTotal }: { buckets: AgingBucket[]; grandTotal: number }) {
  return (
    <div className="flex flex-col gap-3">
      {buckets.map(b => {
        const pct = grandTotal > 0 ? (b.total / grandTotal) * 100 : 0
        return (
          <div key={b.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="label">{b.label}</span>
              <span className="mono text-dim" style={{ fontSize: '12px' }}>
                {b.count} inv &middot; {formatCurrency(b.total)}
              </span>
            </div>
            <div className="w-full bg-[#1a1a1a]" style={{ height: '6px' }}>
              <div style={{ width: `${Math.max(pct, b.total > 0 ? 2 : 0)}%`, height: '100%', backgroundColor: b.color, transition: 'width 0.3s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Top Clients Mini-Table                                            */
/* ------------------------------------------------------------------ */
type SortField = 'revenue' | 'count'

function TopClientsTable({ clients }: { clients: { name: string; revenue: number; count: number }[] }) {
  const [sortBy, setSortBy] = useState<SortField>('revenue')

  const sorted = useMemo(() => {
    const copy = [...clients]
    copy.sort((a, b) => sortBy === 'revenue' ? b.revenue - a.revenue : b.count - a.count)
    return copy.slice(0, 5)
  }, [clients, sortBy])

  const maxRevenue = sorted.length > 0 ? Math.max(...sorted.map(c => c.revenue), 1) : 1

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setSortBy('revenue')}
          className={`px-2 py-1 font-sans font-bold transition-colors ${sortBy === 'revenue' ? 'bg-polar text-obsidian' : 'bg-surface text-dim hover:text-steel'}`}
          style={{ fontSize: '10px', letterSpacing: '0.08em' }}
        >
          BY REVENUE
        </button>
        <button
          onClick={() => setSortBy('count')}
          className={`px-2 py-1 font-sans font-bold transition-colors ${sortBy === 'count' ? 'bg-polar text-obsidian' : 'bg-surface text-dim hover:text-steel'}`}
          style={{ fontSize: '10px', letterSpacing: '0.08em' }}
        >
          BY COUNT
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="text-dim" style={{ fontSize: '13px' }}>No client data for this year</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((c, i) => {
            const barPct = (c.revenue / maxRevenue) * 100
            return (
              <div key={c.name + i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-polar font-semibold" style={{ fontSize: '13px' }}>{c.name || 'Unknown'}</span>
                  <span className="mono text-dim" style={{ fontSize: '12px' }}>
                    {formatCurrency(c.revenue)} &middot; {c.count} inv
                  </span>
                </div>
                <div className="w-full bg-[#1a1a1a]" style={{ height: '4px' }}>
                  <div style={{ width: `${barPct}%`, height: '100%', backgroundColor: '#6C9BFF', transition: 'width 0.3s' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  MAIN PAGE                                                         */
/* ================================================================== */
export default function Financials() {
  const { invoices, refreshInvoices, dataLoaded } = useAppStore()

  if (!dataLoaded) return <FinancialsSkeleton />

  const currentYear = new Date().getFullYear()
  const years = useMemo(() => {
    const list: number[] = []
    for (let y = 2017; y <= currentYear; y++) list.push(y)
    return list
  }, [currentYear])

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [taxStatuses, setTaxStatuses] = useState<TaxRecord[]>([])

  // Load tax statuses
  useEffect(() => {
    const load = async () => {
      try {
        const data = await taxStatusApi.getAll()
        setTaxStatuses(data || [])
      } catch { /* ignore */ }
    }
    load()
  }, [])

  /* ---------- helpers to get invoices for any year ---------- */
  const invoicesForYear = useCallback((yr: number) => {
    return invoices.filter(inv => {
      const d = inv.paid_at || inv.sent_date || inv.created_at
      if (!d) return false
      try { return new Date(d).getFullYear() === yr } catch { return false }
    })
  }, [invoices])

  // Year invoices
  const yearInvoices = useMemo(() => invoicesForYear(selectedYear), [invoicesForYear, selectedYear])

  // Previous year invoices (for comparisons)
  const prevYearInvoices = useMemo(() => invoicesForYear(selectedYear - 1), [invoicesForYear, selectedYear])

  /* ---------- Stats for selected year ---------- */
  const stats = useMemo(() => {
    const paid = yearInvoices.filter(i => i.status === 'paid')
    const outstanding = yearInvoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    const revenuePaid = paid.reduce((s, i) => s + (i.amount || 0), 0)
    const outstandingAmt = outstanding.reduce((s, i) => s + (i.amount || 0), 0)
    const taxRecord = taxStatuses.find(t => t.year === selectedYear)
    const taxStatus = taxRecord?.status || 'not-filed'

    // previous year revenue
    const prevPaid = prevYearInvoices.filter(i => i.status === 'paid')
    const prevRevenue = prevPaid.reduce((s, i) => s + (i.amount || 0), 0)
    const prevOutstanding = prevYearInvoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    const prevOutstandingAmt = prevOutstanding.reduce((s, i) => s + (i.amount || 0), 0)

    return { revenuePaid, outstandingAmt, taxStatus, prevRevenue, prevOutstandingAmt }
  }, [yearInvoices, prevYearInvoices, selectedYear, taxStatuses])

  /* ---------- Monthly revenue ---------- */
  const monthlyRevenue = useMemo(() => {
    const months = new Array(12).fill(0)
    yearInvoices
      .filter(i => i.status === 'paid')
      .forEach(inv => {
        const d = inv.paid_at || inv.sent_date || inv.created_at
        if (!d) return
        try {
          const month = new Date(d).getMonth()
          months[month] += inv.amount || 0
        } catch { /* ignore */ }
      })
    return months
  }, [yearInvoices])

  const prevMonthlyRevenue = useMemo(() => {
    const months = new Array(12).fill(0)
    prevYearInvoices
      .filter(i => i.status === 'paid')
      .forEach(inv => {
        const d = inv.paid_at || inv.sent_date || inv.created_at
        if (!d) return
        try {
          const month = new Date(d).getMonth()
          months[month] += inv.amount || 0
        } catch { /* ignore */ }
      })
    return months
  }, [prevYearInvoices])

  const maxMonthly = Math.max(...monthlyRevenue, 1)

  /* ---------- Payment velocity ---------- */
  const paymentVelocity = useMemo(() => {
    const paidWithDates = yearInvoices.filter(i => i.status === 'paid' && i.sent_date && i.paid_at)
    if (paidWithDates.length === 0) return { avg: null, count: 0 }
    let totalDays = 0
    paidWithDates.forEach(inv => {
      const sent = new Date(inv.sent_date!).getTime()
      const paid = new Date(inv.paid_at!).getTime()
      totalDays += Math.max(0, (paid - sent) / (1000 * 60 * 60 * 24))
    })
    return { avg: Math.round(totalDays / paidWithDates.length), count: paidWithDates.length }
  }, [yearInvoices])

  const prevPaymentVelocity = useMemo(() => {
    const paidWithDates = prevYearInvoices.filter(i => i.status === 'paid' && i.sent_date && i.paid_at)
    if (paidWithDates.length === 0) return { avg: null, count: 0 }
    let totalDays = 0
    paidWithDates.forEach(inv => {
      const sent = new Date(inv.sent_date!).getTime()
      const paid = new Date(inv.paid_at!).getTime()
      totalDays += Math.max(0, (paid - sent) / (1000 * 60 * 60 * 24))
    })
    return { avg: Math.round(totalDays / paidWithDates.length), count: paidWithDates.length }
  }, [prevYearInvoices])

  /* ---------- Invoice aging ---------- */
  const agingData = useMemo(() => {
    const now = Date.now()
    const outstanding = yearInvoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    const buckets: AgingBucket[] = [
      { label: 'Current (0-30 days)', color: '#22c55e', count: 0, total: 0 },
      { label: '30-60 days', color: '#eab308', count: 0, total: 0 },
      { label: '60-90 days', color: '#f97316', count: 0, total: 0 },
      { label: '90+ days', color: '#ef4444', count: 0, total: 0 },
    ]
    outstanding.forEach(inv => {
      const dueStr = inv.due_date || inv.sent_date || inv.created_at
      if (!dueStr) return
      const days = Math.max(0, Math.floor((now - new Date(dueStr).getTime()) / (1000 * 60 * 60 * 24)))
      const idx = days < 30 ? 0 : days < 60 ? 1 : days < 90 ? 2 : 3
      buckets[idx].count++
      buckets[idx].total += inv.amount || 0
    })
    const grandTotal = buckets.reduce((s, b) => s + b.total, 0)
    return { buckets, grandTotal }
  }, [yearInvoices])

  /* ---------- Top clients ---------- */
  const topClients = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; count: number }> = {}
    yearInvoices.filter(i => i.status === 'paid').forEach(inv => {
      const key = inv.client_id || inv.client_name || 'unknown'
      if (!map[key]) map[key] = { name: inv.client_name || 'Unknown', revenue: 0, count: 0 }
      map[key].revenue += inv.amount || 0
      map[key].count++
    })
    return Object.values(map)
  }, [yearInvoices])

  /* ---------- YoY comparison ---------- */
  const yoy = useMemo(() => {
    if (stats.prevRevenue <= 0 && stats.revenuePaid <= 0) return null
    const change = stats.prevRevenue > 0
      ? ((stats.revenuePaid - stats.prevRevenue) / stats.prevRevenue) * 100
      : (stats.revenuePaid > 0 ? 100 : 0)
    return { prevRevenue: stats.prevRevenue, change: Math.round(change * 10) / 10 }
  }, [stats])

  /* ---------- Trend helpers ---------- */
  const pctChange = (curr: number, prev: number) => {
    if (prev <= 0 && curr <= 0) return null
    if (prev <= 0) return 100
    return Math.round(((curr - prev) / prev) * 100 * 10) / 10
  }

  const revenueTrend = pctChange(stats.revenuePaid, stats.prevRevenue)
  const outstandingTrend = pctChange(stats.outstandingAmt, stats.prevOutstandingAmt)

  const TrendIndicator = ({ value }: { value: number | null }) => {
    if (value === null) return <span className="text-dim" style={{ fontSize: '11px' }}>--</span>
    const isUp = value > 0
    const isDown = value < 0
    const color = isUp ? 'text-ok' : isDown ? 'text-err' : 'text-dim'
    const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus
    return (
      <span className={`inline-flex items-center gap-1 ${color}`} style={{ fontSize: '12px' }}>
        <Icon size={12} />
        <span className="mono">{isUp ? '+' : ''}{value}%</span>
        <span className="text-dim" style={{ fontSize: '10px' }}>vs {selectedYear - 1}</span>
      </span>
    )
  }

  // Cycle tax status
  const cycleTaxStatus = async (year: number) => {
    const current = taxStatuses.find(t => t.year === year)?.status || 'not-filed'
    const idx = TAX_STATUSES.indexOf(current as TaxStatus)
    const next = TAX_STATUSES[(idx + 1) % TAX_STATUSES.length]
    try {
      await taxStatusApi.update(year, next)
      setTaxStatuses(prev => {
        const existing = prev.find(t => t.year === year)
        if (existing) return prev.map(t => t.year === year ? { ...t, status: next } : t)
        return [...prev, { year, status: next }]
      })
      showToast(`${year} tax status -> ${next}`, 'success')
    } catch { showToast('Failed to update tax status', 'error') }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1>Financials</h1>
          <DollarSign size={14} className="text-dim" />
        </div>
        <p className="text-dim mt-1" style={{ fontSize: '13px' }}>Revenue tracking and tax filing status</p>
      </div>

      {/* Year Tabs */}
      <div className="flex gap-1 mb-6 flex-wrap">
        {years.map(y => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className={`px-3 py-1.5 font-sans font-bold transition-colors ${
              selectedYear === y ? 'bg-polar text-obsidian' : 'bg-surface text-dim hover:text-steel'
            }`}
            style={{ fontSize: '12px', letterSpacing: '0.08em' }}
          >
            {y}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/*  ENHANCED STAT CARDS                                         */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        {/* Revenue Paid */}
        <div className="stat-card">
          <p className="label">Revenue Paid</p>
          <p className="text-ok font-[800]" style={{ fontSize: '20px' }}>{formatCurrency(stats.revenuePaid)}</p>
          <div className="mt-1"><TrendIndicator value={revenueTrend} /></div>
        </div>

        {/* Outstanding */}
        <div className="stat-card">
          <p className="label">Outstanding</p>
          <p className="text-warn font-[800]" style={{ fontSize: '20px' }}>{formatCurrency(stats.outstandingAmt)}</p>
          <div className="mt-1">
            {outstandingTrend !== null ? (
              <span className={`inline-flex items-center gap-1 ${outstandingTrend > 0 ? 'text-err' : outstandingTrend < 0 ? 'text-ok' : 'text-dim'}`} style={{ fontSize: '12px' }}>
                {outstandingTrend > 0 ? <ArrowUp size={12} /> : outstandingTrend < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                <span className="mono">{outstandingTrend > 0 ? '+' : ''}{outstandingTrend}%</span>
                <span className="text-dim" style={{ fontSize: '10px' }}>vs {selectedYear - 1}</span>
              </span>
            ) : (
              <span className="text-dim" style={{ fontSize: '11px' }}>--</span>
            )}
          </div>
        </div>

        {/* Payment Velocity */}
        <div className="stat-card">
          <div className="flex items-center gap-1.5">
            <p className="label">Avg. Days to Pay</p>
            <Clock size={10} className="text-dim" />
          </div>
          {paymentVelocity.avg !== null ? (
            <>
              <p className="text-polar font-[800]" style={{ fontSize: '20px' }}>
                {paymentVelocity.avg}<span className="text-dim font-normal" style={{ fontSize: '13px' }}> days</span>
              </p>
              <div className="mt-1">
                {prevPaymentVelocity.avg !== null ? (
                  <span className={`inline-flex items-center gap-1 ${paymentVelocity.avg < prevPaymentVelocity.avg ? 'text-ok' : paymentVelocity.avg > prevPaymentVelocity.avg ? 'text-err' : 'text-dim'}`} style={{ fontSize: '12px' }}>
                    {paymentVelocity.avg < prevPaymentVelocity.avg ? <ArrowDown size={12} /> : paymentVelocity.avg > prevPaymentVelocity.avg ? <ArrowUp size={12} /> : <Minus size={12} />}
                    <span className="mono">{prevPaymentVelocity.avg}d</span>
                    <span className="text-dim" style={{ fontSize: '10px' }}>prev yr</span>
                  </span>
                ) : (
                  <span className="text-dim" style={{ fontSize: '11px' }}>No prior data</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-dim" style={{ fontSize: '14px' }}>No data</p>
          )}
        </div>

        {/* Tax Status */}
        <div className="stat-card">
          <p className="label">Tax Status</p>
          <p className="mt-1">
            <button
              onClick={() => cycleTaxStatus(selectedYear)}
              className={TAX_BADGE[stats.taxStatus] || 'badge badge-neutral'}
            >
              {stats.taxStatus}
            </button>
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  YEAR-OVER-YEAR COMPARISON                                   */}
      {/* ============================================================ */}
      {yoy && (
        <div className="card p-4 mb-6">
          <p className="label mb-3">Year-over-Year Comparison</p>
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <span className="text-dim" style={{ fontSize: '12px' }}>{selectedYear} Revenue</span>
              <p className="text-polar font-[800] mono" style={{ fontSize: '16px' }}>{formatCurrency(stats.revenuePaid)}</p>
            </div>
            <div className="text-dim" style={{ fontSize: '18px' }}>vs</div>
            <div>
              <span className="text-dim" style={{ fontSize: '12px' }}>{selectedYear - 1} Revenue</span>
              <p className="text-steel font-[800] mono" style={{ fontSize: '16px' }}>{formatCurrency(yoy.prevRevenue)}</p>
            </div>
            <div className="ml-auto">
              <div className={`flex items-center gap-2 px-3 py-2 ${yoy.change >= 0 ? 'bg-ok/10' : 'bg-err/10'}`}>
                {yoy.change >= 0 ? <TrendingUp size={16} className="text-ok" /> : <TrendingDown size={16} className="text-err" />}
                <span className={`font-[800] mono ${yoy.change >= 0 ? 'text-ok' : 'text-err'}`} style={{ fontSize: '16px' }}>
                  {yoy.change >= 0 ? '+' : ''}{yoy.change}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  REVENUE AREA CHART                                          */}
      {/* ============================================================ */}
      <div className="card p-5 mb-6">
        <p className="label mb-4">Revenue Trend ({selectedYear})</p>
        {yearInvoices.length === 0 ? (
          <p className="text-dim text-center py-8" style={{ fontSize: '13px' }}>No invoice data for {selectedYear}</p>
        ) : (
          <RevenueAreaChart data={monthlyRevenue} year={selectedYear} />
        )}
      </div>

      {/* ============================================================ */}
      {/*  MONTHLY REVENUE BAR CHART (original)                        */}
      {/* ============================================================ */}
      <div className="card p-5 mb-6">
        <p className="label mb-4">Monthly Revenue ({selectedYear})</p>
        {yearInvoices.length === 0 ? (
          <p className="text-dim text-center py-8" style={{ fontSize: '13px' }}>No invoice data for {selectedYear}</p>
        ) : (
          <div className="flex items-end gap-2" style={{ height: '180px' }}>
            {monthlyRevenue.map((amount, i) => {
              const height = maxMonthly > 0 ? (amount / maxMonthly) * 100 : 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="mono text-dim" style={{ fontSize: '10px' }}>
                    {amount > 0 ? formatCurrency(amount) : ''}
                  </span>
                  <div className="w-full flex items-end" style={{ height: '140px' }}>
                    <div
                      className="w-full transition-all"
                      style={{
                        height: `${Math.max(height, amount > 0 ? 4 : 0)}%`,
                        backgroundColor: amount > 0 ? '#6C9BFF' : 'transparent',
                        minHeight: amount > 0 ? '4px' : '0',
                      }}
                    />
                  </div>
                  <span className="label" style={{ fontSize: '10px' }}>{MONTHS[i]}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/*  INVOICE AGING + TOP CLIENTS (side by side)                  */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
        {/* Invoice Aging */}
        <div className="card p-5">
          <p className="label mb-4">Invoice Aging</p>
          {agingData.grandTotal > 0 ? (
            <InvoiceAging buckets={agingData.buckets} grandTotal={agingData.grandTotal} />
          ) : (
            <p className="text-dim" style={{ fontSize: '13px' }}>No outstanding invoices</p>
          )}
        </div>

        {/* Top Clients */}
        <div className="card p-5">
          <p className="label mb-3">Top Clients by Revenue ({selectedYear})</p>
          <TopClientsTable clients={topClients} />
        </div>
      </div>

      {/* ============================================================ */}
      {/*  TAX FILING STATUS LIST (original)                           */}
      {/* ============================================================ */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="label">Tax Filing Status by Year</p>
        </div>
        <div>
          {years.slice().reverse().map(y => {
            const record = taxStatuses.find(t => t.year === y)
            const status = record?.status || 'not-filed'
            return (
              <div key={y} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0">
                <span className="text-polar font-semibold mono" style={{ fontSize: '14px' }}>{y}</span>
                <button
                  onClick={() => cycleTaxStatus(y)}
                  className={TAX_BADGE[status] || 'badge badge-neutral'}
                >
                  {status}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
