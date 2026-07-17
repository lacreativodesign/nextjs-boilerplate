import fs from 'fs';
import path from 'path';
import {
  classifyRouteSource,
  PUBLIC_ROUTES,
  AUTHENTICATED_ROUTES,
  type RouteContract,
} from '@/lib/api/route-contract';

/**
 * Route contract gate (P0-5).
 *
 * Every app/api route file that exports ANY handler — reads (GET/HEAD) as well
 * as mutations (POST/PUT/PATCH/DELETE) — must classify into exactly one
 * contract in lib/api/route-contract.ts. Unclassifiable routes fail the build.
 *
 * The classifier also enforces per-contract evidence:
 * - cron/* paths must verify CRON_SECRET / x-vercel-cron
 * - webhook-named routes must verify a provider signature
 * - super_admin/* paths must call requireSuperAdmin
 * - public routes must be individually reviewed and justified in PUBLIC_ROUTES
 *
 * If you add a route that legitimately needs to be public, add it to
 * PUBLIC_ROUTES with a justification in the same PR.
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

function collectRoutes(): Array<{ rel: string; contract: RouteContract | null }> {
  return walk(API_ROOT)
    .map((file) => {
      const src = fs.readFileSync(file, 'utf8');
      if (!HANDLER_RE.test(src)) return null;
      const rel = path
        .relative(API_ROOT, file)
        .replace(/\\/g, '/')
        .replace(/\/route\.ts$/, '');
      return { rel, contract: classifyRouteSource(rel, src) };
    })
    .filter((r): r is { rel: string; contract: RouteContract | null } => r !== null);
}

describe('route contract coverage (P0-5)', () => {
  const routes = collectRoutes();

  it('covers the full route surface', () => {
    // Guards against the walker silently breaking: the repo has 600+ routes.
    expect(routes.length).toBeGreaterThan(600);
  });

  it('every route (including GET) has a contract', () => {
    const unclassified = routes.filter((r) => r.contract === null).map((r) => r.rel);
    if (unclassified.length > 0) {
      throw new Error(
        'Unclassified route(s) found. Add an auth guard, or if intentionally ' +
          'public, add to PUBLIC_ROUTES in lib/api/route-contract.ts with a ' +
          'justification:\n' +
          unclassified.map((v) => '  - ' + v).join('\n'),
      );
    }
    expect(unclassified).toEqual([]);
  });

  it('every cron route verifies the cron secret', () => {
    const bad = routes.filter((r) => r.rel.startsWith('cron/') && r.contract !== 'cron');
    expect(bad.map((r) => r.rel)).toEqual([]);
  });

  it('every super_admin route is classified super_admin (requireSuperAdmin present)', () => {
    const bad = routes.filter(
      (r) => r.rel.startsWith('super_admin/') && r.contract !== 'super_admin',
    );
    expect(bad.map((r) => r.rel)).toEqual([]);
  });

  it('webhook-named routes verify signatures or are deprecated 410 stubs', () => {
    const stubs = new Set(['webhooks/stripe', 'payments/webhooks', 'billing/webhook']);
    const bad = routes.filter(
      (r) =>
        /(^|\/)webhooks?(\/|$)|-webhook(\/|$)/.test(r.rel) &&
        !stubs.has(r.rel) &&
        r.contract !== 'webhook' &&
        // Nested tool routes under webhooks/subscriptions manage subscription
        // records behind user auth; they are not inbound webhook receivers.
        r.contract !== 'tenant_scoped' &&
        r.contract !== 'authenticated',
    );
    expect(bad.map((r) => r.rel)).toEqual([]);
  });

  it('every PUBLIC_ROUTES entry has a non-empty justification', () => {
    const missing = Object.entries(PUBLIC_ROUTES)
      .filter(([, why]) => !why || !why.trim())
      .map(([route]) => route);
    expect(missing).toEqual([]);
  });

  it('PUBLIC_ROUTES has no stale entries for routes that no longer exist', () => {
    const existing = new Set(routes.map((r) => r.rel));
    const stale = Object.keys(PUBLIC_ROUTES).filter((route) => !existing.has(route));
    expect(stale).toEqual([]);
  });

  it('the public surface does not silently grow', () => {
    const publicCount = routes.filter((r) => r.contract === 'public').length;
    // Update this number ONLY when a new public route has been reviewed and
    // justified in PUBLIC_ROUTES in the same PR.
    expect(publicCount).toBeLessThanOrEqual(Object.keys(PUBLIC_ROUTES).length);
  });

  it('stripe/checkout is tenant_scoped, not public (E5a)', () => {
    // Regression pin: stripe/checkout calls requireAdminOrSuperAdmin and reads
    // auth.user.tenantId. It must never be labelled public — that would hide the
    // auth requirement and let anyone create checkout sessions.
    expect(PUBLIC_ROUTES['stripe/checkout']).toBeUndefined();
    const checkout = routes.find((r) => r.rel === 'stripe/checkout');
    expect(checkout).toBeDefined();
    expect(checkout?.contract).toBe('tenant_scoped');
  });

  it('every authenticated route is a reviewed non-tenant-scoped exception (E5b)', () => {
    // A route behind user auth that does not scope by tenantId is a suspected
    // missing-tenant-scope. Each must be individually reviewed and justified in
    // AUTHENTICATED_ROUTES; anything else fails the build so new routes cannot
    // silently ship without tenant scoping.
    const unreviewed = routes
      .filter((r) => r.contract === 'authenticated')
      .map((r) => r.rel)
      .filter((rel) => !AUTHENTICATED_ROUTES[rel]);
    if (unreviewed.length > 0) {
      throw new Error(
        'Authenticated route(s) with no tenant scoping and no reviewed exception. ' +
          'Add tenant scoping, or if the route is legitimately tenant-agnostic add ' +
          'it to AUTHENTICATED_ROUTES in lib/api/route-contract.ts with a justification:\n' +
          unreviewed.map((v) => '  - ' + v).join('\n'),
      );
    }
    expect(unreviewed).toEqual([]);
  });

  it('every AUTHENTICATED_ROUTES entry has a non-empty justification', () => {
    const missing = Object.entries(AUTHENTICATED_ROUTES)
      .filter(([, why]) => !why || !why.trim())
      .map(([route]) => route);
    expect(missing).toEqual([]);
  });

  it('AUTHENTICATED_ROUTES has no stale entries for routes that no longer exist', () => {
    const existing = new Set(routes.map((r) => r.rel));
    const stale = Object.keys(AUTHENTICATED_ROUTES).filter((route) => !existing.has(route));
    expect(stale).toEqual([]);
  });
});
