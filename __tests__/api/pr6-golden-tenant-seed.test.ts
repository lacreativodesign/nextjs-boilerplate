jest.mock('@/lib/firebaseAdmin', () => {
  const { createInMemoryFirestore } = jest.requireActual('./test-utils/in-memory-firestore');
  const firestore = createInMemoryFirestore();
  const authUsers = new Map<string, { uid: string; email: string }>();

  const adminAuth = {
    createUser: jest.fn(async ({ email }: { email: string }) => {
      if (authUsers.has(email)) {
        const error = new Error('exists') as Error & { code?: string };
        error.code = 'auth/email-already-exists';
        throw error;
      }
      const uid = `uid_${email.replace(/[^a-z0-9]/gi, '_')}`;
      const user = { uid, email };
      authUsers.set(email, user);
      return user;
    }),
    getUserByEmail: jest.fn(async (email: string) => {
      const existing = authUsers.get(email);
      if (!existing) throw new Error(`missing auth user ${email}`);
      return existing;
    }),
    updateUser: jest.fn(async () => undefined),
    setCustomUserClaims: jest.fn(async () => undefined),
  };

  return {
    adminDb: firestore.adminDb,
    adminAuth,
    __goldenTestState: { firestore, authUsers, adminAuth },
  };
});

import {
  assertGoldenTenant,
  assertIntendedFirebaseProject,
  DEMO_TENANT_ID,
  DEMO_USERS,
  requireDemoPassword,
  resetDemoTenantData,
  seedDemoEnvironment,
  seedDemoTenant,
} from '@/lib/demo/seed';

const firebaseMock = jest.requireMock('@/lib/firebaseAdmin') as {
  __goldenTestState: {
    firestore: {
      read(collection: string, id: string): Record<string, unknown> | undefined;
      all(collection: string): Array<[string, Record<string, unknown>]>;
      seed(collection: string, id: string, data: Record<string, unknown>): void;
      reset(): void;
    };
    authUsers: Map<string, { uid: string; email: string }>;
    adminAuth: {
      createUser: jest.Mock;
      getUserByEmail: jest.Mock;
      updateUser: jest.Mock;
      setCustomUserClaims: jest.Mock;
    };
  };
};

const state = firebaseMock.__goldenTestState;

beforeEach(() => {
  state.firestore.reset();
  state.authUsers.clear();
  jest.clearAllMocks();
});

describe('PR6 golden tenant seed', () => {
  it('carries exactly the ten approved tenant roles', () => {
    expect(DEMO_USERS.map((user) => user.role)).toEqual([
      'admin',
      'sales',
      'sales_manager',
      'am',
      'am_manager',
      'production',
      'production_manager',
      'finance',
      'hr',
      'client',
    ]);
  });

  it('fails closed when the demo password is missing or weak', () => {
    expect(() => requireDemoPassword({})).toThrow(/E2E_DEMO_PASSWORD/);
    expect(() => requireDemoPassword({ E2E_DEMO_PASSWORD: 'too-short' })).toThrow(/at least 16/);
    expect(requireDemoPassword({ E2E_DEMO_PASSWORD: 'a-secure-test-password' })).toBe(
      'a-secure-test-password',
    );
  });

  it('seeds a canonical, linked revenue-to-delivery fixture', async () => {
    const result = await seedDemoTenant({
      tenantId: DEMO_TENANT_ID,
      password: 'a-secure-test-password',
    });

    expect(result.counts).toMatchObject({
      clients: 5,
      leads: 5,
      deals: 1,
      invoices: 4,
      projects: 3,
      productionJobs: 3,
      employees: 4,
    });
    expect(result.users).toHaveLength(DEMO_USERS.length);

    const client = state.firestore.read('clients', 'demo-client-techvision');
    expect(client).toMatchObject({
      tenantId: DEMO_TENANT_ID,
      companyName: 'TechVision Inc',
      primaryContactEmail: 'demo_client@bizosto.com',
      salesOwner: 'Sam Sales',
      accountManager: 'Adam Account',
    });

    const clientAuth = state.authUsers.get('demo_client@bizosto.com');
    expect(clientAuth).toBeDefined();
    const clientUser = state.firestore.read('users', clientAuth!.uid);
    expect(clientUser).toMatchObject({
      tenantId: DEMO_TENANT_ID,
      role: 'client',
      clientId: 'demo-client-techvision',
      status: 'active',
    });

    expect(state.firestore.read('leads', 'demo-lead-apex')).toMatchObject({
      company: 'Apex Digital',
      createdBy: expect.stringContaining('demo_sales_bizosto_com'),
    });
    expect(state.firestore.read('deals', 'demo-deal-techvision')).toMatchObject({
      title: 'TechVision Brand Refresh Deal',
      isDeleted: false,
    });
    expect(state.firestore.read('projects', 'demo-project-techvision')).toMatchObject({
      projectName: 'TechVision Brand Refresh',
      clientId: 'demo-client-techvision',
      isDeleted: false,
    });
    expect(state.firestore.read('invoices', 'demo-invoice-0001')).toMatchObject({
      orderId: 'INV-0001',
      clientId: 'demo-client-techvision',
      status: 'paid',
      isDeleted: false,
    });
    expect(state.firestore.read('notifications', 'demo-notification-client')).toMatchObject({
      toUserId: clientAuth!.uid,
      userId: clientAuth!.uid,
    });
  });

  it('is idempotent and rotates existing auth accounts instead of duplicating them', async () => {
    await seedDemoTenant({ password: 'a-secure-test-password' });
    await seedDemoTenant({ password: 'a-different-test-password' });

    expect(state.authUsers.size).toBe(DEMO_USERS.length);
    expect(state.firestore.all('clients')).toHaveLength(5);
    expect(state.firestore.all('deals')).toHaveLength(1);
    expect(state.firestore.all('projects')).toHaveLength(3);
    expect(state.firestore.all('invoices')).toHaveLength(4);
    expect(state.adminAuth.updateUser).toHaveBeenCalledTimes(DEMO_USERS.length);
  });

  it('reset deletes only the demo tenant data and preserves another tenant', async () => {
    await seedDemoTenant({ password: 'a-secure-test-password' });
    state.firestore.seed('clients', 'other-client', {
      tenantId: 'other-tenant',
      companyName: 'Other Tenant Client',
    });

    await resetDemoTenantData(DEMO_TENANT_ID);

    for (const collection of [
      'clients',
      'leads',
      'deals',
      'projects',
      'invoices',
      'employees',
      'production_jobs',
      'notifications',
      'auditLogs',
    ]) {
      expect(
        state.firestore.all(collection).filter(([, data]) => data.tenantId === DEMO_TENANT_ID),
      ).toHaveLength(0);
    }
    expect(state.firestore.read('clients', 'other-client')).toMatchObject({
      tenantId: 'other-tenant',
    });
    expect(state.firestore.read('tenants', DEMO_TENANT_ID)).toBeDefined();
  });

  /**
   * PR6 is what made the reset actually delete. Before it, `resetDemoTenantData` wrote
   * nothing, so the seeder's tenant argument was inert and an arbitrary value cost
   * nothing. Now the same argument selects nine collections' worth of documents to
   * delete, in a Firebase project that also holds real tenants — so the argument itself
   * has to be bounded, and bounded at the functions that delete rather than at whichever
   * callers happen to pass a constant today.
   */
  describe('destructive rebuilds are bounded to the golden tenant', () => {
    it('refuses to reset any tenant but bizosto-demo', async () => {
      state.firestore.seed('clients', 'live-client', {
        tenantId: 'bizosto',
        companyName: 'A Real Customer',
      });

      await expect(resetDemoTenantData('bizosto')).rejects.toThrow(/only tenant/i);
      await expect(seedDemoEnvironment({ tenantId: 'bizosto', reset: true })).rejects.toThrow(
        /only tenant/i,
      );

      // The point of the bound: the other tenant still has its data.
      expect(state.firestore.read('clients', 'live-client')).toMatchObject({
        tenantId: 'bizosto',
      });
    });

    it('refuses to seed any tenant but bizosto-demo', async () => {
      await expect(
        seedDemoTenant({ tenantId: 'bizosto', password: 'a-secure-test-password' }),
      ).rejects.toThrow(/only tenant/i);
      expect(state.adminAuth.createUser).not.toHaveBeenCalled();
    });

    it('accepts the golden tenant and rejects near misses', () => {
      expect(assertGoldenTenant(DEMO_TENANT_ID)).toBe(DEMO_TENANT_ID);
      expect(() => assertGoldenTenant('')).toThrow(/only tenant/i);
      expect(() => assertGoldenTenant('bizosto-demo-2')).toThrow(/only tenant/i);
    });
  });

  /**
   * The other half of the bound: which PROJECT the rebuild lands in. The tenant id is a
   * constant, but the Firebase project is whatever service account the environment
   * happens to carry, and a demo tenant seeded into the wrong project fails the gate in a
   * way that looks exactly like a stale password.
   */
  describe('destructive rebuilds are bounded to the named Firebase project', () => {
    const key = (projectId: string) => JSON.stringify({ project_id: projectId });

    it('accepts credentials that match the named project', () => {
      expect(
        assertIntendedFirebaseProject({
          DEMO_FIREBASE_PROJECT_ID: 'la-creativo-erp',
          FIREBASE_ADMIN_KEY: key('la-creativo-erp'),
        }),
      ).toBe('la-creativo-erp');
    });

    it('refuses when the credentials point at a different project', () => {
      expect(() =>
        assertIntendedFirebaseProject({
          DEMO_FIREBASE_PROJECT_ID: 'bizosto-test',
          FIREBASE_ADMIN_KEY: key('la-creativo-erp'),
        }),
      ).toThrow(/targets Firebase project "la-creativo-erp"/);
    });

    it('fails closed when the project is unnamed or unverifiable', () => {
      expect(() => assertIntendedFirebaseProject({ FIREBASE_ADMIN_KEY: key('x') })).toThrow(
        /DEMO_FIREBASE_PROJECT_ID must name/,
      );
      expect(() =>
        assertIntendedFirebaseProject({
          DEMO_FIREBASE_PROJECT_ID: 'x',
          FIREBASE_ADMIN_KEY: 'not json',
        }),
      ).toThrow(/not valid JSON/);
      expect(() => assertIntendedFirebaseProject({ DEMO_FIREBASE_PROJECT_ID: 'x' })).toThrow(
        /no project_id/,
      );
    });
  });
});
