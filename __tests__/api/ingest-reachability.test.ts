import fs from 'fs';
import path from 'path';

/**
 * INGEST-1 — a tenant website can actually reach the ingest endpoints.
 *
 * `/api/ingest` was classified as a platform-internal path in middleware, which made the
 * tenant ingest API impossible to call. The gate reads `x-api-key` and compares it against
 * the PLATFORM's rotating keys — but a tenant website sends its TENANT key in that same
 * header, so verifyRotatingApiKey() rejected it and the request was answered 401 before
 * the route ran. It then demanded an HMAC signed with INTERNAL_REQUEST_SIGNING_SECRET, a
 * platform secret no tenant has or should ever have. Two conditions, neither satisfiable
 * by the party the endpoint exists for.
 *
 * The product documented the feature anyway. Settings → API Key tells a tenant to set
 * BIZOSTO_INGEST_KEY and "POST to /api/ingest/leads with the header x-api-key". Every one
 * of those requests was rejected by middleware. The whole website-lead pipeline — the
 * reason the ingest routes, the key issuer and that settings page exist — was dead on
 * arrival, and KEY-1 hardened an authenticator that could never be reached.
 *
 * Ingest is NOT unauthenticated now. It is authenticated at the route, which is the only
 * layer that can distinguish one tenant's key from another's — a shared platform key
 * identifies no tenant at all. These tests pin that the gate is gone AND that every route
 * behind it still proves who is calling.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose naming a path is not read as a rule. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const MIDDLEWARE = 'middleware.ts';

/** Every route under /api/ingest. Each must authenticate itself. */
function ingestRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') out.push(path.relative(ROOT, full));
    }
  };
  walk(path.join(ROOT, 'app', 'api', 'ingest'));
  return out.sort();
}

/** The body of isSensitiveApiPath, which decides who faces the platform-key gate. */
function sensitivePathBody(): string {
  const src = active(MIDDLEWARE);
  const start = src.indexOf('function isSensitiveApiPath(');
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('}', src.indexOf('return', start)));
}

describe('INGEST-1: the platform-key gate no longer blocks tenant ingest', () => {
  it('does not classify /api/ingest as platform-internal', () => {
    // This one line was the entire blocker.
    expect(sensitivePathBody()).not.toContain("'/api/ingest'");
  });

  it('still gates the paths that really are platform-internal', () => {
    const body = sensitivePathBody();
    expect(body).toContain("'/api/cron'");
    expect(body).toContain("'/api/super_admin'");
    expect(body).toContain("'/api/super-admin'");
  });

  it('keeps the rotating key and signature checks for those paths', () => {
    const src = active(MIDDLEWARE);
    expect(src).toContain('verifyRotatingApiKey(apiKey)');
    expect(src).toContain('verifyRequestSignature(');
    expect(src).toContain('isSensitiveApiPath(pathname)');
  });
});

describe('INGEST-1: what protects ingest instead', () => {
  const routes = ingestRoutes();

  it('finds the ingest routes, so a rename cannot empty this suite', () => {
    expect(routes.length).toBeGreaterThanOrEqual(4);
    expect(routes).toContain('app/api/ingest/leads/route.ts');
  });

  it.each(ingestRoutes())('%s authenticates the caller itself', (rel) => {
    const src = active(rel);
    expect(src).toContain('authenticateIngest(req)');
  });

  it('resolves the key to exactly one tenant, against a stored hash', () => {
    // A shared platform key identifies no tenant; this is what replaces it.
    const auth = active('lib/ingest/auth.ts');
    expect(auth).toContain('apiKeyHash');
    expect(auth).toContain('timingSafeEqual');
    expect(auth).toContain("req.headers.get('x-api-key')");
  });

  it('never trusts a tenant id supplied alongside the key', () => {
    // x-tenant-id is defence in depth, validated against the key, never a substitute.
    const auth = active('lib/ingest/auth.ts');
    expect(auth).toContain('invalid_api_key');
    expect(auth).toContain('invalid_tenant');
  });

  it('keeps rate limiting, which runs before the gate and is unchanged', () => {
    const src = active(MIDDLEWARE);
    const rateAt = src.indexOf('checkRateLimit({');
    const gateAt = src.indexOf('isSensitiveApiPath(pathname)');
    expect(rateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(rateAt);
  });

  it('keeps skipping browser CSRF, since this is server-to-server', () => {
    const src = active(MIDDLEWARE);
    const csrf = src.slice(src.indexOf('function shouldSkipCsrfCheck('));
    expect(csrf).toContain("'/api/ingest/'");
  });
});

describe('INGEST-1: the documented contract is now the working one', () => {
  it('the settings page still tells tenants to use x-api-key', () => {
    // If this page and the middleware ever disagree again, the feature is dead and the
    // product is still advertising it. They are pinned together here.
    const page = read('app/admin/settings/api-key/page.tsx');
    expect(page).toContain('x-api-key');
    expect(page).toContain('/api/ingest/leads');
  });

  it('the endpoints it names all exist', () => {
    for (const endpoint of ['leads', 'briefs', 'orders']) {
      expect(fs.existsSync(path.join(ROOT, 'app', 'api', 'ingest', endpoint, 'route.ts'))).toBe(
        true,
      );
    }
  });
});
