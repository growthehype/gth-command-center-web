import { useState, useMemo } from 'react'
import { TrendingUp, ChevronUp, ChevronDown } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import EmptyState from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'
import Skeleton, { SkeletonTable } from '@/components/ui/Skeleton'

function ProfitabilitySkeleton() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Skeleton variant="text" width="160px" height="24px" />
        <Skeleton variant="text" width="320px" height="13px" className="mt-2" />
      </div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="stat-card">
            <Skeleton variant="text" width="100px" height="10px" />
            <Skeleton variant="text" width="80px" height="20px" className="mt-2" />
          </div>
        ))}
      </div>
      {/* Table */}
      <SkeletonTable rows={6} columns={5} />
    </div>
  )
}

type SortKey = 'name' | 'mrr' | 'hoursMonth' | 'effectiveRate' | 'hoursAll'

interface ClientProfit {
  id: string
  name: string
  mrr: number
  hoursMonth: number
  effectiveRate: number
  hoursAll: number
}

export default function Profitability() {
  const { clients, timeEntries, dataLoaded } = useAppStore()

  if (!dataLoaded) return <ProfitabilitySkeleton />

  const [sortKey, setSortKey] = useState<SortKey>('effectiveRate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Current month boundaries
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  // Week boundaries (Mon-Sun)
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() + mondayOffset)
  weekStart.setHours(0, 0, 0, 0)
  const weekStartStr = weekStart.toISOString()

  // Build profitability data
  const profitData = useMemo(() => {
    const activeClients = clients.filter(c => c.status === 'active' && (c.mrr || 0) > 0)

    return activeClients.map(client => {
      const clientEntries = timeEntries.filter(t => t.client_id === client.id)
      const monthEntries = clientEntries.filter(t => {
        const d = t.started_at
        return d >= monthStart && d <= monthEnd
      })

      const hoursMonth = monthEntries.reduce((s, t) => s + (t.duration_minutes || 0), 0) / 60
      const hoursAll = clientEntries.reduce((s, t) => s + (t.duration_minutes || 0), 0) / 60
      const effectiveRate = hoursMonth > 0 ? client.mrr / hoursMonth : client.mrr > 0 ? Infinity : 0

      return {
        id: client.id,
        name: client.name,
        mrr: client.mrr || 0,
        hoursMonth: Math.round(hoursMonth * 10) / 10,
        effectiveRate: effectiveRate === Infinity ? 999 : Math.round(effectiveRate * 100) / 100,
        hoursAll: Math.round(hoursAll * 10) / 10,
      } as ClientProfit
    })
  }, [clients, timeEntries, monthStart, monthEnd])

  // Sort
  const sorted = useMemo(() => {
    const list = [...profitData]
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else cmp = (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [profitData, sortKey, sortDir])

  // Summary stats
  const summary = useMemo(() => {
    if (profitData.length === 0) return { avgRate: 0, mostProfitable: '-', leastProfitable: '-', hoursThisWeek: 0 }

    const withHours = profitData.filter(c => c.hoursMonth > 0)
    const avgRate = withHours.length > 0
      ? withHours.reduce((s, c) => s + c.effectiveRate, 0) / withHours.length
      : 0

    const sortedByRate = [...withHours].sort((a, b) => b.effectiveRate - a.effectiveRate)
    const mostProfitable = sortedByRate[0]?.name || '-'
    const leastProfitable = sortedByRate[sortedByRate.length - 1]?.name || '-'

    const hoursThisWeek = timeEntries
      .filter(t => t.started_at >= weekStartStr)
      .reduce((s, t) => s + (t.duration_minutes || 0), 0) / 60

    return {
      avgRate: Math.round(avgRate),
      mostProfitable,
      leastProfitable,
      hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
    }
  }, [profitData, timeEntries, weekStartStr])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ChevronUp size={10} className="text-dim ml-1 inline" />
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-polar ml-1 inline" />
      : <ChevronDown size={10} className="text-polar ml-1 inline" />
  }

  const rateColor = (rate: number): string => {
    if (rate >= 80) return 'text-ok'
    if (rate >= 40) return 'text-warn'
    return 'text-err'
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1>Profitability</h1>
        <p className="text-dim mt-1" style={{ fontSize: '13px' }}>Effective hourly rates across active retainer clients</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="stat-card">
          <p className="label">Avg Effective Rate</p>
          <p className="text-polar font-[800]" style={{ fontSize: '20px' }}>${summary.avgRate}/hr</p>
        </div>
        <div className="stat-card">
          <p className="label">Most Profitable</p>
          <p className="text-ok font-[700] truncate" style={{ fontSize: '15px' }}>{summary.mostProfitable}</p>
        </div>
        <div className="stat-card">
          <p className="label">Least Profitable</p>
          <p className="text-err font-[700] truncate" style={{ fontSize: '15px' }}>{summary.leastProfitable}</p>
        </div>
        <div className="stat-card">
          <p className="label">Hours This Week</p>
          <p className="text-polar font-[800]" style={{ fontSize: '20px' }}>{summary.hoursThisWeek}h</p>
        </div>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No profitability data"
          description="Add active clients with MRR and log time entries to see profitability analysis."
        />
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[600px]" style={{ fontSize: '13px' }}>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label px-4 py-3 cursor-pointer" onClick={() => handleSort('name')}>
                  Client <SortIcon col="name" />
                </th>
                <th className="label px-4 py-3 cursor-pointer text-right" onClick={() => handleSort('mrr')}>
                  MRR <SortIcon col="mrr" />
                </th>
                <th className="label px-4 py-3 cursor-pointer text-right" onClick={() => handleSort('hoursMonth')}>
                  Hours This Month <SortIcon col="hoursMonth" />
                </th>
                <th className="label px-4 py-3 cursor-pointer text-right" onClick={() => handleSort('effectiveRate')}>
                  Effective $/hr <SortIcon col="effectiveRate" />
                </th>
                <th className="label px-4 py-3 cursor-pointer text-right" onClick={() => handleSort('hoursAll')}>
                  Hours All Time <SortIcon col="hoursAll" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr key={row.id} className="table-row">
                  <td className="px-4 py-3 text-polar font-semibold">{row.name}</td>
                  <td className="px-4 py-3 text-right mono text-steel">{formatCurrency(row.mrr)}</td>
                  <td className="px-4 py-3 text-right mono text-steel">{row.hoursMonth}h</td>
                  <td className={`px-4 py-3 text-right mono font-bold ${rateColor(row.effectiveRate)}`}>
                    {row.effectiveRate >= 999 ? 'N/A' : `$${row.effectiveRate}/hr`}
                  </td>
                  <td className="px-4 py-3 text-right mono text-dim">{row.hoursAll}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
