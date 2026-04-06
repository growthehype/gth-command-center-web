import { useState, useMemo, useEffect } from 'react'
import { DollarSign } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { taxStatus as taxStatusApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import EmptyState from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'

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

export default function Financials() {
  const { invoices, refreshInvoices } = useAppStore()

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

  // Year invoices
  const yearInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const d = inv.paid_at || inv.sent_date || inv.created_at
      if (!d) return false
      try {
        return new Date(d).getFullYear() === selectedYear
      } catch { return false }
    })
  }, [invoices, selectedYear])

  // Stats for selected year
  const stats = useMemo(() => {
    const paid = yearInvoices.filter(i => i.status === 'paid')
    const outstanding = yearInvoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    const revenuePaid = paid.reduce((s, i) => s + (i.amount || 0), 0)
    const outstandingAmt = outstanding.reduce((s, i) => s + (i.amount || 0), 0)
    const taxRecord = taxStatuses.find(t => t.year === selectedYear)
    const taxStatus = taxRecord?.status || 'not-filed'
    return { revenuePaid, outstandingAmt, taxStatus }
  }, [yearInvoices, selectedYear, taxStatuses])

  // Monthly revenue (from paid invoices)
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

  const maxMonthly = Math.max(...monthlyRevenue, 1)

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
        <h1>Financials</h1>
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

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="stat-card">
          <p className="label">Revenue Paid</p>
          <p className="text-ok font-[800]" style={{ fontSize: '20px' }}>{formatCurrency(stats.revenuePaid)}</p>
        </div>
        <div className="stat-card">
          <p className="label">Outstanding</p>
          <p className="text-warn font-[800]" style={{ fontSize: '20px' }}>{formatCurrency(stats.outstandingAmt)}</p>
        </div>
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

      {/* Monthly Revenue Bar Chart */}
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

      {/* Tax Filing Status List */}
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
