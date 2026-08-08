import {
  getCurrentUser,
  isAdminOrSuper,
  isProduction,
  isProductionManager,
} from '@/app/api/admin/_utils';
import { checkModuleAccess } from '@/app/lib/plan-enforcement';

export async function getResourcePlannerUser() {
  const me = await getCurrentUser();
  if (!me?.tenantId) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }

  if (!isAdminOrSuper(me.role) && !isProduction(me.role) && !isProductionManager(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }

  // P-1: the resource planner is part of the Production module, which trial and
  // Starter tenants do not have.
  const planAccess = await checkModuleAccess(me.tenantId, 'production', me.role);
  if (!planAccess.ok) {
    return { ok: false as const, status: planAccess.status, error: planAccess.error };
  }

  return { ok: true as const, user: me };
}

export function asIsoDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  return null;
}
