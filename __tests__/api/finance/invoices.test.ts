import { FirestoreEmulator, buildTenantSeed } from '../test-utils/firestore-emulator';
import { financeUser } from '../test-utils/auth';
import { jsonRequest } from '../test-utils/request';

const db = new FirestoreEmulator(buildTenantSeed());
const authUser = financeUser({ uid: 'user_a', tenantId: 'tenant_a' });

jest.mock('@/lib/firebaseAdmin', () => ({ adminDb: db }));
jest.mock('@/app/api/finance/_utils', () => ({
  requireFinance: jest.fn(async () => ({ ok: true, user: authUser })),
  serverTimestamp: jest.fn(() => new Date('2025-01-01T00:00:00.000Z')),
  parseString: (v: unknown) => (typeof v === 'string' ? v : ''),
  parseNumber: (v: unknown, fallback = 0) => (typeof v === 'number' ? v : fallback),
  toISO: (v: any) => (v instanceof Date ? v.toISOString() : (v ?? null)),
  createFinanceEvent: jest.fn(),
  queueFinanceEmail: jest.fn(),
}));
jest.mock('@/lib/security', () => ({
  checkRateLimit: jest.fn(async () => undefined),
  getClientIp: jest.fn(() => '127.0.0.1'),
}));
jest.mock('@/lib/logging', () => ({ logError: jest.fn() }));
jest.mock('@/lib/audit', () => ({ logEvent: jest.fn(async () => undefined) }));
jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
  getUserIdsByRoles: jest.fn(async () => []),
}));
jest.mock('@/app/api/admin/_utils', () => ({ normalizeRole: (r: string) => r }));
jest.mock('@/lib/tenant', () => ({
  docTenantId: (doc: any) => doc?.tenantId,
  normalizeTenantId: (tenantId: string) => tenantId,
}));
jest.mock('@/lib/finance/status', () => ({
  toInvoiceStatusLabel: (s: string) => s,
  normalizeInvoiceStatus: (s: string) => s || 'draft',
  computeInvoiceStatus: jest.fn(() => 'paid'),
  computeBalanceDue: jest.fn(() => 0),
  parseInvoiceStatus: (s: string) => s,
}));
jest.mock('@/lib/validations/invoice', () => ({ createInvoiceSchema: {} }));
jest.mock('@/lib/validations/validate', () => ({
  validateRequest: (_schema: unknown, payload: any) => payload,
}));
jest.mock('@/lib/finance/currencies', () => ({
  getCurrency: (code: string) => {
    if (code !== 'USD' && code !== 'EUR') {
      throw new Error('Unsupported currency code');
    }
    return { code };
  },
}));
jest.mock('@/lib/finance/exchangeRates', () => ({
  getExchangeRate: jest.fn(async () => 1.1),
  storeHistoricalRate: jest.fn(),
}));
jest.mock('@/lib/finance/tax', () => ({
  calculateTax: jest.fn(() => ({ amountTax: 0, total: 100 })),
}));
jest.mock('@/lib/finance/invoiceActions', () => ({ maybeAutoCreateProjectFromInvoice: jest.fn() }));

describe('finance invoices API', () => {
  it('lists invoices for current tenant context payload', async () => {
    const { GET } = await import('@/app/api/finance/invoices/list/route');
    const res = await GET(jsonRequest('https://app.local/api/finance/invoices/list'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // Tenant isolation: only tenant_a invoices may appear; tenant_b must be absent.
    expect(body.invoices).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'inv_tenant_a' })]),
    );
    expect(body.invoices).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'inv_tenant_b' })]),
    );
    expect(body.currentUser.uid).toBe('user_a');
  });

  it('blocks invoice update for cross-tenant record', async () => {
    const { POST } = await import('@/app/api/finance/invoices/update/route');
    const res = await POST(
      jsonRequest('https://app.local/api/finance/invoices/update', {
        id: 'inv_tenant_b',
        action: 'update_status',
        status: 'sent',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain('Forbidden');
  });

  it('returns validation error for unsupported currency', async () => {
    const { POST } = await import('@/app/api/finance/invoices/create/route');
    const res = await POST(
      jsonRequest('https://app.local/api/finance/invoices/create', {
        orderId: 'ORD-NEW',
        clientId: 'client_a',
        currency: 'ZZZ',
        dueDate: '2025-03-01',
        items: [{ description: 'Implementation', quantity: 1, unitPrice: 100, taxRate: 0 }],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error || body.message).toBeTruthy();
  });

  it('allows tenant invoice status update', async () => {
    const { POST } = await import('@/app/api/finance/invoices/update/route');
    const res = await POST(
      jsonRequest('https://app.local/api/finance/invoices/update', {
        id: 'inv_tenant_a',
        action: 'update_status',
        status: 'sent',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const doc = await db.collection('invoices').doc('inv_tenant_a').get();
    expect(doc.data()?.status).toBe('sent');
  });
});
