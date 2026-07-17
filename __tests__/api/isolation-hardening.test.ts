import { FirestoreEmulator } from './test-utils/firestore-emulator';
import { jsonRequest } from './test-utils/request';

/** clients/list reads req.nextUrl.searchParams, so it needs a NextRequest-shaped object. */
const nextGet = (url: string) => ({ nextUrl: new URL(url), url }) as never;

/**
 * S22 — Behavioural proof for the isolation boundaries added in S10, S16 and S19.
 *
 * Every test written alongside those fixes asserted on SOURCE STRINGS. That proves the code
 * was typed, not that it refuses an attacker. These execute the real route handlers against a
 * seeded two-tenant database, with the same attacker model as the existing negative suite: a
 * fully-authenticated user of tenant A presents a VALID id belonging to tenant B and must be
 * refused — and, where a write is involved, tenant B's data must be provably unchanged.
 *
 * Covered:
 *   - S10  /api/ai/tools/sales-write   AI writes need an APPROVED, tenant-scoped proposal.
 *          Previously the route took `input` straight from the body, executed the lead
 *          mutation, and only then stamped an audit trail against ANY taskId — with no tenant
 *          check at all.
 *   - S16  /api/admin/clients/list     A sales rep is scoped to the clients they own.
 *   - S19  /api/sales/leads/get        Tenant match AND sales ownership.
 */

let db: FirestoreEmulator;

// --- Principals: every one of these is a fully-authenticated tenant_a user ---------------
const salesRepA = {
  uid: 'sales_a',
  tenantId: 'tenant_a',
  role: 'sales',
  name: 'Rep A',
  email: 'rep-a@example.com',
};
const adminA = {
  uid: 'admin_a',
  tenantId: 'tenant_a',
  role: 'admin',
  name: 'Admin A',
  email: 'admin-a@example.com',
};

let currentUser: Record<string, unknown> = salesRepA;

jest.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => new Date('2025-01-01T00:00:00.000Z'),
      increment: (n: number) => n,
    },
  },
}));
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));
jest.mock('@/lib/tenant/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('@/lib/tenant/server', () => ({
  getCurrentUser: () => Promise.resolve(currentUser),
}));
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: () => Promise.resolve(currentUser),
}));
jest.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlan: () => Promise.resolve({ ok: true }),
  aiPlanLockedBody: () => ({ ok: false, error: 'locked' }),
}));
jest.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
jest.mock('@/lib/tenant', () => ({
  docTenantId: (data: Record<string, unknown>) => String(data?.tenantId || ''),
}));
jest.mock('@/app/api/sales/_utils', () => ({
  requireSalesRead: () =>
    Promise.resolve({ ok: true, user: currentUser, tenantId: currentUser.tenantId }),
  parseString: (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback,
  toISO: (value: unknown) => (value instanceof Date ? value.toISOString() : null),
}));

import { POST as salesWrite } from '@/app/api/ai/tools/sales-write/route';
import { GET as listClients } from '@/app/api/admin/clients/list/route';
import { GET as getLead } from '@/app/api/sales/leads/get/route';

beforeEach(() => {
  currentUser = salesRepA;

  db = new FirestoreEmulator({
    // Tenant B's agent task, carrying a PENDING proposal. A tenant_a caller who knows this
    // id must not be able to touch it.
    agent_tasks: [
      {
        id: 'task_b',
        data: {
          tenantId: 'tenant_b',
          status: 'awaiting_approval',
          proposedActions: [
            {
              id: 'action_b',
              toolName: 'update_lead_status',
              status: 'pending',
              input: { leadId: 'lead_b', stage: 'Qualified' },
            },
          ],
        },
      },
      // Tenant A's own task, already executed — an approved action may not be replayed.
      {
        id: 'task_a_done',
        data: {
          tenantId: 'tenant_a',
          status: 'completed',
          proposedActions: [
            {
              id: 'action_a_done',
              toolName: 'update_lead_status',
              status: 'executed',
              input: { leadId: 'lead_a', stage: 'Won' },
            },
          ],
        },
      },
    ],

    leads: [
      {
        id: 'lead_a',
        data: {
          tenantId: 'tenant_a',
          ownerId: 'sales_a',
          contactName: 'Real Lead A',
          isDeleted: false,
        },
      },
      // Same tenant, DIFFERENT rep — proves intra-tenant ownership, not just cross-tenant.
      {
        id: 'lead_a_other',
        data: {
          tenantId: 'tenant_a',
          ownerId: 'sales_a2',
          contactName: 'Colleague Lead',
          isDeleted: false,
        },
      },
      {
        id: 'lead_b',
        data: {
          tenantId: 'tenant_b',
          ownerId: 'sales_b',
          contactName: 'Lead B',
          isDeleted: false,
        },
      },
    ],

    clients: [
      {
        id: 'client_a_mine',
        data: {
          tenantId: 'tenant_a',
          salesOwner: 'Rep A',
          companyName: 'Mine',
          isDeleted: false,
          createdAt: new Date('2025-01-02'),
        },
      },
      {
        id: 'client_a_theirs',
        data: {
          tenantId: 'tenant_a',
          salesOwner: 'Someone Else',
          companyName: 'Colleague Client',
          isDeleted: false,
          createdAt: new Date('2025-01-03'),
        },
      },
      {
        id: 'client_b',
        data: {
          tenantId: 'tenant_b',
          salesOwner: 'Rep A',
          companyName: 'Other Tenant',
          isDeleted: false,
          createdAt: new Date('2025-01-04'),
        },
      },
    ],
  });
});

describe('S10: an AI write cannot escape its tenant or its approval', () => {
  it("tenant A cannot execute an action on tenant B's agent task", async () => {
    const res = await salesWrite(
      jsonRequest('https://app.local/api/ai/tools/sales-write', {
        action: 'update_lead_status',
        taskId: 'task_b',
        actionId: 'action_b',
        input: { leadId: 'lead_a', stage: 'Won' },
      }) as never,
    );

    expect(res.status).toBe(403);

    // Tenant B's proposal must be untouched — not executed, not rejected.
    const task = (await db.collection('agent_tasks').doc('task_b').get()).data() as any;
    expect(task.proposedActions[0].status).toBe('pending');
    expect(task.status).toBe('awaiting_approval');
  });

  it('an already-executed proposal cannot be replayed', async () => {
    const res = await salesWrite(
      jsonRequest('https://app.local/api/ai/tools/sales-write', {
        action: 'update_lead_status',
        taskId: 'task_a_done',
        actionId: 'action_a_done',
      }) as never,
    );

    expect(res.status).toBe(409);
  });

  it('a proposal the agent never made is refused', async () => {
    const res = await salesWrite(
      jsonRequest('https://app.local/api/ai/tools/sales-write', {
        action: 'update_lead_status',
        taskId: 'task_a_done',
        actionId: 'invented_action',
      }) as never,
    );

    expect(res.status).toBe(404);
  });
});

describe('S19: a lead is readable only by its tenant and its owner', () => {
  it("tenant A cannot read tenant B's lead", async () => {
    const res = await getLead(new Request('https://app.local/api/sales/leads/get?leadId=lead_b'));
    expect(res.status).toBe(403);
  });

  it("a sales rep cannot read a COLLEAGUE's lead inside their own tenant", async () => {
    const res = await getLead(
      new Request('https://app.local/api/sales/leads/get?leadId=lead_a_other'),
    );
    expect(res.status).toBe(403);
  });

  it('a sales rep can still read their own lead (the guard is not over-broad)', async () => {
    const res = await getLead(new Request('https://app.local/api/sales/leads/get?leadId=lead_a'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.lead.id).toBe('lead_a');
    expect(body.lead.contactName).toBe('Real Lead A');
  });
});

describe('S16: a sales rep sees only the clients they own', () => {
  it('a rep never sees a colleague’s client, nor another tenant’s', async () => {
    const res = await listClients(nextGet('https://app.local/api/admin/clients/list?limit=50'));
    expect(res.status).toBe(200);

    const body = await res.json();
    const ids = (body.clients || []).map((c: { id: string }) => c.id);

    expect(ids).toContain('client_a_mine');
    expect(ids).not.toContain('client_a_theirs');
    expect(ids).not.toContain('client_b');
  });

  it('an admin sees the whole tenant, but still never another tenant', async () => {
    currentUser = adminA;

    const res = await listClients(nextGet('https://app.local/api/admin/clients/list?limit=50'));
    expect(res.status).toBe(200);

    const body = await res.json();
    const ids = (body.clients || []).map((c: { id: string }) => c.id);

    expect(ids).toContain('client_a_mine');
    expect(ids).toContain('client_a_theirs');
    expect(ids).not.toContain('client_b');
  });
});
