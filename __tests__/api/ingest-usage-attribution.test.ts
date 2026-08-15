import fs from 'fs';
import path from 'path';

/**
 * USAGE-2 — an ingest call is recorded against the workspace that made it.
 *
 * Middleware logs every API request to `api_usage_logs` and resolves the tenant from the
 * `tenant_id` cookie, written at session-login from verified claims. That is correct for a
 * browser and impossible for ingest: a tenant's website posts server-to-server with an
 * `x-api-key` header and no cookies at all, so every one of those calls was filed under
 * `tenantId: 'unknown'` with `userId: 'ip:<hash>'`.
 *
 * The cause is structural rather than an oversight. Middleware runs BEFORE the route, and
 * an ingest request only becomes attributable AFTER authenticateIngest() matches the key
 * to a workspace. Nothing upstream of that can know whose call it is.
 *
 * USAGE-1 is what made it matter. Scoping the usage queries to the caller's tenant means a
 * tenant opening Settings → API Usage now sees nothing from their website integration,
 * because none of it carries their id. The integration they would most want to watch — is
 * my form working, how many leads arrived — is the one that is invisible.
 *
 * Recording happens at authentication, not at the response. Capturing the response status
 * too would mean routing every return path and thrown error through a single exit, which
 * is a whole-function re-indent across three routes for a refinement rather than the fix.
 * A per-status breakdown is worth having on its own terms.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about the old behaviour is not the behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const HELPER = 'lib/ingest/usage.ts';

/** Every ingest route that authenticates a tenant key. */
const INGEST_ROUTES: Array<[string, string]> = [
  ['app/api/ingest/leads/route.ts', 'ingest/leads'],
  ['app/api/ingest/briefs/route.ts', 'ingest/briefs'],
  ['app/api/ingest/orders/route.ts', 'ingest/orders'],
];

describe('USAGE-2: the call is attributed to the authenticated workspace', () => {
  it.each(INGEST_ROUTES)('%s records usage', (rel) => {
    expect(active(rel)).toContain('recordIngestUsage(');
  });

  it.each(INGEST_ROUTES)('%s attributes it to %s', (rel, endpoint) => {
    expect(active(rel)).toContain(`endpoint: '${endpoint}'`);
  });

  it.each(INGEST_ROUTES)('%s uses the tenant the KEY resolved to', (rel) => {
    const src = active(rel);
    // Not a header, not a body field — the value authenticateIngest returned.
    expect(src).toMatch(/void recordIngestUsage\(\{ tenantId,/);
    expect(src).toContain('const tenantId = auth.tenantId;');
  });

  it.each(INGEST_ROUTES)('%s records only AFTER authenticating', (rel) => {
    // Before authentication there is no tenant to attribute to; recording earlier would
    // just recreate the 'unknown' bucket this exists to escape.
    const src = active(rel);
    const authAt = src.indexOf('authenticateIngest(req)');
    const recordAt = src.indexOf('recordIngestUsage(');
    expect(authAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(authAt);
  });

  it.each(INGEST_ROUTES)('%s does not await it on the critical path', (rel) => {
    // A lead that was accepted must never fail because a metrics row could not be written.
    const src = active(rel);
    expect(src).toContain('void recordIngestUsage(');
    expect(src).not.toContain('await recordIngestUsage(');
  });
});

describe('USAGE-2: an unattributable call is not recorded at all', () => {
  const src = active(HELPER);

  it('drops an empty tenant rather than writing another unknown row', () => {
    // Writing it would land in the same bucket the fix exists to escape, and would
    // double-count against the entry middleware already made.
    expect(src).toMatch(/if \(!tenantId\) return;/);
  });

  it('never throws', () => {
    const fn = src.slice(src.indexOf('export async function recordIngestUsage'));
    expect(fn).toContain('try {');
    expect(fn).toContain('catch');
    expect(fn).not.toContain('throw');
  });

  it('logs a failure without the tenant or the endpoint', () => {
    // This path carries customer data; a metrics failure is not worth leaking context for.
    expect(src).toContain('[USAGE] failed to record ingest usage');
    expect(src).not.toMatch(/console\.error\([^)]*\$\{/);
  });
});

describe('USAGE-2: the row is shaped like the ones the screens already read', () => {
  const src = active(HELPER);

  it('writes to the same collection', () => {
    expect(src).toContain("collection('api_usage_logs')");
  });

  it('carries createdAt, which the tenant-scoped query orders on', () => {
    // USAGE-1 made both usage endpoints query (tenantId, createdAt DESC). A row without
    // createdAt would be invisible to exactly the screens this is for.
    expect(src).toContain('createdAt: new Date().toISOString()');
  });

  it('is served by the existing composite index', () => {
    const indexes = JSON.parse(read('firestore.indexes.json')).indexes as Array<{
      collectionGroup: string;
      fields: Array<{ fieldPath: string; order?: string }>;
    }>;
    const shapes = indexes
      .filter((i) => i.collectionGroup === 'api_usage_logs')
      .map((i) => i.fields.map((f) => `${f.fieldPath}:${f.order}`).join(','));
    expect(shapes).toContain('tenantId:ASCENDING,createdAt:DESCENDING');
  });

  it('marks the caller as a key rather than inventing a person', () => {
    // An API key identifies a workspace, not a user. The usage screen should say so.
    expect(src).toContain("userId: 'api_key'");
    expect(src).toContain("source: 'ingest'");
  });

  it('stores no IP or email for a machine caller', () => {
    expect(src).toContain("ip: ''");
    expect(src).toContain("userEmail: ''");
  });
});
