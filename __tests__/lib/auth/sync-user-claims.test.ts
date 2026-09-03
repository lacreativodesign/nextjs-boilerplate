import fs from 'fs';
import path from 'path';

/**
 * SOC2 CC6.2 — a role change must reach Firebase Auth, not just Firestore.
 *
 * Bizosto enforces authorization in two places:
 *
 *   API routes    -> read `role` from the Firestore user document
 *   Firestore rules -> read the custom CLAIM
 *
 * `admin/users/update` wrote the document and stopped. After a demotion the two
 * layers disagreed until someone remembered to run `/api/super_admin/repair-claims`
 * by hand — and a control that depends on an operator remembering a repair job is not
 * a control.
 *
 * Setting the claim alone would not have been enough either. A Firebase session
 * cookie embeds the claims it was minted with, and this app issues cookies lasting
 * one to fourteen days (`app/api/session-login/route.ts`). `setCustomUserClaims` does
 * not reach into an issued cookie. `revokeRefreshTokens` does, because
 * `lib/tenant/server.ts` verifies with `verifySessionCookie(cookie, true)` and that
 * second argument makes revocation bite on the next request.
 */

const getUser = jest.fn();
const setCustomUserClaims = jest.fn();
const revokeRefreshTokens = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: {
    getUser: (...args: unknown[]) => getUser(...args),
    setCustomUserClaims: (...args: unknown[]) => setCustomUserClaims(...args),
    revokeRefreshTokens: (...args: unknown[]) => revokeRefreshTokens(...args),
  },
}));

import { syncUserClaims } from '@/lib/auth/sync-user-claims';

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ customClaims: {} });
});

describe('syncUserClaims', () => {
  it('writes role and tenantId together', () => {
    // A claim carrying a role without a tenant is what repair-claims exists to clean.
    return syncUserClaims({ uid: 'user_1', role: 'sales', tenantId: 'tenant_a' }).then(() => {
      expect(setCustomUserClaims).toHaveBeenCalledWith('user_1', {
        role: 'sales',
        tenantId: 'tenant_a',
      });
    });
  });

  it('preserves claims another feature may have added', async () => {
    getUser.mockResolvedValue({ customClaims: { mfaEnrolled: true, role: 'admin' } });

    await syncUserClaims({ uid: 'user_1', role: 'sales', tenantId: 'tenant_a' });

    expect(setCustomUserClaims).toHaveBeenCalledWith('user_1', {
      mfaEnrolled: true,
      role: 'sales',
      tenantId: 'tenant_a',
    });
  });

  it('ends live sessions when asked, so a demotion takes effect immediately', async () => {
    await syncUserClaims({
      uid: 'user_1',
      role: 'sales',
      tenantId: 'tenant_a',
      endSessions: true,
    });

    expect(revokeRefreshTokens).toHaveBeenCalledWith('user_1');
  });

  it('leaves sessions alone by default, so a profile edit does not sign anyone out', async () => {
    await syncUserClaims({ uid: 'user_1', role: 'sales', tenantId: 'tenant_a' });

    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('does nothing without a uid or a role rather than writing a partial claim', async () => {
    await syncUserClaims({ uid: '', role: 'sales', tenantId: 'tenant_a' });
    await syncUserClaims({ uid: 'user_1', role: '', tenantId: 'tenant_a' });

    expect(setCustomUserClaims).not.toHaveBeenCalled();
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });
});

describe('the update route propagates a role change', () => {
  const rel = 'app/api/admin/users/update/route.ts';
  const source = () => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('calls syncUserClaims and ends sessions', () => {
    expect(source()).toContain('syncUserClaims({');
    expect(source()).toContain('endSessions: true');
  });

  it('only does so when the role actually changed', () => {
    // Revoking on every profile edit would sign users out for a phone-number change.
    const text = source();
    const guardAt = text.indexOf('if (requestedRole && role !== existingRole) {');
    const syncAt = text.indexOf('await syncUserClaims({');

    expect(guardAt).toBeGreaterThan(-1);
    expect(syncAt).toBeGreaterThan(guardAt);
  });

  it('syncs after the Firestore write, never before it', () => {
    // Revoking a session for a change that then failed to persist would sign someone
    // out for nothing.
    const text = source();
    const writeAt = text.indexOf("await adminDb.collection('users').doc(uid).update(updateData);");
    const syncAt = text.indexOf('await syncUserClaims({');

    expect(writeAt).toBeGreaterThan(-1);
    expect(syncAt).toBeGreaterThan(writeAt);
  });
});
