import { getCurrentUser, isAccountManager } from '../admin/_utils';
import { checkModuleAccess } from '@/app/lib/plan-enforcement';

export type AMUser = {
  uid: string;
  role: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  [key: string]: any;
};

export async function getAmUser(): Promise<AMUser | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!isAccountManager(me.role)) return null;
  // P-1: account management is gated by the `sales` module, matching PATH_TO_MODULE
  // where both /am and /am_manager map to 'sales'. Returns null on denial for the
  // same reason as getProductionUser — see the note there.
  const planAccess = await checkModuleAccess(me.tenantId, 'sales', me.role);
  if (!planAccess.ok) return null;
  return me as AMUser;
}

export function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function isOwnedByAm(
  project: {
    ownerAmUid?: string | null;
    ownerId?: string | null;
    amId?: string | null;
    createdByUid?: string | null;
  },
  uid: string,
) {
  if (!project) return false;
  if (project.ownerAmUid && project.ownerAmUid === uid) return true;
  if (project.ownerId && project.ownerId === uid) return true;
  if (project.amId && project.amId === uid) return true;
  return false;
}
