import * as fs from 'fs';
import * as path from 'path';
import { plans } from '@/lib/billing/plans';

/**
 * S11 — Storage limits are metered and enforced.
 *
 * Storage is a paid dimension of every plan (Starter 20GB, Pro 75GB, Enterprise 250GB)
 * but nothing anywhere measured or enforced it: a Starter tenant could upload without
 * bound. That is a revenue leak AND an uncapped cost, since every byte sits in the
 * Firebase Storage bucket on Bizosto's account.
 *
 * Two related defects were found while wiring this up:
 *   - Neither HR document route persisted the file `size`, so HR documents consumed
 *     storage completely invisibly.
 *   - app/api/admin/hr/documents/upload wrote its employeeDocuments record with NO
 *     tenantId at all — the missed sibling of the file-record fix. Those documents were
 *     invisible to the tenant-scoped HR list and would have been invisible to metering.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const UPLOAD_ROUTES = [
  'app/api/production/files/upload/route.ts',
  'app/api/am/files/upload/route.ts',
  'app/api/client/files/upload/route.ts',
  'app/api/admin/files/create/route.ts',
  'app/api/hr/documents/upload/route.ts',
  'app/api/admin/hr/documents/upload/route.ts',
];

describe('S11: the canonical catalog carries the sold storage limits', () => {
  const GB = 1024 ** 3;

  it('Starter 20GB, Pro 75GB, Enterprise 250GB', () => {
    expect(plans.starter.limits.storage).toBe(20 * GB);
    expect(plans.pro.limits.storage).toBe(75 * GB);
    expect(plans.enterprise.limits.storage).toBe(250 * GB);
  });

  it('no plan is sold with unlimited storage', () => {
    (['starter', 'pro', 'enterprise'] as const).forEach((key) => {
      expect(plans[key].limits.storage).toBeGreaterThan(0);
    });
  });
});

describe('S11: every upload route enforces the storage limit', () => {
  it.each(UPLOAD_ROUTES)('%s checks the limit before persisting', (rel) => {
    const src = read(rel);
    expect(src).toContain('checkStorageLimit(');
    expect(src).toContain('storageLimitResponseBody(');
  });

  it.each(UPLOAD_ROUTES)('%s resolves the tenant from the session, never the body', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/checkStorageLimit\((me|auth\.user|access\.user)\.tenantId/);
    expect(src).not.toMatch(/checkStorageLimit\(\s*body/);
  });
});

describe('S11: usage is measured from real file sizes', () => {
  const src = read('lib/billing/storage-limit.ts');

  it('sums the size field across both file-bearing collections', () => {
    expect(src).toContain("sumCollectionBytes('files', tenantId)");
    expect(src).toContain("sumCollectionBytes('employeeDocuments', tenantId)");
    expect(src).toContain("AggregateField.sum('size')");
  });

  it('scopes every sum to the tenant and excludes soft-deleted records', () => {
    expect(src).toContain("where('tenantId', '==', tenantId)");
    expect(src).toContain("where('isDeleted', '==', false)");
  });

  it('reads limits from the canonical catalog, not hardcoded numbers', () => {
    expect(src).toContain("from '@/lib/billing/plans'");
    expect(src).toContain('limits?.storage');
  });

  it('falls back to the smallest tier, never to unlimited, on a malformed plan', () => {
    expect(src).toContain('plans.starter.limits.storage');
  });

  it('rejects an upload that would cross the limit', () => {
    expect(src).toMatch(/ok: used \+ incoming <= limit/);
  });
});

describe('S11: HR documents are no longer invisible', () => {
  it('both HR routes persist the file size', () => {
    expect(read('app/api/hr/documents/upload/route.ts')).toMatch(/^\s+size,$/m);
    expect(read('app/api/admin/hr/documents/upload/route.ts')).toMatch(/^\s+size,$/m);
  });

  it('the admin HR route now stamps a tenantId on the document record', () => {
    const src = read('app/api/admin/hr/documents/upload/route.ts');
    const payloadStart = src.indexOf('const payload = {');
    const payloadEnd = src.indexOf('};', payloadStart);
    const payload = src.slice(payloadStart, payloadEnd);
    expect(payload).toContain('tenantId: access.user.tenantId');
    expect(payload).toContain('size');
  });
});
