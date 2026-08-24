/**
 * E4c — FM-14: recurring-invoice cron is deferred/disabled at launch.
 *
 * The generate-invoices cron writes to the tenant subcollection
 * tenants/{id}/invoices, which no reader (Finance, AR, revenue, public pay page)
 * consults — it would silently create orphaned invoices. Until it is migrated to
 * the top-level `invoices` collection it must no-op unless explicitly enabled via
 * ERP_ENABLE_RECURRING_INVOICES=true. These tests prove the guard.
 */

const CRON_SECRET = '12345678901234567890123456789012';

const listCalls: string[] = [];

// jest.mock factories are hoisted above imports; set the secret here so the
// route module captures it at load time (it reads process.env.CRON_SECRET into
// a module-level const at import).
jest.mock('@/lib/firebaseAdmin', () => {
  process.env.CRON_SECRET = '12345678901234567890123456789012';
  return {
    adminDb: {
      collection(name: string) {
        listCalls.push(name);
        return {
          get: async () => ({ docs: [] }),
          doc: () => ({
            collection: () => ({
              where: () => ({ get: async () => ({ docs: [] }) }),
              get: async () => ({ docs: [] }),
            }),
          }),
        };
      },
    },
  };
});
jest.mock('resend', () => ({ Resend: class {} }));
jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => new Date() } },
}));

import { GET } from '@/app/api/cron/generate-invoices/route';

const authedRequest = () =>
  ({
    headers: { get: (h: string) => (h === 'authorization' ? `Bearer ${CRON_SECRET}` : null) },
  }) as any;

const originalEnv = { ...process.env };

beforeEach(() => {
  listCalls.length = 0;
  process.env.CRON_SECRET = CRON_SECRET;
});
afterEach(() => {
  process.env = { ...originalEnv };
  process.env.CRON_SECRET = CRON_SECRET;
});

describe('generate-invoices cron is deferred by default (E4c / FM-14)', () => {
  it('rejects unauthorized callers regardless of the flag', async () => {
    process.env.ERP_ENABLE_RECURRING_INVOICES = 'true';
    const res = await GET({ headers: { get: () => 'Bearer wrong' } } as any);
    expect(res.status).toBe(401);
  });

  it('no-ops (skipped:true) and touches no collections when the flag is unset', async () => {
    delete process.env.ERP_ENABLE_RECURRING_INVOICES;
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(listCalls).toHaveLength(0);
  });

  it('no-ops when the flag is any value other than the literal "true"', async () => {
    process.env.ERP_ENABLE_RECURRING_INVOICES = '1';
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(listCalls).toHaveLength(0);
  });

  it('proceeds past the guard (scans tenants) only when the flag is exactly "true"', async () => {
    process.env.ERP_ENABLE_RECURRING_INVOICES = 'true';
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBeUndefined();
    expect(listCalls).toContain('tenants');
  });
});
