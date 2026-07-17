/**
 * E6 — Ingest hardening. The global ERP_INGEST_KEY fallback let any holder of a
 * single shared secret write into ANY tenant by naming it in the body. It is
 * removed: every ingest request must present a per-tenant hashed API key bound
 * to exactly one workspace. These tests prove per-tenant auth still works and
 * the global key is now rejected — no cross-tenant write path remains.
 */

jest.mock('@/lib/firebaseAdmin', () => {
  // Built inside the factory to avoid the hoist TDZ. Two tenants, each with its
  // own apiKeyHash.
  const nodeCrypto = require('crypto');
  const hash = (k: string) => nodeCrypto.createHash('sha256').update(k).digest('hex');
  const TENANTS: Record<string, Record<string, unknown>> = {
    tenant_a: { apiKeyHash: hash('key-for-a'), name: 'A' },
    tenant_b: { apiKeyHash: hash('key-for-b'), name: 'B' },
  };
  return {
    adminDb: {
      doc(path: string) {
        const id = path.replace(/^tenants\//, '');
        return {
          get: async () => ({ exists: Boolean(TENANTS[id]), data: () => TENANTS[id] }),
        };
      },
      collection() {
        return {
          where(_field: string, _op: string, value: unknown) {
            return {
              limit() {
                return {
                  get: async () => {
                    const match = Object.entries(TENANTS).find(([, d]) => d.apiKeyHash === value);
                    return {
                      empty: !match,
                      docs: match ? [{ id: match[0], data: () => match[1] }] : [],
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
});

import { authenticateIngest } from '@/lib/ingest/auth';

const reqWith = (headers: Record<string, string>, url = 'https://app.local/api/ingest/leads') =>
  ({
    headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
    url,
  }) as unknown as Request;

describe('ingest auth is per-tenant, no global fallback (E6)', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('authenticates via x-tenant-id header + matching per-tenant key', async () => {
    const res = await authenticateIngest(
      reqWith({ 'x-tenant-id': 'tenant_a', 'x-api-key': 'key-for-a' }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tenantId).toBe('tenant_a');
      expect(res.via).toBe('tenant-header');
    }
  });

  it('resolves the tenant by key lookup when no header is given', async () => {
    const res = await authenticateIngest(reqWith({ 'x-api-key': 'key-for-b' }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tenantId).toBe('tenant_b');
      expect(res.via).toBe('key-lookup');
    }
  });

  it("rejects tenant A's key used against tenant B's header (no cross-tenant)", async () => {
    const res = await authenticateIngest(
      reqWith({ 'x-tenant-id': 'tenant_b', 'x-api-key': 'key-for-a' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it('rejects the former global ERP_INGEST_KEY even with a body/header tenantId', async () => {
    process.env.ERP_INGEST_KEY = 'super-global-secret';
    const res = await authenticateIngest(
      reqWith({ 'x-tenant-id': 'tenant_a', 'x-api-key': 'super-global-secret' }),
    );
    expect(res.ok).toBe(false);
  });

  it('rejects a global key with no header (key-lookup miss)', async () => {
    process.env.ERP_INGEST_KEY = 'super-global-secret';
    const res = await authenticateIngest(reqWith({ 'x-api-key': 'super-global-secret' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_credentials');
  });

  it('rejects a request with no key at all', async () => {
    const res = await authenticateIngest(reqWith({}));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('missing_auth');
  });
});
