import * as fs from 'fs';
import * as path from 'path';
import { ROLE_DASHBOARD_ROUTE } from '@/lib/erpAccess';

/**
 * F3.5 — server-side protection for shared authenticated shells (AUTH-01).
 *
 * Six shells — /settings, /users, /activity, /onboarding, /search, /help — are not owned by any
 * single role, so roleFromPath returns null for them. The middleware's login-redirect and
 * subscription checks were gated on pageRole being truthy, so they were skipped for these pages:
 * a direct URL hit was stopped only by the client-side RequireAuth guard. This session folds a
 * PROTECTED_PAGE_PREFIXES concept into both gates and registers the prefixes in the matcher —
 * WITHOUT giving them a role owner, so signed-in roles are never wrongly bounced to /unauthorized.
 *
 * This test pins that contract against the middleware source (no server, no network) so it runs
 * in the normal jest suite.
 */

const MIDDLEWARE = fs.readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8');

const PROTECTED_PREFIXES = ['/settings', '/users', '/activity', '/onboarding', '/search', '/help'];

describe('F3.5: shared authenticated shells are protected server-side (AUTH-01)', () => {
  it('declares every protected shell prefix in PROTECTED_PAGE_PREFIXES', () => {
    const block = MIDDLEWARE.match(/const PROTECTED_PAGE_PREFIXES = \[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const declared = Array.from(block![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    for (const prefix of PROTECTED_PREFIXES) {
      expect(declared).toContain(prefix);
    }
  });

  it('folds isProtectedPage into the login-redirect gate', () => {
    expect(MIDDLEWARE).toContain(
      'if ((pageRole || isApiRequest || isProtectedPage) && !sessionToken) {',
    );
  });

  it('folds isProtectedPage into the subscription-check condition', () => {
    expect(MIDDLEWARE).toContain('(Boolean(pageRole) || isApiRequest || isProtectedPage) &&');
  });

  it('registers each protected prefix in the matcher (bare + /:path*)', () => {
    const config = MIDDLEWARE.match(/matcher:\s*\[([\s\S]*?)\]/);
    expect(config).not.toBeNull();
    const entries = Array.from(config![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    for (const prefix of PROTECTED_PREFIXES) {
      expect(entries).toContain(prefix);
      expect(entries).toContain(`${prefix}/:path*`);
    }
  });

  it('never gives a protected shell a role owner (would wrongly bounce to /unauthorized)', () => {
    const ownedRoutes = new Set<string>(Object.values(ROLE_DASHBOARD_ROUTE));
    for (const prefix of PROTECTED_PREFIXES) {
      expect(ownedRoutes.has(prefix)).toBe(false);
    }
  });
});
