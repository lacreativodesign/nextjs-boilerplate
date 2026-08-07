import fs from 'fs';
import path from 'path';
import { rolesAllowedForApi } from '@/lib/erpAccess';
import { classifyRouteSource } from '@/lib/api/route-contract';

/**
 * F-2 regression guard.
 *
 * /api/import/* and /api/export/* move entire entity collections — clients, invoices,
 * products, employees, projects, tasks, time_entries — in and out of a tenant. Both
 * namespaces fell outside the middleware role map, so the route handler was the only
 * authorization layer, and these handlers only proved that a session existed.
 *
 * That made bulk egress and bulk overwrite reachable by every role, including `client`,
 * which belongs to the tenant's own external customers. /api/import/execute had already
 * been hardened; its three sibling routes and the whole export namespace had not — the
 * fix had been applied to one route and not to the pattern.
 *
 * These tests pin the rule at both layers, and pin it for EVERY route in both
 * namespaces so a newly added sibling cannot ship unguarded again.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const listRoutes = (dir: string): string[] => {
  const abs = path.join(process.cwd(), dir);
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.name === 'route.ts') out.push(path.relative(process.cwd(), next));
    }
  };
  walk(abs);
  return out.sort();
};

const BULK_ROUTES = [...listRoutes('app/api/import'), ...listRoutes('app/api/export')];

/** Guards that restrict a route to admin/super_admin. */
const ADMIN_GUARDS = ['requireBulkDataAccess', 'requireAdminOrSuperAdmin', 'isAdminOrSuper'];

describe('F-2: every bulk import/export route is admin-gated', () => {
  it('discovers the full namespace so a new sibling cannot be missed', () => {
    expect(BULK_ROUTES.length).toBeGreaterThanOrEqual(9);
    expect(BULK_ROUTES).toContain('app/api/import/execute/route.ts');
    expect(BULK_ROUTES).toContain(path.join('app', 'api', 'export', '[entity]', 'route.ts'));
  });

  it.each(BULK_ROUTES)('%s enforces an admin-class guard', (rel) => {
    const src = read(rel);
    const guarded = ADMIN_GUARDS.some((guard) => src.includes(guard));
    expect(guarded).toBe(true);
  });

  it.each(BULK_ROUTES)('%s never authorizes on session existence alone', (rel) => {
    const src = read(rel);
    // The old shape: prove a session exists, then act. It is the exact pattern that
    // let every role through, so it must not reappear in this namespace.
    expect(src).not.toContain(
      "if (!me?.tenantId) return NextResponse.json({ error: 'Unauthorized' }",
    );
  });

  it.each(BULK_ROUTES)('%s is tenant scoped by contract', (rel) => {
    const relKey = rel
      .replace(/^app[\\/]+api[\\/]+/, '')
      .replace(/[\\/]+route\.ts$/, '')
      .split(path.sep)
      .join('/');
    expect(classifyRouteSource(relKey, read(rel))).toBe('tenant_scoped');
  });
});

describe('F-2: the middleware role map covers both namespaces', () => {
  it('restricts /api/import/* to admin and super_admin', () => {
    expect(rolesAllowedForApi('/api/import/upload')).toEqual(['admin', 'super_admin']);
    expect(rolesAllowedForApi('/api/import/process')).toEqual(['admin', 'super_admin']);
    expect(rolesAllowedForApi('/api/import/jobs/abc/errors')).toEqual(['admin', 'super_admin']);
  });

  it('restricts /api/export/* to admin and super_admin', () => {
    expect(rolesAllowedForApi('/api/export/invoices')).toEqual(['admin', 'super_admin']);
    expect(rolesAllowedForApi('/api/export/jobs/abc/download')).toEqual(['admin', 'super_admin']);
  });

  it('excludes the client role from both namespaces', () => {
    for (const route of ['/api/import/upload', '/api/export/employees']) {
      expect(rolesAllowedForApi(route)).not.toContain('client');
    }
  });

  it('no longer falls through to null for bulk data paths', () => {
    for (const route of ['/api/import/validate', '/api/export/clients']) {
      expect(rolesAllowedForApi(route)).not.toBeNull();
    }
  });
});
