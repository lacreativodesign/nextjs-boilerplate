import * as fs from 'fs';
import * as path from 'path';

/**
 * S2 — File & HR tenant integrity.
 *
 * These routes previously (a) omitted tenantId from file/document records, making
 * them invisible to every tenant-scoped list/versioning query, and (b) accepted an
 * arbitrary client-supplied document id with merge semantics, allowing one tenant to
 * overwrite/hijack another tenant's record. The HR upload also never validated that
 * the target employee belonged to the actor's tenant.
 *
 * Live Firebase is unavailable in CI, so these are source-contract assertions in the
 * same style as route-guard-coverage and the AI-1 fix tests.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S2: HR document upload tenant integrity', () => {
  const src = read('app/api/hr/documents/upload/route.ts');

  it('validates the target employee belongs to the actor tenant', () => {
    expect(src).toContain("collection('users').doc(userId).get()");
    expect(src).toMatch(/tenantId[^\n]*!==\s*access\.user\.tenantId/);
  });

  it('rejects an arbitrary cross-tenant document id instead of merging into it', () => {
    expect(src).toMatch(/existingRef\.get\(\)/);
    expect(src).toMatch(/Document not found/);
  });

  it('stamps tenantId onto the HR event', () => {
    expect(src).toMatch(/tenantId:\s*access\.user\.tenantId/);
  });
});

describe('S2: file upload records carry tenantId', () => {
  const routes = [
    'app/api/production/files/upload/route.ts',
    'app/api/am/files/upload/route.ts',
    'app/api/client/files/upload/route.ts',
  ];

  it.each(routes)('%s writes tenantId in the file payload', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/tenantId:\s*(me|auth\.user)\.tenantId/);
  });
});

describe('S2: versioned file uploads reject cross-tenant id overwrite', () => {
  const routes = ['app/api/production/files/upload/route.ts', 'app/api/am/files/upload/route.ts'];

  it.each(routes)('%s tenant-checks a supplied fileId', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/existingSnap\.data\(\)\?\.tenantId[^\n]*!==\s*me\.tenantId/);
    expect(src).toMatch(/File not found/);
  });
});

describe('S2: createHrEvent supports tenant scoping', () => {
  const src = read('app/api/admin/hr/_utils.ts');
  it('accepts and persists a tenantId on the events write', () => {
    expect(src).toMatch(/tenantId\?:\s*string \| null/);
    expect(src).toMatch(/tenantId:\s*tenantId \|\| null/);
  });
});
