import { FirestoreEmulator } from '@/__tests__/api/test-utils/firestore-emulator';

let db: FirestoreEmulator;
const getUser = jest.fn();
const getUserByEmail = jest.fn();
const createUser = jest.fn();
const setCustomUserClaims = jest.fn();
const checkUserLimit = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
  adminAuth: {
    getUser: (...args: unknown[]) => getUser(...args),
    getUserByEmail: (...args: unknown[]) => getUserByEmail(...args),
    createUser: (...args: unknown[]) => createUser(...args),
    setCustomUserClaims: (...args: unknown[]) => setCustomUserClaims(...args),
  },
}));

jest.mock('@/lib/billing/user-limit', () => ({
  checkUserLimit: (...args: unknown[]) => checkUserLimit(...args),
  planLimitResponseBody: (result: { plan: string; limit: number; used: number }) => ({
    error: 'plan_limit_exceeded',
    message: `Your ${result.plan} plan allows ${result.limit}; ${result.used} are in use.`,
  }),
}));

import { ensureTenantClientIdentity } from '@/lib/client-identity';

beforeEach(() => {
  jest.clearAllMocks();
  db = new FirestoreEmulator({
    clients: [
      {
        id: 'client-a',
        data: {
          tenantId: 'tenant-a',
          primaryContactEmail: 'owner@example.com',
          primaryContactName: 'Owner',
          companyName: 'Example Co',
        },
      },
    ],
  });
  getUser.mockRejectedValue(new Error('not found'));
  getUserByEmail.mockRejectedValue(new Error('not found'));
  createUser.mockResolvedValue({ uid: 'uid-a', customClaims: {} });
  setCustomUserClaims.mockResolvedValue(undefined);
  checkUserLimit.mockResolvedValue({
    ok: true,
    plan: 'starter',
    limit: 10,
    used: 0,
    seatType: 'client_portal',
  });
});

describe('tenant-bound client portal identity', () => {
  it('rejects a client document from another tenant before touching Auth', async () => {
    await expect(
      ensureTenantClientIdentity({
        tenantId: 'tenant-b',
        clientId: 'client-a',
      }),
    ).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND', status: 404 });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects an email-matched Auth identity bound to another tenant', async () => {
    getUserByEmail.mockResolvedValue({ uid: 'uid-existing', customClaims: {} });
    await db.collection('users').doc('uid-existing').set({
      tenantId: 'tenant-b',
      clientId: 'client-b',
      role: 'client',
    });

    await expect(
      ensureTenantClientIdentity({ tenantId: 'tenant-a', clientId: 'client-a' }),
    ).rejects.toMatchObject({ code: 'AUTH_IDENTITY_OWNERSHIP_MISMATCH', status: 409 });
    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('writes tenant/client claims and Firestore ownership for a new portal identity', async () => {
    const result = await ensureTenantClientIdentity({
      tenantId: 'tenant-a',
      clientId: 'client-a',
    });

    expect(result).toEqual({ uid: 'uid-a', email: 'owner@example.com', created: true });
    expect(checkUserLimit).toHaveBeenCalledWith('tenant-a', 'client');
    expect(setCustomUserClaims).toHaveBeenCalledWith('uid-a', {
      tenantId: 'tenant-a',
      role: 'client',
      clientId: 'client-a',
    });
    expect(db.getDoc('users', 'uid-a')).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-a',
        clientId: 'client-a',
        role: 'client',
      }),
    );
    expect(db.getDoc('clients', 'client-a')).toEqual(
      expect.objectContaining({ tenantId: 'tenant-a', portalUserUid: 'uid-a' }),
    );
  });

  it('fails closed when the Starter client-portal seat allowance is full', async () => {
    checkUserLimit.mockResolvedValue({
      ok: false,
      plan: 'starter',
      limit: 10,
      used: 10,
      seatType: 'client_portal',
    });

    await expect(
      ensureTenantClientIdentity({ tenantId: 'tenant-a', clientId: 'client-a' }),
    ).rejects.toMatchObject({ code: 'plan_limit_exceeded', status: 403 });
    expect(createUser).not.toHaveBeenCalled();
  });
});
