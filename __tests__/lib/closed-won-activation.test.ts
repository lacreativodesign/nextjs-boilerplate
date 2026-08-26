import { FirestoreEmulator } from '@/__tests__/api/test-utils/firestore-emulator';

let db: FirestoreEmulator;
const queueClientActivationInvite = jest.fn();
const logEvent = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));
jest.mock('@/lib/clientActivation', () => ({
  queueClientActivationInvite: (...args: unknown[]) => queueClientActivationInvite(...args),
}));
jest.mock('@/lib/audit', () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
}));
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: jest.fn(),
  normalizeRole: (value: string) => value,
}));
jest.mock('@/app/lib/plan-enforcement', () => ({
  checkModuleAccess: jest.fn(),
}));

import { createClientFromClosedWonDeal } from '@/lib/crm';

beforeEach(() => {
  jest.clearAllMocks();
  queueClientActivationInvite.mockResolvedValue({ ok: true, created: true });
  logEvent.mockResolvedValue(undefined);
  db = new FirestoreEmulator({
    tenants: [{ id: 'tenant-a', data: { name: 'Tenant A', operatingCurrency: 'USD' } }],
    leads: [
      {
        id: 'lead-a',
        data: {
          tenantId: 'tenant-a',
          name: 'Client Owner',
          email: 'owner@example.com',
          company: 'Client Co',
        },
      },
    ],
    deals: [
      {
        id: 'deal-a',
        data: {
          tenantId: 'tenant-a',
          leadId: 'lead-a',
          stage: 'Closed Won',
          status: 'Won',
          dealName: 'Website redesign',
          valueUsd: 12_000,
          discountPct: 20,
          discountStatus: 'auto_approved',
        },
      },
    ],
  });
});

describe('Closed Won activation', () => {
  it('creates tenant-scoped client, project and draft invoice exactly once', async () => {
    const first = await createClientFromClosedWonDeal({
      dealId: 'deal-a',
      actor: { uid: 'sales-a', name: 'Sales A', tenantId: 'tenant-a' },
    });
    const second = await createClientFromClosedWonDeal({
      dealId: 'deal-a',
      actor: { uid: 'sales-a', name: 'Sales A', tenantId: 'tenant-a' },
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.clientId).toBe(first.clientId);
    expect(second.projectId).toBe(first.projectId);
    expect(second.invoiceId).toBe(first.invoiceId);
    expect(db.getCollectionDocs('clients')).toHaveLength(1);
    expect(db.getCollectionDocs('projects')).toHaveLength(1);
    expect(db.getCollectionDocs('invoices')).toHaveLength(1);
    expect(db.getDoc('clients', first.clientId)).toEqual(
      expect.objectContaining({ tenantId: 'tenant-a', primaryContactEmail: 'owner@example.com' }),
    );
    expect(db.getDoc('projects', first.projectId)).toEqual(
      expect.objectContaining({ tenantId: 'tenant-a', deliveryStatus: 'Not Started' }),
    );
    expect(db.getDoc('invoices', String(first.invoiceId))).toEqual(
      expect.objectContaining({ tenantId: 'tenant-a', currency: 'USD', status: 'draft' }),
    );
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-tenant activation actor', async () => {
    await expect(
      createClientFromClosedWonDeal({
        dealId: 'deal-a',
        actor: { uid: 'sales-b', tenantId: 'tenant-b' },
      }),
    ).rejects.toThrow('Forbidden');
    expect(db.getCollectionDocs('clients')).toHaveLength(0);
  });

  it('requires manager approval above the locked 20 percent threshold', async () => {
    await db.collection('deals').doc('deal-a').set(
      {
        tenantId: 'tenant-a',
        leadId: 'lead-a',
        stage: 'Closed Won',
        status: 'Won',
        valueUsd: 10_000,
        discountPct: 21,
        discountApproved: false,
        discountStatus: 'pending',
      },
      { merge: false },
    );

    await expect(
      createClientFromClosedWonDeal({
        dealId: 'deal-a',
        actor: { uid: 'sales-a', tenantId: 'tenant-a' },
      }),
    ).rejects.toThrow('Discount approval');
  });
});
