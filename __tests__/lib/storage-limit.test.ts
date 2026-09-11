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

describe('S11/PR4: every upload route enforces the storage limit', () => {
  // PR4-C replaced the advisory checkStorageLimit() read on these six browser-direct
  // routes with admitTenantUpload(), which measures the object, reserves the space
  // atomically and removes the object when the tenant has no room. The invariant these
  // tests protect is unchanged and stricter: no route may persist a file record without
  // first spending its own tenant's quota.
  it.each(UPLOAD_ROUTES)('%s admits the upload before persisting', (rel) => {
    const src = read(rel);
    expect(src).toContain('admitTenantUpload(');
    expect(src).toContain('uploadAdmissionResponseBody(');
  });

  it.each(UPLOAD_ROUTES)('%s resolves the tenant from the session, never the body', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/tenantId: (me|auth\.user|access\.user)\.tenantId/);
    expect(src).not.toMatch(/tenantId: body/);
    expect(src).not.toMatch(/checkStorageLimit\(\s*body/);
  });

  it.each(UPLOAD_ROUTES)('%s meters the measured size, not the declared one', (rel) => {
    const src = read(rel);
    expect(src).toContain('size: admission.bytes,');
    // The bare `size,` shorthand would persist the caller's declared number.
    expect(src).not.toMatch(/^\s+size,$/m);
  });

  it.each(UPLOAD_ROUTES)('%s always releases its reservation', (rel) => {
    const src = read(rel);
    expect(src).toContain('} finally {');
    expect(src).toContain('await releaseUploadAdmission(admission);');
  });
});

describe('S11: usage is measured from real file sizes', () => {
  const src = read('lib/billing/storage-limit.ts');

  it('sums every byte-bearing collection, including the two PR4 found unmetered', () => {
    expect(src).toContain("collection('files')");
    expect(src).toContain("collection('employeeDocuments')");
    // PR4-B: one row per physical object, so every version is counted.
    expect(src).toContain("collection('erp_file_versions')");
    // PR4-A: the live document-library upload path.
    expect(src).toContain("collection('documents')");
    expect(src).toContain("AggregateField.sum('size')");
    expect(src).toContain("AggregateField.sum('fileSize')");
  });

  it('never double-counts the managed file row against its own current version', () => {
    // erp_files.size mirrors the current erp_file_versions row; counting both would
    // charge the current version twice.
    expect(src).not.toContain("collection('erp_files')");
  });

  it('scopes every sum to the tenant and excludes soft-deleted records', () => {
    expect(src).toContain("where('tenantId', '==', id)");
    expect(src).toContain("where('isDeleted', '==', false)");
    expect(src).toContain("where('deletedAt', '==', null)");
  });

  it('reads limits from the canonical catalog, not hardcoded numbers', () => {
    expect(src).toContain("from '@/lib/billing/plans'");
    expect(src).toContain('limits?.storage');
  });

  it('falls back to the smallest tier, never to unlimited, on a malformed plan', () => {
    expect(src).toContain('plans.starter.limits.storage');
  });

  it('no longer exports the advisory read that the race came through', () => {
    // PR4-E: every caller now reserves inside a transaction. Keeping checkStorageLimit()
    // exported would leave the read-then-write gate one import away from returning.
    expect(src).not.toContain('export async function checkStorageLimit');
    expect(read('lib/billing/storage-reservation.ts')).toMatch(/if \(used \+ incoming > limit\)/);
  });
});

describe('S11: HR documents are no longer invisible', () => {
  it('both HR routes persist the measured file size', () => {
    expect(read('app/api/hr/documents/upload/route.ts')).toContain('size: admission.bytes,');
    expect(read('app/api/admin/hr/documents/upload/route.ts')).toContain('size: admission.bytes,');
  });

  it('the admin HR route now stamps a tenantId on the document record', () => {
    const src = read('app/api/admin/hr/documents/upload/route.ts');
    const payloadStart = src.indexOf('const payload = {');
    const payloadEnd = src.indexOf('};', payloadStart);
    const payload = src.slice(payloadStart, payloadEnd);
    expect(payload).toContain('tenantId: access.user.tenantId');
    expect(payload).toContain('size: admission.bytes');
  });
});
