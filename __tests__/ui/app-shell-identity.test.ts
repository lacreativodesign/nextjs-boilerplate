import fs from 'fs';
import path from 'path';
import { getNavigationForRole } from '@/lib/navigation/sidebarConfig';
import { getRoleRoute } from '@/lib/roleRouting';

/**
 * P1-1 — the application shell has exactly one source of identity, and no fallback.
 *
 * AppShell used to build `currentUser.role` from three sources in priority order:
 *   1. /api/tenant/context             (server truth, Admin SDK)
 *   2. window.localStorage             (browser-writable)
 *   3. the literal string 'admin'      (a guess)
 *
 * It also ran its own Firebase auth listener and its own Firestore read of users/{uid},
 * duplicating work RequireAuth had already done, so every authenticated page paid for two
 * auth initialisations and two identity reads before first paint.
 *
 * Page authorisation is unaffected by this change — that is RequireAuth's responsibility and
 * it verifies independently. What changes is that the shell no longer infers privilege it has
 * not been told about.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const SHELL = 'components/layout/AppShell.tsx';

describe('P1-1: the shell never infers a role it was not given', () => {
  const src = read(SHELL);

  it('has no admin fallback', () => {
    expect(src).not.toContain("|| 'admin'");
  });

  it('derives the role only from the server-resolved tenant context', () => {
    // The one source is the server tenant context; an unrecognised role coerces to '' (the
    // empty role every consumer degrades on), never to a guessed 'admin'.
    expect(src).toContain("role: normalizeRole(data?.user?.role || '') || '',");
  });

  it('does not read or write a role in browser storage', () => {
    // Asserts on the API call, not the word: the header comment names what was removed.
    expect(src).not.toContain('window.localStorage');
    expect(src).not.toContain('bizosto_role');
  });
});

describe('P1-1: the shell no longer duplicates the identity fetch', () => {
  const src = read(SHELL);

  it('runs no Firebase auth listener of its own', () => {
    expect(src).not.toContain('onAuthStateChanged');
    expect(src).not.toContain('getFirebaseAuth');
  });

  it('performs no second Firestore read of the user document', () => {
    expect(src).not.toContain('fetchUserRole');
  });

  it('still consumes the shared, cached tenant context', () => {
    expect(src).toContain('useTenantContext');
  });
});

describe('P1-1: every consumer degrades safely when the role is unknown', () => {
  it('an unknown role produces no navigation rather than admin navigation', () => {
    expect(getNavigationForRole('')).toEqual([]);
  });

  it('an unknown role has no dashboard home, so the product tour cannot fire', () => {
    expect(getRoleRoute('')).toBe('/login');
    expect(getRoleRoute(null)).toBe('/login');
  });

  it('a known role still resolves normally', () => {
    expect(getNavigationForRole('finance').length).toBeGreaterThan(0);
    expect(getRoleRoute('finance')).not.toBe('/login');
  });

  it('the header renders a neutral label for an unknown role', () => {
    const header = read('components/layout/Header.tsx');
    expect(header).toContain("if (!normalized) return 'User';");
  });
});

describe('P1-1: page authorisation is untouched', () => {
  it('RequireAuth still verifies the role independently of the shell', () => {
    const src = read('components/RequireAuth.tsx');
    expect(src).toContain('allowedRoles.includes(role)');
    expect(src).toContain('/api/tenant/context');
  });

  it('no browser-storage role is trusted anywhere in the layout or guard', () => {
    for (const rel of [SHELL, 'components/RequireAuth.tsx']) {
      expect(read(rel)).not.toContain('bizosto_role');
    }
  });
});
