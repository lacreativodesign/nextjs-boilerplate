import fs from 'fs';
import path from 'path';

/**
 * KEY-1 — an ingest credential may arrive in exactly one place, and be checked one way.
 *
 * authenticateIngest() accepted the tenant API key from three sources: the `x-api-key`
 * header, an `apiKey` query parameter, and an `apiKey` field in the JSON body (which all
 * three of /api/ingest/leads, /briefs and /orders passed in explicitly). The header is the
 * only safe one:
 *
 *   - A key in a URL is written to web-server access logs, proxy logs, CDN logs, browser
 *     history and the Referer header of any onward request.
 *   - A key in a body is written to request-body logging, APM traces and error capture —
 *     Sentry is wired into this app and captures request payloads.
 *
 * Two further defects were in the same function. The stored hash was compared with `===`,
 * which short-circuits at the first differing byte and leaks the digest prefix through
 * response timing. And a tenant with no `apiKeyHash` could authenticate against a
 * plaintext `apiKey` field on its own document, defeating the point of storing a hash.
 *
 * These tests are behavioural where they can be — the module is exercised against a fake
 * Firestore — and structural only for the properties that are about absence.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped: prose describing the old behaviour is not the behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const AUTH_MODULE = 'lib/ingest/auth.ts';

/**
 * Every route that authenticates an inbound ingest request.
 *
 * INGEST-2 retired /api/ingest/lead (singular). It authenticates nothing now — it answers
 * 410 and names the canonical endpoint — so it is deliberately absent here rather than
 * asserted against. __tests__/api/ingest-lead-sunset.test.ts covers it instead.
 */
const INGEST_ROUTES = [
  'app/api/ingest/leads/route.ts',
  'app/api/ingest/briefs/route.ts',
  'app/api/ingest/orders/route.ts',
];

describe('KEY-1: the credential is read from the header and nowhere else', () => {
  const src = active(AUTH_MODULE);

  it('reads x-api-key', () => {
    expect(src).toContain("req.headers.get('x-api-key')");
  });

  it('never reads a key from the query string', () => {
    expect(src).not.toContain('searchParams');
    expect(src).not.toMatch(/searchParams\.get\(\s*['"]apiKey['"]/);
  });

  it('never accepts a key passed in from a request body', () => {
    // The options bag existed only to carry body.apiKey through.
    expect(src).not.toContain('fallbackApiKey');
    expect(src).not.toContain('AuthenticateIngestOptions');
  });

  it('takes no second argument, so no caller can reintroduce one', () => {
    expect(src).toMatch(/authenticateIngest\(\s*req:\s*Request\s*\)/);
  });

  it.each(INGEST_ROUTES)('%s passes only the request', (rel) => {
    const route = active(rel);
    expect(route).toContain('authenticateIngest(req)');
    expect(route).not.toContain('fallbackApiKey');
    expect(route).not.toMatch(/body\.apiKey/);
  });
});

describe('KEY-1: the stored hash is compared safely', () => {
  const src = active(AUTH_MODULE);

  it('uses a constant-time comparison', () => {
    expect(src).toContain('timingSafeEqual');
  });

  it('never compares the hash with === or !==', () => {
    expect(src).not.toMatch(/apiKeyHash\s*[!=]==/);
    expect(src).not.toMatch(/[!=]==\s*keyHash/);
  });

  it('checks length before comparing, since timingSafeEqual throws on a mismatch', () => {
    expect(src).toMatch(/length\s*!==\s*\w+\.length/);
  });

  it('no longer accepts a plaintext apiKey field on the tenant document', () => {
    // A tenant with no hash could previously authenticate against an unhashed secret at
    // rest — precisely what apiKeyHash exists to prevent.
    expect(src).not.toMatch(/tenantData\.apiKey\b(?!Hash)/);
  });
});

describe('KEY-1: authentication still binds a request to exactly one tenant', () => {
  const crypto = require('crypto') as typeof import('crypto');
  const hash = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

  const TENANTS: Record<string, Record<string, unknown>> = {
    tenant_a: { apiKeyHash: hash('key-for-a'), name: 'A' },
    tenant_b: { apiKeyHash: hash('key-for-b'), name: 'B' },
    // A legacy-shaped document holding an unhashed secret. It must NOT authenticate.
    tenant_legacy: { apiKey: 'plaintext-legacy-key', name: 'Legacy' },
  };

  /**
   * KEY-2 extended this double with subcollection support. These tenants deliberately hold
   * only the LEGACY root hash and no api_keys records, which is what every tenant created
   * before KEY-2 looks like — so this suite doubles as the regression test that the legacy
   * path still authenticates.
   */
  const emptyQuery = {
    where: () => emptyQuery,
    limit: () => emptyQuery,
    get: async () => ({ empty: true, docs: [] as unknown[] }),
  };

  jest.doMock('@/lib/firebaseAdmin', () => ({
    adminDb: {
      doc: (docPath: string) => {
        const id = docPath.replace(/^tenants\//, '');
        return {
          get: async () => ({ exists: Boolean(TENANTS[id]), data: () => TENANTS[id] }),
        };
      },
      // No api_keys records exist for these tenants, so every subcollection query is empty
      // and authentication must fall through to the legacy root hash.
      collectionGroup: () => emptyQuery,
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: Boolean(TENANTS[id]), data: () => TENANTS[id] }),
          collection: () => emptyQuery,
          update: async () => undefined,
        }),
        where: (_field: string, _op: string, value: unknown) => ({
          limit: () => ({
            get: async () => {
              const match = Object.entries(TENANTS).find(([, d]) => d.apiKeyHash === value);
              return {
                empty: !match,
                docs: match ? [{ id: match[0], data: () => match[1] }] : [],
              };
            },
          }),
        }),
      }),
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { authenticateIngest } = require('@/lib/ingest/auth') as typeof import('@/lib/ingest/auth');

  const reqWith = (headers: Record<string, string>, url = 'https://app.local/api/ingest/leads') =>
    ({
      headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
      url,
    }) as unknown as Request;

  it('authenticates a valid key against its own tenant header', async () => {
    const res = await authenticateIngest(
      reqWith({ 'x-tenant-id': 'tenant_a', 'x-api-key': 'key-for-a' }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.tenantId).toBe('tenant_a');
  });

  it('resolves the tenant from the key alone', async () => {
    const res = await authenticateIngest(reqWith({ 'x-api-key': 'key-for-b' }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.tenantId).toBe('tenant_b');
  });

  it("rejects tenant A's key aimed at tenant B", async () => {
    const res = await authenticateIngest(
      reqWith({ 'x-tenant-id': 'tenant_b', 'x-api-key': 'key-for-a' }),
    );
    expect(res.ok).toBe(false);
  });

  it('ignores a key supplied in the query string', async () => {
    const res = await authenticateIngest(
      reqWith({}, 'https://app.local/api/ingest/leads?apiKey=key-for-a'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('missing_auth');
  });

  it('refuses a tenant holding only an unhashed key', async () => {
    const res = await authenticateIngest(
      reqWith({ 'x-tenant-id': 'tenant_legacy', 'x-api-key': 'plaintext-legacy-key' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_api_key');
  });

  it('rejects a request carrying no key', async () => {
    const res = await authenticateIngest(reqWith({}));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('missing_auth');
  });
});
