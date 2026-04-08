import { useAppStore } from '@/lib/store'

export function useTenant() {
  const { currentTenantId, currentTenantRole } = useAppStore()

  return {
    tenantId: currentTenantId,
    role: currentTenantRole,
    isOwner: currentTenantRole === 'owner',
    isAdmin: currentTenantRole === 'owner' || currentTenantRole === 'admin',
    canEdit: currentTenantRole !== 'viewer',
    canManageTeam: currentTenantRole === 'owner' || currentTenantRole === 'admin',
    canManageBilling: currentTenantRole === 'owner',
    canManageIntegrations: currentTenantRole === 'owner' || currentTenantRole === 'admin',
  }
}
