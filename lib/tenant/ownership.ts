import { DEFAULT_TENANT_ID } from '@/lib/tenant/constants';

/**
 * Canonical direct-document tenant ownership gate (P0-1).
 *
 * Any route that loads a Firestore document by a REQUEST-SUPPLIED id and then
 * mutates it must prove the document belongs to the authenticated caller's
 * tenant before the first side effect. Without this, an authenticated admin of
 * tenant A can mutate tenant B's records simply by guessing/learning a doc id.
 *
 * Rules encoded here:
 *  - Fail closed: an empty/unknown caller tenant NEVER matches anything.
 *  - Legacy documents written before multi-tenancy carry no `tenantId` and
 *    belong to the default tenant. This mirrors `docTenantId()` in lib/tenant.ts
 *    and `queryWithTenant()` in lib/tenant/query.ts, so behaviour for existing
 *    data is unchanged.
 *  - super_admin bypass is explicit and opt-in per call site, never implicit.
 */

const SUPER_ADMIN_ROLE = 'super_admin';

function normalizeRoleValue(role?: string | null): string {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

export function isSuperAdminRole(role?: string | null): boolean {
  return normalizeRoleValue(role) === SUPER_ADMIN_ROLE;
}

/** Tenant a document belongs to. Missing tenantId => default tenant (legacy data). */
export function documentTenantId(data: unknown): string {
  const raw = (data as { tenantId?: unknown } | null | undefined)?.tenantId;
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value || DEFAULT_TENANT_ID;
}

export function isTenantOwned(params: {
  data: unknown;
  callerTenantId?: string | null;
  callerRole?: string | null;
  /** Defaults to true. Pass false for internal helpers that have no role context. */
  allowSuperAdmin?: boolean;
}): boolean {
  const { data, callerTenantId, callerRole, allowSuperAdmin = true } = params;
  if (data === null || data === undefined) return false;
  if (allowSuperAdmin && isSuperAdminRole(callerRole)) return true;

  const caller = String(callerTenantId || '').trim();
  if (!caller) return false;

  return documentTenantId(data) === caller;
}
