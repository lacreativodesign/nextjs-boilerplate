import { getCurrentUser, isAdminOrSuper, type CurrentUser } from '@/app/api/admin/_utils';

/**
 * Authorization guard for bulk data movement (F-2).
 *
 * The /api/import/* and /api/export/* namespaces move entire entity collections —
 * clients, invoices, products, employees, projects, tasks and time entries — in and
 * out of a tenant in one request. They are also outside the middleware role map
 * (`rolesAllowedForApi` returned null for them), so the route handler was the only
 * authorization layer, and these routes only proved that a session existed.
 *
 * That made bulk egress and bulk overwrite reachable by EVERY role, including the
 * `client` role, which belongs to the tenant's own external customers. A client
 * portal user could export the tenant's full employee roster, or import records
 * that overwrite its financial data.
 *
 * Bulk data movement is an administrative operation. This guard is the single place
 * that decides who may perform it, so the rule cannot drift between the two
 * namespaces the way it did when /api/import/execute was hardened and its three
 * sibling routes were not.
 */
export type BulkDataAuthOk = {
  ok: true;
  user: CurrentUser;
  tenantId: string;
};

export type BulkDataAuthDenied = {
  ok: false;
  status: number;
  error: string;
};

// Named members, never a bare inline union: a short union here sits in the 80-100
// column range where Prettier collapses at one printWidth and expands at another.
export type BulkDataAuth = BulkDataAuthOk | BulkDataAuthDenied;

export async function requireBulkDataAccess(): Promise<BulkDataAuth> {
  const me = await getCurrentUser();
  if (!me?.tenantId) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  if (!isAdminOrSuper(me.role)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, user: me, tenantId: me.tenantId };
}
