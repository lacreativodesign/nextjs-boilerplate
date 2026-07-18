import fs from 'fs';
import path from 'path';
import { classifyRouteSource, AUTHENTICATED_ROUTES } from '@/lib/api/route-contract';

/**
 * ONB-02: server-persisted first-login tour completion.
 *
 * Tour completion used to live only in a device-wide localStorage flag, so a
 * completed tour re-triggered on every new device and one user's completion
 * suppressed the tour for another user on a shared device. The
 * /api/users/tour-state route now persists completion per user (keyed by tour
 * version) on the caller's own user document.
 *
 * These guards pin the route's contract so the persistence layer cannot
 * silently regress back to a client-only flag:
 *  - completion is written server-side on the users collection, not a tenant
 *    collection (per user, caller-identity scoped);
 *  - all three verbs (GET read, POST set, DELETE reset) exist;
 *  - the route classifies as an authenticated, non-tenant-scoped exception and
 *    is registered in AUTHENTICATED_ROUTES, keeping route-guard coverage green.
 */
const ROUTE_PATH = path.join(process.cwd(), 'app', 'api', 'users', 'tour-state', 'route.ts');
const ROUTE_REL = 'users/tour-state';

describe('ONB-02 server-persisted tour completion', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');

  it('exposes GET, POST and DELETE handlers for read/set/reset', () => {
    expect(/export\s+async\s+function\s+GET\b/.test(src)).toBe(true);
    expect(/export\s+async\s+function\s+POST\b/.test(src)).toBe(true);
    expect(/export\s+async\s+function\s+DELETE\b/.test(src)).toBe(true);
  });

  it('persists completion per user on the users collection, keyed by tour version', () => {
    expect(src).toContain("collection('users')");
    expect(src).toContain('tourCompletedVersion');
    // Completion is stored against a tour version so a future tour can re-trigger.
    expect(/TOUR_VERSION/.test(src)).toBe(true);
  });

  it('is caller-identity scoped: it acts on the current user, never a tenant collection', () => {
    expect(src).toContain('getCurrentUser');
    expect(src).toContain('me.uid');
    // A per-user route must not scope by tenantId, or it would misclassify as
    // tenant_scoped and defeat the point of following the user across devices.
    expect(src.includes('.tenantId')).toBe(false);
  });

  it('classifies as an authenticated (non-tenant-scoped) route', () => {
    expect(classifyRouteSource(ROUTE_REL, src)).toBe('authenticated');
  });

  it('is a reviewed AUTHENTICATED_ROUTES exception with a justification', () => {
    const justification = AUTHENTICATED_ROUTES[ROUTE_REL];
    expect(typeof justification).toBe('string');
    expect((justification || '').trim().length).toBeGreaterThan(0);
  });
});
