import { getCurrentUser, isProduction } from '../admin/_utils';
import { checkModuleAccess } from '@/app/lib/plan-enforcement';

export type ProductionUser = {
  uid: string;
  role: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  [key: string]: any;
};

type ProjectAssignment = {
  productionUid?: string | null;
  productionOwnerId?: string | null;
  assignedProductionIds?: string[] | null;
};

export async function getProductionUser(): Promise<ProductionUser | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  const role = (me.role || '').toLowerCase().replace(/-/g, '_');
  if (!['production', 'production_manager', 'admin', 'super_admin'].includes(role)) return null;
  // P-1: plan entitlement. `production` is disabled on the trial and Starter tiers,
  // and middleware skips module checks for /api, so without this a Starter tenant
  // blocked from /production in the browser could still drive every
  // /api/production/* route directly.
  //
  // This guard returns `ProductionUser | null`, so a plan denial surfaces to callers
  // as the same 401/403 they already return. Distinguishing "wrong role" from
  // "upgrade required" here would mean changing the return shape across all 8 callers,
  // which is a separate refactor; blocking correctly matters more than the status code
  // on a defence-in-depth layer the UI already gates.
  const planAccess = await checkModuleAccess(me.tenantId, 'production', me.role);
  if (!planAccess.ok) return null;
  return me as ProductionUser;
}

export function isAssignedToProduction(project: ProjectAssignment, uid: string) {
  if (!project) return false;
  if (project.productionUid && project.productionUid === uid) return true;
  if (project.productionOwnerId && project.productionOwnerId === uid) return true;
  if (Array.isArray(project.assignedProductionIds) && project.assignedProductionIds.includes(uid))
    return true;
  return false;
}

export function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}
