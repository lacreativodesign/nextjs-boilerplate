import fs from 'fs';
import path from 'path';

/**
 * INGEST-2 — one way to submit a lead.
 *
 * Two endpoints wrote leads, with different payload shapes, different required fields,
 * different error codes and different response bodies. A tenant wiring up a form had to
 * guess which one to use, and the singular one was worse on every axis:
 *
 *   - No idempotency. IDEM-1 gave /api/ingest/leads an exact-once guarantee through an
 *     Idempotency-Key claim. This route had none, so a dropped response or a double-click
 *     created a second lead for the same person — the exact failure IDEM-1 existed to fix,
 *     still reachable through the other door.
 *   - It wrote `tenantId` from the `x-tenant-id` header rather than from `auth.tenantId`.
 *     That was safe only by coincidence: authenticateIngest happens to validate a supplied
 *     header tenant against that tenant's own key hash, so a cross-tenant write was NOT
 *     possible. But the route did not rely on that check — it relied on nobody changing
 *     it. The rule that tenantId comes from the authenticated principal exists so safety
 *     is structural rather than incidental.
 *   - It validated the body before authenticating, letting an unauthenticated caller probe
 *     which fields a workspace requires.
 *   - Its rate limiter was an in-process Map: on serverless every instance keeps its own
 *     counter, so the effective limit was the configured one times the instance count, and
 *     the Map was never pruned.
 *
 * Nothing called it. It was unreachable until INGEST-1 — middleware classified
 * /api/ingest as platform-internal and rejected every tenant key — and Settings → API Key
 * documents only the plural endpoint. It answers 410 rather than being deleted so that it
 * names its replacement instead of returning a bare 404.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about the old behaviour is not the behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const SUNSET = 'app/api/ingest/lead/route.ts';
const CANONICAL = 'app/api/ingest/leads/route.ts';

describe('INGEST-2: the singular endpoint is retired', () => {
  const src = active(SUNSET);

  it('answers 410 Gone', () => {
    expect(src).toContain('status: 410');
    expect(src).toContain("code: 'endpoint_sunset'");
  });

  it('names the endpoint to use instead', () => {
    // A bare 404 tells an integrator nothing; this tells them where to go.
    expect(src).toContain("canonicalEndpoint: '/api/ingest/leads'");
    expect(src).toContain('/api/ingest/leads');
  });

  it('writes no lead', () => {
    expect(src).not.toContain("collection('leads')");
    expect(src).not.toContain('leadRef');
  });

  it('reads no tenant from a header', () => {
    // This was the defect worth removing rather than patching.
    expect(src).not.toContain("headers.get('x-tenant-id')");
  });

  it('carries no second rate limiter', () => {
    // An in-process Map cannot rate limit a serverless deployment, and never pruned.
    expect(src).not.toContain('rateLimitState');
    expect(src).not.toContain('RATE_LIMIT_MAX');
  });

  it('sends no notifications, so a retired endpoint cannot page anyone', () => {
    expect(src).not.toContain('createNotification');
  });
});

describe('INGEST-2: the canonical endpoint keeps everything that was fixed', () => {
  const src = active(CANONICAL);

  it('still authenticates through the shared authenticator', () => {
    expect(src).toContain('authenticateIngest(req)');
  });

  it('takes the tenant from the authenticated principal, never a header', () => {
    expect(src).toContain('auth.tenantId');
    expect(src).not.toMatch(/tenantId = req\.headers\.get/);
  });

  it('still honours Idempotency-Key', () => {
    expect(src).toContain("req.headers.get('idempotency-key')");
    expect(src).toContain('idempotencyDocId');
  });

  it('authenticates before it writes', () => {
    const authAt = src.indexOf('authenticateIngest(req)');
    const writeAt = src.indexOf('leadRef.set(');
    expect(authAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(authAt);
  });
});

describe('INGEST-2: exactly one route writes a lead from ingest', () => {
  it('leaves no second writer under /api/ingest', () => {
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'route.ts') {
          const rel = path.relative(ROOT, full);
          if (/\.collection\(\s*['"`]leads['"`]\s*\)/.test(active(rel))) writers.push(rel);
        }
      }
    };
    walk(path.join(ROOT, 'app', 'api', 'ingest'));
    expect(writers).toEqual([CANONICAL]);
  });

  it('is the one the product documents', () => {
    const page = read('app/admin/settings/api-key/page.tsx');
    expect(page).toContain('/api/ingest/leads');
    // The singular form must not be advertised anywhere a tenant would read it.
    expect(page).not.toMatch(/\/api\/ingest\/lead(?!s)/);
  });
});
