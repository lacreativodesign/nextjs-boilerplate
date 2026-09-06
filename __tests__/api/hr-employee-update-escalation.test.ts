import { FirestoreEmulator } from './test-utils/firestore-emulator';
import { jsonRequest } from './test-utils/request';

/**
 * Behavioural proof for the two tenant HR escalation paths closed after merged PR #997.
 *
 * The tests written alongside that fix asserted on SOURCE STRINGS. That proves the code
 * was typed, not that it refuses an attacker — and a source-string assertion passes again
 * the moment someone reintroduces the same hole with different formatting. These execute
 * the real route handlers against a seeded two-tenant database and assert on the response
 * AND on the resulting user document, so a regression has to actually stop being
 * exploitable to make them pass.
 *
 * The security logic under test is NOT mocked: `assertPermission` / the real permission
 * matrix, `ERP_ROLES` and `resolveTenantRoles` / `isRoleEnabled` all run for real. Only
 * the side-effect collaborators (claim sync, seat ledger, audit/HR events) are replaced,
 * and those are asserted on directly.
 *
 * Defect A — app/api/hr/employees/update accepted `super_admin` from the one actor that
 *            satisfied its role check, writing the platform role into the user document
 *            and synchronising it into Firebase custom claims.
 * Defect B — app/api/admin/hr/employees/update was a divergent duplicate with no
 *            ManageRoles assertion, so an HR actor (ManageUsers only) could promote
 *            itself to admin. Application authorization reads the role from the user
 *            document, so that was a live privilege escalation.
 */

let db: FirestoreEmulator;
let currentUser: Record<string, unknown>;

const syncUserClaims = jest.fn();
const reserveStaffSeat = jest.fn();
const releaseStaffSeat = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));
jest.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
jest.mock('@/app/api/admin/_utils', () => ({
  ...jest.requireActual('@/app/api/admin/_utils'),
  getCurrentUser: () => Promise.resolve(currentUser),
}));
jest.mock('@/app/api/hr/_utils', () => ({
  ...jest.requireActual('@/app/api/hr/_utils'),
  createHrEvent: jest.fn(),
  createHrNotification: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/auth/sync-user-claims', () => ({
  syncUserClaims: (...args: unknown[]) => syncUserClaims(...args),
}));
jest.mock('@/lib/billing/seat-reservation', () => ({
  reserveStaffSeat: (...args: unknown[]) => reserveStaffSeat(...args),
  releaseStaffSeat: (...args: unknown[]) => releaseStaffSeat(...args),
}));
jest.mock('@/lib/billing/user-limit', () => ({
  planLimitResponseBody: () => ({ ok: false, error: 'plan limit' }),
}));

import { POST as canonicalUpdate } from '@/app/api/hr/employees/update/route';
import { POST as legacyAdminUpdate } from '@/app/api/admin/hr/employees/update/route';

// --- Principals -------------------------------------------------------------------------
/** ManageUsers only — the matrix gives `hr` no ManageRoles. */
const hrA = { uid: 'hr_a', tenantId: 'tenant_a', role: 'hr', name: 'HR A', email: 'hr@a.test' };
const adminA = {
  uid: 'admin_a',
  tenantId: 'tenant_a',
  role: 'admin',
  name: 'Admin A',
  email: 'admin@a.test',
};
/** A platform Super Admin is still refused the platform role on a TENANT surface. */
const platformSuper = {
  uid: 'super_1',
  tenantId: 'tenant_a',
  role: 'super_admin',
  name: 'Platform',
  email: 'super@a.test',
};

const profile = (over: Record<string, unknown> = {}) => ({
  name: 'Employee A',
  department: 'sales',
  ...over,
});

const userDoc = (id: string) => db.getDoc('users', id) as Record<string, unknown>;

const post = (
  handler: (req: Request) => Promise<Response>,
  body: Record<string, unknown>,
  url = 'http://localhost/api/hr/employees/update',
) => handler(jsonRequest(url, body));

beforeEach(() => {
  currentUser = hrA;
  syncUserClaims.mockReset();
  reserveStaffSeat.mockReset().mockResolvedValue({ ok: true, id: 'seat_1' });
  releaseStaffSeat.mockReset();

  db = new FirestoreEmulator({
    users: [
      {
        id: 'emp_a',
        data: {
          tenantId: 'tenant_a',
          role: 'sales',
          name: 'Employee A',
          email: 'emp@a.test',
          department: 'sales',
          status: 'active',
        },
      },
      {
        id: 'hr_a',
        data: {
          tenantId: 'tenant_a',
          role: 'hr',
          name: 'HR A',
          email: 'hr@a.test',
          department: 'hr',
          status: 'active',
        },
      },
      {
        id: 'client_a',
        data: {
          tenantId: 'tenant_a',
          role: 'client',
          name: 'Client A',
          email: 'client@a.test',
          department: 'sales',
          status: 'active',
        },
      },
      {
        id: 'super_1',
        data: {
          tenantId: 'tenant_a',
          role: 'super_admin',
          name: 'Platform',
          email: 'super@a.test',
          department: 'admin',
          status: 'active',
        },
      },
      // Another tenant entirely — a valid uid the tenant_a actor must not reach.
      {
        id: 'emp_b',
        data: {
          tenantId: 'tenant_b',
          role: 'sales',
          name: 'Employee B',
          email: 'emp@b.test',
          department: 'sales',
          status: 'active',
        },
      },
    ],
    tenants: [
      {
        id: 'tenant_a',
        // Explicit map: `finance` is omitted, so the allow-list must fail it closed.
        data: { rolesEnabled: { admin: true, sales: true, hr: true, client: true } },
      },
      { id: 'tenant_b', data: { rolesEnabled: { admin: true, sales: true } } },
    ],
  });
});

describe('Defect A — a tenant HR route is never a platform-role promotion surface', () => {
  it('refuses super_admin from an HR actor and leaves the document untouched', async () => {
    const res = await post(canonicalUpdate, {
      uid: 'emp_a',
      role: 'super_admin',
      ...profile(),
    });

    expect(res.status).toBe(403);
    expect(userDoc('emp_a').role).toBe('sales');
    expect(syncUserClaims).not.toHaveBeenCalled();
  });

  it('refuses super_admin even when the actor IS a platform Super Admin', async () => {
    // This is the exact hole: the old guard only fired for a NON-super_admin requester,
    // so the one actor able to reach the route could mint the platform role here.
    currentUser = platformSuper;

    const res = await post(canonicalUpdate, {
      uid: 'emp_a',
      role: 'super_admin',
      ...profile(),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(
      expect.objectContaining({ error: expect.stringMatching(/platform administration/i) }),
    );
    expect(userDoc('emp_a').role).toBe('sales');
    expect(syncUserClaims).not.toHaveBeenCalled();
  });

  it('refuses super_admin through the legacy admin alias as well', async () => {
    currentUser = platformSuper;

    const res = await post(
      legacyAdminUpdate,
      { uid: 'emp_a', role: 'super_admin', ...profile() },
      'http://localhost/api/admin/hr/employees/update',
    );

    expect(res.status).toBe(403);
    expect(userDoc('emp_a').role).toBe('sales');
    expect(syncUserClaims).not.toHaveBeenCalled();
  });

  it('cannot be evaded by casing or separator variants of the platform role', async () => {
    currentUser = platformSuper;

    for (const variant of ['SUPER_ADMIN', 'super-admin', 'Super_Admin', ' super_admin']) {
      const res = await post(canonicalUpdate, { uid: 'emp_a', role: variant, ...profile() });

      // Either the platform-role refusal (403) or the canonical vocabulary check (400).
      // Both are closed; what must never happen is a write.
      expect([400, 403]).toContain(res.status);
      expect(userDoc('emp_a').role).toBe('sales');
      expect(syncUserClaims).not.toHaveBeenCalled();
    }
  });
});

describe('Defect B — the legacy admin alias inherits canonical authorization', () => {
  it('refuses an HR actor promoting THEMSELVES to admin', async () => {
    // hr holds ManageUsers but not ManageRoles. Before the fix this alias asserted no
    // permission at all and wrote the role straight from the body.
    const res = await post(
      legacyAdminUpdate,
      { uid: 'hr_a', role: 'admin', name: 'HR A', department: 'hr' },
      'http://localhost/api/admin/hr/employees/update',
    );

    expect(res.status).toBe(403);
    expect(userDoc('hr_a').role).toBe('hr');
    expect(syncUserClaims).not.toHaveBeenCalled();
  });

  it('refuses an HR actor promoting ANOTHER user to admin', async () => {
    const res = await post(
      legacyAdminUpdate,
      { uid: 'emp_a', role: 'admin', ...profile() },
      'http://localhost/api/admin/hr/employees/update',
    );

    expect(res.status).toBe(403);
    expect(userDoc('emp_a').role).toBe('sales');
    expect(syncUserClaims).not.toHaveBeenCalled();
  });

  it('still lets an authorized admin change a tenant role, and syncs the claim', async () => {
    currentUser = adminA;

    const res = await post(
      legacyAdminUpdate,
      { uid: 'emp_a', role: 'admin', ...profile({ department: 'admin' }) },
      'http://localhost/api/admin/hr/employees/update',
    );

    expect(res.status).toBe(200);
    expect(userDoc('emp_a').role).toBe('admin');
    expect(syncUserClaims).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'emp_a', role: 'admin', tenantId: 'tenant_a' }),
    );
  });

  it('rejects an arbitrary role that is not in the canonical vocabulary', async () => {
    currentUser = adminA;

    const res = await post(legacyAdminUpdate, {
      uid: 'emp_a',
      role: 'wizard',
      ...profile(),
    });

    expect(res.status).toBe(400);
    expect(userDoc('emp_a').role).toBe('sales');
  });

  it('enforces the tenant rolesEnabled allow-list', async () => {
    currentUser = adminA;

    // `finance` is a real ERP role but is not enabled for tenant_a.
    const res = await post(legacyAdminUpdate, {
      uid: 'emp_a',
      role: 'finance',
      ...profile({ department: 'finance' }),
    });

    expect(res.status).toBe(400);
    expect(userDoc('emp_a').role).toBe('sales');
    expect(syncUserClaims).not.toHaveBeenCalled();
  });

  it('refuses a status change from the profile surface, keeping the IAM path authoritative', async () => {
    currentUser = adminA;

    const res = await post(legacyAdminUpdate, {
      uid: 'emp_a',
      status: 'inactive',
      ...profile(),
    });

    // Deactivation must go through the dedicated endpoint, where Firebase Auth is
    // disabled, sessions are revoked and reactivation re-checks the seat ceiling.
    expect(res.status).toBe(409);
    expect(userDoc('emp_a').status).toBe('active');
  });

  it('keeps tenant isolation — a tenant_a actor cannot reach a tenant_b employee', async () => {
    const res = await post(legacyAdminUpdate, { uid: 'emp_b', ...profile() });

    expect(res.status).toBe(404);
    expect(userDoc('emp_b').name).toBe('Employee B');
  });
});

describe('ordinary profile editing is preserved', () => {
  it('updates a profile when the role is omitted, without touching the role', async () => {
    const res = await post(canonicalUpdate, {
      uid: 'emp_a',
      name: 'Employee A Renamed',
      department: 'sales',
      phone: '555',
    });

    expect(res.status).toBe(200);
    expect(userDoc('emp_a').name).toBe('Employee A Renamed');
    expect(userDoc('emp_a').role).toBe('sales');
    expect(syncUserClaims).not.toHaveBeenCalled();
  });

  it('does not corrupt an existing platform identity on an unrelated profile edit', async () => {
    currentUser = platformSuper;

    const res = await post(canonicalUpdate, {
      uid: 'super_1',
      name: 'Platform Renamed',
      department: 'admin',
    });

    expect(res.status).toBe(200);
    expect(userDoc('super_1').name).toBe('Platform Renamed');
    // The stored platform role survives an edit that simply omits `role`.
    expect(userDoc('super_1').role).toBe('super_admin');
    expect(syncUserClaims).not.toHaveBeenCalled();
  });

  it('still reserves a staff seat when a client is converted to staff', async () => {
    currentUser = adminA;

    const res = await post(canonicalUpdate, {
      uid: 'client_a',
      role: 'sales',
      ...profile({ name: 'Client A' }),
    });

    expect(res.status).toBe(200);
    expect(reserveStaffSeat).toHaveBeenCalledWith('tenant_a', 'sales', 'role_conversion');
    expect(releaseStaffSeat).toHaveBeenCalled();
  });

  it('refuses the conversion when the tenant has no seat left', async () => {
    currentUser = adminA;
    reserveStaffSeat.mockResolvedValue({ ok: false, used: 10, limit: 10 });

    const res = await post(canonicalUpdate, {
      uid: 'client_a',
      role: 'sales',
      ...profile({ name: 'Client A' }),
    });

    expect(res.status).toBe(403);
    expect(userDoc('client_a').role).toBe('client');
  });
});
