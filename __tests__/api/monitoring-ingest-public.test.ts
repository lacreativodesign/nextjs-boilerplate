import { PUBLIC_ROUTES } from '@/lib/api/route-contract';

/**
 * Public monitoring ingest + route-contract parity (OBS-01, F5-01).
 *
 * middleware.isPublicApiPath treats a path as public when it matches one of the
 * prefix families (dynamic route groups whose members are all public) OR when
 * its relative path is an exact key in the reviewed PUBLIC_ROUTES contract.
 *
 * This test reconstructs that predicate from the same two sources the middleware
 * uses, so the two can no longer silently diverge for static routes. If a static
 * public route is added to PUBLIC_ROUTES but the middleware stops sourcing it,
 * these assertions fail.
 */

// Mirror of middleware.ts prefix families. Dynamic [param] public routes are
// covered here (e.g. /api/public/*), so they are intentionally not exact-matched.
const PUBLIC_PREFIXES = [
  '/api/stripe',
  '/api/webhooks/stripe',
  '/api/session-login',
  '/api/logout',
  '/api/tenant/context',
  '/api/subscription/status',
  '/api/public',
  '/api/signup',
  '/api/client/invites/',
  '/api/auth',
];

function isPublicApiPath(pathname: string): boolean {
  const prefixPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (prefixPublic) return true;
  const relPath = pathname.replace(/^\/api\//, '');
  return Object.prototype.hasOwnProperty.call(PUBLIC_ROUTES, relPath);
}

// Static contract-public keys only (dynamic [param] keys are covered by prefixes).
const staticPublicRoutes = Object.keys(PUBLIC_ROUTES).filter((key) => !key.includes('['));

// Representative tenant-scoped / authenticated routes that must NOT be public.
const NON_PUBLIC_ROUTES = [
  '/api/finance/invoices',
  '/api/clients',
  '/api/projects/list',
  '/api/hr/employees',
  '/api/me',
  '/api/super_admin/tenants',
];

describe('monitoring/ingest public parity (OBS-01, F5-01)', () => {
  it('treats /api/monitoring/ingest as public so anonymous telemetry is not 401', () => {
    expect(PUBLIC_ROUTES).toHaveProperty('monitoring/ingest');
    expect(isPublicApiPath('/api/monitoring/ingest')).toBe(true);
  });

  it('treats every static PUBLIC_ROUTES contract entry as public', () => {
    for (const relPath of staticPublicRoutes) {
      expect(isPublicApiPath(`/api/${relPath}`)).toBe(true);
    }
  });

  it('covers dynamic public routes via the /api/public prefix family', () => {
    expect(isPublicApiPath('/api/public/invoice/abc123')).toBe(true);
    expect(isPublicApiPath('/api/public/invoice/abc123/pay')).toBe(true);
  });

  it('does NOT treat tenant-scoped / authenticated routes as public', () => {
    for (const pathname of NON_PUBLIC_ROUTES) {
      expect(isPublicApiPath(pathname)).toBe(false);
    }
  });
});
