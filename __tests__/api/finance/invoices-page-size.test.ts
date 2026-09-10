import { FirestoreEmulator } from '../test-utils/firestore-emulator';
import { financeUser } from '../test-utils/auth';
import { jsonRequest } from '../test-utils/request';
import { getPageSize } from '@/lib/firestore/query-performance';

/**
 * Page-size regression for the paginated list routes.
 *
 * `getPageSize` resolved a missing `limit` through `Number(raw)`, and `Number(null)` is
 * 0 rather than NaN — so the `Number.isFinite` fallback never fired and the value was
 * clamped up to 1. Every route that reads its page size straight from
 * `searchParams.get('limit')` therefore served exactly ONE row to any caller that did
 * not pass the parameter, which app/finance/invoices/page.tsx and
 * app/finance/payments/page.tsx do not.
 *
 * It survived because the shared fixture in buildTenantSeed() holds a single invoice for
 * tenant_a, so a limit of 1 and a limit of 50 return the same list. The seed below holds
 * four, ordered so that the row the golden-tenant certification asserts on is the OLDEST
 * and therefore the first to fall off a truncated page.
 */

const db = new FirestoreEmulator({
  invoices: [
    {
      id: 'demo-invoice-0001',
      data: {
        tenantId: 'tenant_a',
        isDeleted: false,
        orderId: 'INV-0001',
        status: 'paid',
        amountTotal: 14000,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
    {
      id: 'demo-invoice-0002',
      data: {
        tenantId: 'tenant_a',
        isDeleted: false,
        orderId: 'INV-0002',
        status: 'paid',
        amountTotal: 9250,
        createdAt: '2025-02-01T00:00:00.000Z',
      },
    },
    {
      id: 'demo-invoice-0003',
      data: {
        tenantId: 'tenant_a',
        isDeleted: false,
        orderId: 'INV-0003',
        status: 'overdue',
        amountTotal: 6000,
        createdAt: '2025-03-01T00:00:00.000Z',
      },
    },
    {
      id: 'demo-invoice-0004',
      data: {
        tenantId: 'tenant_a',
        isDeleted: false,
        orderId: 'INV-0004',
        status: 'overdue',
        amountTotal: 4250,
        createdAt: '2025-04-01T00:00:00.000Z',
      },
    },
    // Must stay invisible however wide the page gets.
    {
      id: 'invoice-other-tenant',
      data: {
        tenantId: 'tenant_b',
        isDeleted: false,
        orderId: 'INV-9999',
        status: 'paid',
        amountTotal: 5,
        createdAt: '2025-05-01T00:00:00.000Z',
      },
    },
    {
      id: 'invoice-soft-deleted',
      data: {
        tenantId: 'tenant_a',
        isDeleted: true,
        orderId: 'INV-8888',
        status: 'paid',
        amountTotal: 5,
        createdAt: '2025-05-02T00:00:00.000Z',
      },
    },
  ],
});

const authUser = financeUser({ uid: 'user_a', tenantId: 'tenant_a' });

jest.mock('@/lib/firebaseAdmin', () => ({ adminDb: db }));
jest.mock('@/app/api/finance/_utils', () => ({
  requireFinance: jest.fn(async () => ({ ok: true, user: authUser })),
  toISO: (v: any) => (v instanceof Date ? v.toISOString() : (v ?? null)),
}));
jest.mock('@/lib/finance/status', () => ({ toInvoiceStatusLabel: (s: string) => s }));
jest.mock('@/lib/logging', () => ({ logError: jest.fn(), logInfo: jest.fn() }));
jest.mock('@/lib/monitoring/dashboard-service', () => ({ ingestMetric: jest.fn(async () => {}) }));

async function listInvoices(query = '') {
  const { GET } = await import('@/app/api/finance/invoices/list/route');
  const res = await GET(jsonRequest(`https://app.local/api/finance/invoices/list${query}`));
  return { res, body: await res.json() };
}

describe('finance invoices list page size', () => {
  it('returns the whole first page when no limit is supplied', async () => {
    const { res, body } = await listInvoices();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // The assertion the golden-tenant certification makes against the deployment.
    expect(body.invoices.map((invoice: any) => invoice.orderId)).toEqual([
      'INV-0004',
      'INV-0003',
      'INV-0002',
      'INV-0001',
    ]);
    expect(body.pagination.limit).toBe(50);
    // Four rows on a fifty-row page is the end of the collection, not a page boundary.
    expect(body.pagination.nextCursor).toBeNull();
  });

  it('still honours an explicit limit and reports the next cursor', async () => {
    const { body } = await listInvoices('?limit=2');

    expect(body.invoices.map((invoice: any) => invoice.orderId)).toEqual(['INV-0004', 'INV-0003']);
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.nextCursor).toBe('demo-invoice-0003');
  });

  it('keeps the tenant and soft-delete bounds at the widened page size', async () => {
    const { body } = await listInvoices();

    const orderIds = body.invoices.map((invoice: any) => invoice.orderId);
    expect(orderIds).not.toContain('INV-9999');
    expect(orderIds).not.toContain('INV-8888');
    expect(body.invoices).toHaveLength(4);
  });
});

describe('getPageSize', () => {
  it('falls back when the caller supplied no value', () => {
    // The regression: each of these used to clamp to 1.
    expect(getPageSize(null)).toBe(50);
    expect(getPageSize('')).toBe(50);
    expect(getPageSize('   ')).toBe(50);
    expect(getPageSize(undefined as unknown as string | null)).toBe(50);
  });

  it('falls back when the supplied value is not a number', () => {
    expect(getPageSize('abc')).toBe(50);
    expect(getPageSize('Infinity')).toBe(50);
  });

  it('honours a supplied value and clamps it into range', () => {
    expect(getPageSize('25')).toBe(25);
    expect(getPageSize('25.9')).toBe(25);
    expect(getPageSize('1')).toBe(1);
    expect(getPageSize('100')).toBe(100);
    expect(getPageSize('200')).toBe(100);
    expect(getPageSize('0')).toBe(1);
    expect(getPageSize('-5')).toBe(1);
  });

  it('respects caller-supplied fallback and maximum', () => {
    expect(getPageSize(null, 10)).toBe(10);
    expect(getPageSize('500', 10, 200)).toBe(200);
  });
});
