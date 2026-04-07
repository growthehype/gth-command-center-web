import { useState, useMemo } from 'react'
import { Megaphone, Plus, Trash2 } from 'lucide-react'
import { useAppStore, Campaign } from '@/lib/store'
import { campaigns as campaignsApi } from '@/lib/api'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'

const STATUSES = ['active', 'paused', 'completed', 'draft'] as const
type CampaignStatus = (typeof STATUSES)[number]

const STATUS_BADGE: Record<string, string> = {
  active: 'badge badge-ok',
  paused: 'badge badge-warn',
  completed: 'badge badge-neutral',
  draft: 'badge badge-polar',
}

const PLATFORMS = ['Google Ads', 'Meta Ads', 'Bing Ads', 'LinkedIn Ads', 'TikTok Ads', 'Other']

const EMPTY_FORM = {
  client_id: '', platform: '', name: '', status: 'active' as string,
  spend: 0, conversions: 0,
}

export default function Campaigns() {
  const { campaigns, clients, refreshCampaigns } = useAppStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Stats
  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length
    const totalSpend = campaigns
      .filter(c => c.updated_at >= monthStart)
      .reduce((sum, c) => sum + (c.spend || 0), 0)
    const totalConversions = campaigns
      .filter(c => c.updated_at >= monthStart)
      .reduce((sum, c) => sum + (c.conversions || 0), 0)
    return { activeCampaigns, totalSpend, totalConversions }
  }, [campaigns])

  const cycleStatus = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation()
    const idx = STATUSES.indexOf(campaign.status as CampaignStatus)
    const next = STATUSES[(idx + 1) % STATUSES.length]
    try {
      await campaignsApi.update(campaign.id, { status: next })
      await refreshCampaigns()
      showToast(`${campaign.name} -> ${next}`, 'success')
    } catch (err: any) { console.error('Campaign status update failed:', err); showToast(err?.message || 'Failed to update status', 'error') }
  }

  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (campaign: Campaign) => {
    setForm({
      client_id: campaign.client_id || '',
      platform: campaign.platform || '',
      name: campaign.name || '',
      status: campaign.status || 'active',
      spend: campaign.spend || 0,
      conversions: campaign.conversions || 0,
    })
    setEditingId(campaign.id)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Campaign name is required', 'warn'); return }
    if (saving) return
    setSaving(true)
    try {
      const data = {
        client_id: form.client_id || null,
        platform: form.platform || null,
        name: form.name.trim(),
        status: form.status,
        spend: Number(form.spend) || 0,
        conversions: Number(form.conversions) || 0,
      }
      if (editingId) {
        await campaignsApi.update(editingId, data)
        showToast('Campaign updated', 'success')
      } else {
        await campaignsApi.create(data)
        showToast('Campaign created', 'success')
      }
      await refreshCampaigns()
      setModalOpen(false)
    } catch (err: any) {
      console.error('Campaign save failed:', err)
      showToast(err?.message || 'Failed to save campaign', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await campaignsApi.delete(campaign.id)
      await refreshCampaigns()
      showToast(`Deleted ${campaign.name}`, 'success')
    } catch (err: any) { console.error('Campaign delete failed:', err); showToast(err?.message || 'Failed to delete', 'error') }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Campaigns</h1>
          <p className="text-dim mt-1" style={{ fontSize: '13px' }}>{campaigns.length} campaigns tracked</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={14} /> New Campaign
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="stat-card">
          <p className="label">Active Campaigns</p>
          <p className="text-polar font-[800]" style={{ fontSize: '20px' }}>{stats.activeCampaigns}</p>
        </div>
        <div className="stat-card">
          <p className="label">Total Spend MTD</p>
          <p className="text-polar font-[800]" style={{ fontSize: '20px' }}>{formatCurrency(stats.totalSpend)}</p>
        </div>
        <div className="stat-card">
          <p className="label">Conversions MTD</p>
          <p className="text-polar font-[800]" style={{ fontSize: '20px' }}>{stats.totalConversions}</p>
        </div>
      </div>

      {/* Table */}
      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Add your first campaign to start tracking ad performance."
          actionLabel="+ New Campaign"
          onAction={openCreate}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full" style={{ fontSize: '13px' }}>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label px-4 py-3">Client</th>
                <th className="label px-4 py-3">Platform</th>
                <th className="label px-4 py-3">Campaign</th>
                <th className="label px-4 py-3 text-right">Spend</th>
                <th className="label px-4 py-3 text-right">Conversions</th>
                <th className="label px-4 py-3">Status</th>
                <th className="label px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr
                  key={c.id}
                  className="table-row cursor-pointer"
                  onClick={() => openEdit(c)}
                >
                  <td className="px-4 py-3 text-polar font-semibold">{c.client_name || '-'}</td>
                  <td className="px-4 py-3 text-steel">{c.platform || '-'}</td>
                  <td className="px-4 py-3 text-steel">{c.name}</td>
                  <td className="px-4 py-3 text-right mono text-steel">{formatCurrency(c.spend)}</td>
                  <td className="px-4 py-3 text-right mono text-steel">{c.conversions}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => cycleStatus(c, e)}
                      className={STATUS_BADGE[c.status] || 'badge badge-neutral'}
                    >
                      {c.status}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => handleDelete(c, e)}
                      className="text-dim hover:text-err transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer note */}
      <p className="text-dim mt-4 text-center" style={{ fontSize: '12px' }}>
        In v1.1, this will pull live data from Meta, Google, and Bing APIs
      </p>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Campaign' : 'New Campaign'}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="label mb-1">Client</p>
            <select
              className="input w-full"
              value={form.client_id}
              onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
            >
              <option value="">Select client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <p className="label mb-1">Platform</p>
            <select
              className="input w-full"
              value={form.platform}
              onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
            >
              <option value="">Select platform</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <p className="label mb-1">Campaign Name *</p>
            <input
              className="input w-full"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Campaign name"
            />
          </div>
          <div>
            <p className="label mb-1">Status</p>
            <select
              className="input w-full"
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="label mb-1">Spend ($)</p>
              <input
                type="number"
                className="input w-full"
                value={form.spend}
                onChange={e => setForm(f => ({ ...f, spend: Number(e.target.value) }))}
              />
            </div>
            <div>
              <p className="label mb-1">Conversions</p>
              <input
                type="number"
                className="input w-full"
                value={form.conversions}
                onChange={e => setForm(f => ({ ...f, conversions: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <button onClick={() => setModalOpen(false)} className="btn-ghost">Cancel</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving || !form.name.trim()} style={{ opacity: (saving || !form.name.trim()) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
