import { FirestoreEmulator } from './test-utils/firestore-emulator';
import { jsonRequest } from './test-utils/request';

/**
 * F5 (SEC-01) — Recipient tenant-membership check on notification create.
 *
 * The admin create-notification route takes `userId` straight from the request body and
 * stamps the notification with the CALLER's tenantId. Before this gate it never verified
 * that the target user actually belonged to the caller's tenant, so an admin in tenant A
 * could address a notification to a valid user id in tenant B — a write-integrity gap
 * against the zero cross-tenant tolerance.
 *
 * The route now looks up users/{userId} and rejects (400) unless the recipient's tenantId
 * exactly equals the caller's. These assertions prove the negative path: a cross-tenant or
 * missing recipient is refused with nothing written, the stored tenantId is always the
 * caller's (never a client-supplied value), and a lookup failure surfaces as a 500 rather
 * than being silently swallowed into a "success".
 */

let db: FirestoreEmulator;

const adminMe = { uid: 'admin_a', tenantId: 'tenant_a', role: 'admin', email: 'a@example.com' };
const getCurrentUser = jest.fn(async () => adminMe);

jest.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => new Date('2025-01-01T00:00:00.000Z'),
    },
  },
}));
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
  isAdminRole: (role?: string | null) => role === 'admin',
}));

import { POST as createNotification } from '@/app/api/notifications/create/route';

const validBody = (over: Record<string, unknown> = {}) => ({
  userId: 'user_a',
  title: 'Hello',
  message: 'A message',
  ...over,
});

beforeEach(() => {
  getCurrentUser.mockClear();
  db = new FirestoreEmulator({
    users: [
      { id: 'user_a', data: { tenantId: 'tenant_a', role: 'sales' } },
      { id: 'user_b', data: { tenantId: 'tenant_b', role: 'sales' } },
    ],
    notifications: [],
  });
});

const countNotifications = () => db.getCollectionDocs('notifications').length;

describe('F5: recipient must belong to the caller tenant', () => {
  it('refuses a recipient that belongs to another tenant and writes nothing', async () => {
    const res = await createNotification(
      jsonRequest('https://app.local/api/notifications/create', validBody({ userId: 'user_b' })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(countNotifications()).toBe(0);
  });

  it('refuses a recipient that does not exist at all', async () => {
    const res = await createNotification(
      jsonRequest('https://app.local/api/notifications/create', validBody({ userId: 'ghost' })),
    );
    expect(res.status).toBe(400);
    expect(countNotifications()).toBe(0);
  });

  it("stores the caller's tenantId and ignores any client-supplied tenantId", async () => {
    const res = await createNotification(
      jsonRequest(
        'https://app.local/api/notifications/create',
        // A client trying to smuggle in a foreign tenantId must have no effect.
        validBody({ tenantId: 'tenant_b' }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const stored = db.getDoc('notifications', body.id) as any;
    expect(stored).toBeTruthy();
    expect(stored.tenantId).toBe('tenant_a');
    expect(stored.tenantId).not.toBe('tenant_b');
    expect(stored.userId).toBe('user_a');
  });

  it('surfaces a lookup failure as a 500 rather than swallowing it into a success', async () => {
    jest.spyOn(db, 'getDoc').mockImplementation(() => {
      throw new Error('firestore unavailable');
    });
    const res = await createNotification(
      jsonRequest('https://app.local/api/notifications/create', validBody()),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(countNotifications()).toBe(0);
  });
});
