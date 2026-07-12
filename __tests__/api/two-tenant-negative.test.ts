import { FirestoreEmulator } from './test-utils/firestore-emulator';
import { jsonRequest } from './test-utils/request';

/**
 * E8 — Two-tenant negative suite.
 *
 * Admin SDK bypasses Firestore rules, so tenant isolation lives entirely in the
 * API routes. Existing isolation tests covered finance (recurring/budgets), one
 * sales deal and one HR document. This suite covers the remaining high-risk
 * surfaces with an explicit attacker model: a fully-authenticated user of
 * tenant A presents a VALID id belonging to tenant B and must be refused.
 *
 * The client-portal case additionally proves *intra*-tenant isolation: a client
 * of tenant A cannot read another client's project inside the same tenant.
 */

let db: FirestoreEmulator;

// --- Auth guards (each returns a tenant_a principal) -----------------------
const crmUser = {
  uid: 'crm_a',
  tenantId: 'tenant_a',
  role: 'sales_manager',
  email: 'crm-a@example.com',
};
const requireCrmUser = jest.fn(async () => ({
  ok: true as const,
  user: crmUser,
  tenantId: 'tenant_a',
}));

const adminMe = { uid: 'admin_a', tenantId: 'tenant_a', role: 'admin', email: 'a@example.com' };
const getCurrentUser = jest.fn(async () => adminMe);

const clientAuth = {
  ok: true as const,
  user: { uid: 'client_a1', tenantId: 'tenant_a', role: 'client', email: 'c1@example.com' },
  clientId: 'client_1',
  tenantId: 'tenant_a',
};
const requireClient = jest.fn(async () => clientAuth);

jest.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => new Date('2025-01-01T00:00:00.000Z'),
      arrayUnion: (...args: unknown[]) => args,
    },
  },
}));
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));
jest.mock('@/lib/audit', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/logging', () => ({ logError: jest.fn() }));

jest.mock('@/lib/crm', () => ({
  requireCrmUser: () => requireCrmUser(),
  canManageOwnDeals: () => false,
  toIso: (v: unknown) => (v ? String(v) : null),
}));
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => getCurrentUser(),
}));
jest.mock('@/app/api/notifications/_utils', () => ({
  requireNotificationsModule: jest.fn(async () => ({ ok: true as const })),
}));
jest.mock('@/lib/notifications/notification-service', () => ({
  NotificationService: { markAsRead: jest.fn() },
}));
jest.mock('@/app/api/client/_utils', () => ({
  requireClient: () => requireClient(),
  toISO: (v: unknown) => (v ? String(v) : null),
}));

import { GET as getDeal, PATCH as patchDeal } from '@/app/api/crm/deals/[id]/route';
import { GET as getProject } from '@/app/api/projects/[id]/route';
import { POST as markNotificationRead } from '@/app/api/notifications/[id]/read/route';
import { GET as getClientProject } from '@/app/api/client/projects/get/route';

beforeEach(() => {
  db = new FirestoreEmulator({
    deals: [
      { id: 'deal_a', data: { tenantId: 'tenant_a', ownerId: 'crm_a', stage: 'new', value: 10 } },
      { id: 'deal_b', data: { tenantId: 'tenant_b', ownerId: 'crm_b', stage: 'new', value: 99 } },
    ],
    projects: [
      {
        id: 'proj_a',
        data: { tenantId: 'tenant_a', clientId: 'client_1', projectName: 'A', isDeleted: false },
      },
      {
        id: 'proj_a2',
        data: { tenantId: 'tenant_a', clientId: 'client_2', projectName: 'A2', isDeleted: false },
      },
      {
        id: 'proj_b',
        data: { tenantId: 'tenant_b', clientId: 'client_9', projectName: 'B', isDeleted: false },
      },
    ],
    notifications: [
      { id: 'notif_a', data: { tenantId: 'tenant_a', userId: 'admin_a', read: false } },
      { id: 'notif_b', data: { tenantId: 'tenant_b', userId: 'admin_b', read: false } },
      // Same tenant, different user — must still be refused.
      { id: 'notif_a_other', data: { tenantId: 'tenant_a', userId: 'someone_else', read: false } },
    ],
    files: [],
  });
});

describe('E8: CRM deals — cross-tenant read/write refused', () => {
  it("tenant A cannot READ tenant B's deal", async () => {
    const res = await getDeal(new Request('https://app.local'), { params: { id: 'deal_b' } });
    expect(res.status).toBe(403);
  });

  it("tenant A cannot WRITE tenant B's deal, and the deal is unmodified", async () => {
    const res = await patchDeal(
      jsonRequest('https://app.local/api/crm/deals/deal_b', { stage: 'won' }),
      { params: { id: 'deal_b' } },
    );
    expect(res.status).toBe(403);

    const deal = (await db.collection('deals').doc('deal_b').get()).data() as any;
    expect(deal.stage).toBe('new');
    expect(deal.value).toBe(99);
  });

  it('tenant A can still read its OWN deal (guard is not over-broad)', async () => {
    const res = await getDeal(new Request('https://app.local'), { params: { id: 'deal_a' } });
    expect(res.status).toBe(200);
  });
});

describe('E8: Projects — cross-tenant read refused', () => {
  it("tenant A cannot READ tenant B's project", async () => {
    const res = await getProject(new Request('https://app.local'), { params: { id: 'proj_b' } });
    expect(res.status).toBe(403);
  });

  it('tenant A can read its own project', async () => {
    const res = await getProject(new Request('https://app.local'), { params: { id: 'proj_a' } });
    expect(res.status).toBe(200);
  });
});

describe('E8: Notifications — cross-tenant and cross-user refused', () => {
  const req = () => jsonRequest('https://app.local/api/notifications/x/read', {}) as any;

  it("tenant A cannot mark tenant B's notification read", async () => {
    const res = await markNotificationRead(req(), { params: { id: 'notif_b' } });
    expect(res.status).toBe(403);
  });

  it("a user cannot mark ANOTHER user's notification read inside their own tenant", async () => {
    const res = await markNotificationRead(req(), { params: { id: 'notif_a_other' } });
    expect(res.status).toBe(403);
  });

  it('a user can mark their own notification read', async () => {
    const res = await markNotificationRead(req(), { params: { id: 'notif_a' } });
    expect(res.status).toBe(200);
  });
});

describe('E8: Client portal — cross-tenant AND cross-client refused', () => {
  const reqFor = (id: string) =>
    ({
      nextUrl: { searchParams: new URLSearchParams({ id }) },
    }) as any;

  it("a client of tenant A cannot read tenant B's project", async () => {
    const res = await getClientProject(reqFor('proj_b'));
    expect(res.status).toBe(403);
  });

  it("a client cannot read ANOTHER client's project in the same tenant", async () => {
    // proj_a2 belongs to tenant_a but to client_2, not the caller (client_1).
    const res = await getClientProject(reqFor('proj_a2'));
    expect(res.status).toBe(403);
  });

  it('a client can read their own project', async () => {
    const res = await getClientProject(reqFor('proj_a'));
    expect(res.status).toBe(200);
  });
});
