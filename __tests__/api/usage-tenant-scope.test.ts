import fs from 'fs';
import path from 'path';

/**
 * USAGE-1 — tenant scoping belongs in the query.
 *
 * Both usage endpoints read `api_usage_logs` with no tenant filter, took the newest N rows
 * across the WHOLE platform, and then discarded the ones that did not belong to the
 * caller. That is wrong twice over.
 *
 * It produces wrong answers. A tenant admin asking for 25 log rows got the 25 newest rows
 * platform-wide, filtered down — so on a busy platform they saw a handful, or none, while
 * their own history sat there in full. The screen reported "no API usage" as a fact about
 * their workspace when it was really a fact about someone else's traffic volume. The stats
 * endpoint is worse: its endpoint breakdown, hourly chart and consumer totals were
 * computed from whatever slice of a global 1,000 rows happened to be the caller's, and
 * presented as their own numbers.
 *
 * And the isolation was structurally fragile. Another tenant's documents were pulled into
 * the process on every request, and the only thing keeping them out of the response was a
 * line of array code after the fact. Nothing leaked — the filter did run — but one edit
 * that dropped it would have leaked directly, with no query-level backstop.
 *
 * A `where('tenantId', ...)` cannot be forgotten the same way: drop it and the results are
 * visibly another tenant's, rather than silently one refactor away from being so.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose describing the old shape is not the shape. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const LOGS = 'app/api/admin/usage/logs/route.ts';
const STATS = 'app/api/admin/usage/stats/route.ts';
const ROUTES = [LOGS, STATS];

describe('USAGE-1: the tenant filter is in the query', () => {
  it.each(ROUTES)('%s filters by tenantId in Firestore', (rel) => {
    const src = active(rel);
    expect(src).toContain("query.where('tenantId', '==', current.tenantId)");
  });

  it.each(ROUTES)('%s no longer filters the result array by tenant', (rel) => {
    // The post-filter WAS the isolation. A query-level filter cannot be dropped silently.
    const src = active(rel);
    expect(src).not.toMatch(/\.filter\(\(row\)[\s\S]{0,120}row\.tenantId === current\.tenantId/);
  });

  it.each(ROUTES)('%s applies the limit after the filter, not before', (rel) => {
    // limit() before where() would still spend the row budget on other tenants.
    const src = active(rel);
    const whereAt = src.indexOf("where('tenantId'");
    const limitAt = src.indexOf('.limit(');
    expect(whereAt).toBeGreaterThan(-1);
    expect(limitAt).toBeGreaterThan(whereAt);
  });

  it.each(ROUTES)('%s still lets a super_admin see the whole platform', (rel) => {
    // Platform-wide visibility is the point of the role; it is the tenant path that was
    // broken, not this one.
    const src = active(rel);
    expect(src).toContain("current.role !== 'super_admin'");
  });

  it.each(ROUTES)('%s takes the tenant from the session, never the request', (rel) => {
    const src = active(rel);
    expect(src).toContain('current.tenantId');
    expect(src).not.toMatch(/searchParams\.get\(\s*['"]tenantId['"]/);
  });
});

describe('USAGE-1: the query it now issues is supported', () => {
  it('has the composite index for tenantId + createdAt', () => {
    // Without it this query fails at runtime rather than at review — the failure mode is
    // an empty usage page in production, which is exactly what was being fixed.
    const indexes = JSON.parse(read('firestore.indexes.json')).indexes as Array<{
      collectionGroup: string;
      fields: Array<{ fieldPath: string; order?: string }>;
    }>;

    const usage = indexes
      .filter((index) => index.collectionGroup === 'api_usage_logs')
      .map((index) => index.fields.map((f) => `${f.fieldPath}:${f.order}`).join(','));

    expect(usage).toContain('tenantId:ASCENDING,createdAt:DESCENDING');
  });

  it('orders by the field the index is built on', () => {
    for (const rel of ROUTES) {
      expect(active(rel)).toContain("orderBy('createdAt', 'desc')");
    }
  });
});

describe('USAGE-1: both endpoints still authorise before reading', () => {
  it.each(ROUTES)('%s requires an admin', (rel) => {
    const src = active(rel);
    expect(src).toContain('getCurrentUser()');
    expect(src).toContain('isAdminOrSuper(current.role)');

    // The check must precede the read.
    const authAt = src.indexOf('isAdminOrSuper(current.role)');
    const readAt = src.indexOf("collection('api_usage_logs')");
    expect(authAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(authAt);
  });
});
