import fs from 'fs';
import path from 'path';
import { REQUEST_TENANT_ROUTES, sourcesRequestTenant } from '@/lib/api/route-contract';

/**
 * Tenant-scope source guard (SEC rule #7).
 *
 * The core multi-tenant invariant: a route derives tenantId from the authenticated
 * session, NEVER from the spoofable request (body / query / [tenantId] path). This
 * guard scans the whole route surface for a request-sourced tenantId and fails the
 * build on any route that is not either:
 *   - super_admin/* (cross-tenant by design, gated by requireSuperAdmin), or
 *   - an entry in REQUEST_TENANT_ROUTES with a written justification.
 * New routes therefore cannot silently trust a caller-supplied tenantId.
 */

const API_ROOT = path.join(process.cwd(), 'app', 'api');

const HANDLER_RE =
  /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/;

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

function collectRoutes(): Array<{ rel: string; src: string }> {
  return walk(API_ROOT)
    .map((file) => {
      const src = fs.readFileSync(file, 'utf8');
      if (!HANDLER_RE.test(src)) return null;
      const rel = path
        .relative(API_ROOT, file)
        .replace(/\\/g, '/')
        .replace(/\/route\.ts$/, '');
      return { rel, src };
    })
    .filter((r): r is { rel: string; src: string } => r !== null);
}

describe('tenant-scope source guard (SEC rule #7)', () => {
  const routes = collectRoutes();

  it('collects the full route surface', () => {
    expect(routes.length).toBeGreaterThan(600);
  });

  it('every route sourcing a request tenantId is super_admin/* or a reviewed exception', () => {
    const offenders = routes
      .filter((r) => sourcesRequestTenant(r.rel, r.src))
      .map((r) => r.rel)
      .filter((rel) => !rel.startsWith('super_admin/') && !REQUEST_TENANT_ROUTES[rel]);

    if (offenders.length > 0) {
      throw new Error(
        'Route(s) read tenantId from the request without review. Derive tenantId ' +
          'from the session instead, or if this route legitimately needs a ' +
          'request-supplied tenantId, add it to REQUEST_TENANT_ROUTES in ' +
          'lib/api/route-contract.ts with a justification:\n' +
          offenders.map((v) => '  - ' + v).join('\n'),
      );
    }
    expect(offenders).toEqual([]);
  });

  it('the guard actually detects request-sourced tenantId (self-check)', () => {
    // Sanity: the detector must be live, not silently matching nothing.
    const flagged = routes.filter((r) => sourcesRequestTenant(r.rel, r.src));
    expect(flagged.length).toBeGreaterThan(5);
  });

  it('every REQUEST_TENANT_ROUTES entry has a non-empty justification', () => {
    const missing = Object.entries(REQUEST_TENANT_ROUTES)
      .filter(([, why]) => !why || !why.trim())
      .map(([route]) => route);
    expect(missing).toEqual([]);
  });

  it('REQUEST_TENANT_ROUTES has no stale entries for routes that no longer exist', () => {
    const existing = new Set(routes.map((r) => r.rel));
    const stale = Object.keys(REQUEST_TENANT_ROUTES).filter((route) => !existing.has(route));
    expect(stale).toEqual([]);
  });

  it('super_admin routes are not added to the exception list (they are exempt by design)', () => {
    const misplaced = Object.keys(REQUEST_TENANT_ROUTES).filter((r) =>
      r.startsWith('super_admin/'),
    );
    expect(misplaced).toEqual([]);
  });

  it('regression: admin/quotas is super_admin-gated before trusting body.tenantId', () => {
    const route = routes.find((r) => r.rel === 'admin/quotas');
    expect(route).toBeDefined();
    const src = route!.src;
    const gateIdx = src.indexOf('isSuperAdmin(');
    const bodyIdx = src.indexOf('body.tenantId');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(gateIdx);
  });

  it('regression: profit-loss report rejects a ?tenantId that differs from the session', () => {
    const route = routes.find((r) => r.rel === 'admin/finance/reports/profit-loss');
    expect(route).toBeDefined();
    expect(route!.src).toMatch(/requestedTenantId\s*!==\s*tenantId/);
  });
});
