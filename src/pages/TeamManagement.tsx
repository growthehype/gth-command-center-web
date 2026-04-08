import { useEffect, useState } from 'react'
import { Users, Plus, Mail, Shield, Trash2, Copy, Crown, UserMinus } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { useTenant } from '@/hooks/useTenant'
import { invitations, team } from '@/lib/api'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import EmptyState from '@/components/ui/EmptyState'

function getInitials(email: string) {
  const parts = email.split('@')[0].split(/[._-]/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

function roleBadge(role: string) {
  switch (role) {
    case 'owner': return 'badge badge-ok'
    case 'admin': return 'badge badge-warn'
    case 'member': return 'badge badge-neutral'
    case 'viewer': return 'badge badge-err'
    default: return 'badge badge-neutral'
  }
}

function roleIcon(role: string) {
  if (role === 'owner') return <Crown size={11} />
  return <Shield size={11} />
}

export default function TeamManagement() {
  const { user, teamMembers, pendingInvites, refreshTeamMembers, refreshPendingInvites } = useAppStore()
  const { canManageTeam } = useTenant()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    refreshTeamMembers()
    refreshPendingInvites()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setSending(true)
    try {
      await invitations.create(inviteEmail.trim(), inviteRole)
      showToast(`Invitation sent to ${inviteEmail}`, 'success')
      setInviteEmail('')
      setInviteRole('member')
      setInviteOpen(false)
      await refreshPendingInvites()
    } catch (err: any) {
      showToast(err.message || 'Failed to send invite', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleRevoke = async (id: string) => {
    try {
      await invitations.revoke(id)
      showToast('Invitation revoked', 'success')
      await refreshPendingInvites()
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke', 'error')
    }
  }

  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      await team.updateRole(memberId, newRole)
      showToast('Role updated', 'success')
      await refreshTeamMembers()
    } catch (err: any) {
      showToast(err.message || 'Failed to update role', 'error')
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Remove this team member?')) return
    try {
      await team.remove(memberId)
      showToast('Member removed', 'success')
      await refreshTeamMembers()
    } catch (err: any) {
      showToast(err.message || 'Failed to remove member', 'error')
    }
  }

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(link)
    showToast('Invite link copied', 'info')
  }

  const totalMembers = teamMembers.length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-polar font-[800] flex items-center gap-2" style={{ fontSize: '22px', letterSpacing: '-0.02em' }}>
            <Users size={22} /> Team
          </h1>
          <p className="text-dim mt-1" style={{ fontSize: '12.5px' }}>
            {totalMembers} member{totalMembers !== 1 ? 's' : ''}
          </p>
        </div>
        {canManageTeam && (
          <button onClick={() => setInviteOpen(true)} className="btn-primary flex items-center gap-2" style={{ fontSize: '11px', padding: '8px 16px' }}>
            <Plus size={13} /> Invite Member
          </button>
        )}
      </div>

      {/* Invite Modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Team Member">
        <div className="space-y-4">
          <div>
            <label className="label text-dim block mb-1.5" style={{ fontSize: '11px' }}>Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="team@example.com"
              className="bg-cell border border-border px-3 py-2 text-polar w-full rounded"
              style={{ fontSize: '12.5px' }}
            />
          </div>
          <div>
            <label className="label text-dim block mb-1.5" style={{ fontSize: '11px' }}>Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="bg-cell border border-border px-3 py-2 text-polar w-full rounded"
              style={{ fontSize: '12.5px' }}
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setInviteOpen(false)} className="btn-ghost" style={{ fontSize: '11px', padding: '8px 16px' }}>
              Cancel
            </button>
            <button onClick={handleInvite} disabled={sending || !inviteEmail.trim()} className="btn-primary flex items-center gap-2" style={{ fontSize: '11px', padding: '8px 16px' }}>
              <Mail size={13} /> {sending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <div className="card p-5">
          <h2 className="text-polar font-[700] mb-4 flex items-center gap-2" style={{ fontSize: '14px' }}>
            <Mail size={15} /> Pending Invitations
          </h2>
          <div className="space-y-2">
            {pendingInvites.map((invite: any) => (
              <div key={invite.id} className="flex items-center justify-between bg-cell border border-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-dim font-[700] shrink-0" style={{ fontSize: '10px' }}>
                    {getInitials(invite.email)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-polar font-[600] truncate" style={{ fontSize: '12.5px' }}>{invite.email}</p>
                    <p className="text-dim" style={{ fontSize: '10.5px' }}>
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={roleBadge(invite.role)} style={{ fontSize: '10px' }}>
                    {invite.role}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {invite.token && (
                    <button
                      onClick={() => copyInviteLink(invite.token)}
                      className="btn-ghost flex items-center gap-1"
                      style={{ fontSize: '10px', padding: '4px 8px' }}
                      title="Copy invite link"
                    >
                      <Copy size={12} /> Link
                    </button>
                  )}
                  {canManageTeam && (
                    <button
                      onClick={() => handleRevoke(invite.id)}
                      className="btn-ghost text-err flex items-center gap-1"
                      style={{ fontSize: '10px', padding: '4px 8px' }}
                    >
                      <Trash2 size={12} /> Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members */}
      <div className="card p-5">
        <h2 className="text-polar font-[700] mb-4 flex items-center gap-2" style={{ fontSize: '14px' }}>
          <Users size={15} /> Members
        </h2>

        {teamMembers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No team members yet"
            description="Invite your first team member to start collaborating."
            actionLabel={canManageTeam ? 'Invite Member' : undefined}
            onAction={canManageTeam ? () => setInviteOpen(true) : undefined}
          />
        ) : (
          <div className="space-y-2">
            {teamMembers.map((member: any) => {
              const isCurrentUser = member.user_id === user?.id || member.email === user?.email
              const isOwner = member.role === 'owner'

              return (
                <div
                  key={member.id}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
                    isCurrentUser
                      ? 'bg-surface-2 border-accent/30'
                      : 'bg-cell border-border'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-[700] shrink-0 ${
                        isOwner ? 'bg-ok/15 text-ok' : 'bg-surface-2 text-dim'
                      }`}
                      style={{ fontSize: '11px' }}
                    >
                      {getInitials(member.email || 'U')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-polar font-[600] truncate" style={{ fontSize: '12.5px' }}>
                          {member.email}
                        </p>
                        {isCurrentUser && (
                          <span className="text-dim" style={{ fontSize: '10px' }}>(you)</span>
                        )}
                      </div>
                      <p className="text-dim" style={{ fontSize: '10.5px' }}>
                        Joined {new Date(member.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Role badge or dropdown */}
                    {canManageTeam && !isOwner ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.id, e.target.value)}
                        className="bg-cell border border-border px-2 py-1 text-steel rounded"
                        style={{ fontSize: '10.5px' }}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className={`${roleBadge(member.role)} flex items-center gap-1`} style={{ fontSize: '10px' }}>
                        {roleIcon(member.role)} {member.role}
                      </span>
                    )}

                    {/* Remove button */}
                    {canManageTeam && !isOwner && !isCurrentUser && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="btn-ghost text-err"
                        style={{ padding: '4px 6px' }}
                        title="Remove member"
                      >
                        <UserMinus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
