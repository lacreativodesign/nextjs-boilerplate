import fs from 'fs';
import path from 'path';

/**
 * P1-6b — the restore path matches the backup format, verifies integrity, and can dry-run.
 *
 * The previous restore could never run and would have corrupted data if it had: it required a
 * single-tenant `backups` record (the cron writes a multi-tenant one, so it threw on every real
 * backup), read `${storagePath}/{collection}.json` (missing the {tenantId} path segment the
 * cron writes), and wrote to `tenants/{tenantId}/{collection}` subcollections (the app and the
 * backup use TOP-LEVEL collections). It also ignored the per-file sha256 in the manifest and
 * offered no dry run.
 *
 * These assertions pin restore to the manifest the backup actually writes.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const RESTORE = 'lib/backup/restore.ts';
const ROUTE = 'app/api/backup/restore/route.ts';
const CRON = 'app/api/cron/backup/route.ts';

describe('P1-6b: restore is driven by the manifest the backup writes', () => {
  const src = read(RESTORE);

  it('reads the manifest instead of guessing paths', () => {
    expect(src).toContain('backupData.manifestPath');
    expect(src).toContain('bucket.file(manifestPath).download()');
    expect(src).toContain('assertManifest');
  });

  it('uses each file entry’s recorded path, so the tenant segment is never dropped', () => {
    expect(src).toContain('bucket.file(entry.path).download()');
    expect(src).not.toContain('${backupData.storagePath}/${collectionName}.json');
  });

  it('no longer requires a single-tenant backup record', () => {
    // The old code called assertBackupRecord() and required backupData.tenantId. Assert the
    // call is gone; the header comment still describes the old shape, so match on the call.
    expect(src).not.toContain('assertBackupRecord(');
    expect(src).not.toContain('candidate.tenantId');
  });
});

describe('P1-6b: restore writes to the same location the backup read from', () => {
  const src = read(RESTORE);

  it('writes to the TOP-LEVEL collection keyed by the original id', () => {
    expect(src).toContain('adminDb.collection(entry.collection).doc(id)');
  });

  it('does not write into tenants/{tenantId}/{collection} subcollections', () => {
    expect(src).not.toMatch(/collection\('tenants'\)[\s\S]{0,120}\.collection\(collectionName\)/);
  });

  it('the backup it mirrors reads from top-level collections', () => {
    // Guards the invariant both sides depend on: backup groups top-level docs by tenantId.
    expect(read(CRON)).toContain('adminDb.collection(collectionName).get()');
  });
});

describe('P1-6b: restore verifies integrity before writing', () => {
  const src = read(RESTORE);

  it('recomputes and checks the sha256 recorded in the manifest', () => {
    expect(src).toContain('sha256(text)');
    expect(src).toContain('Checksum mismatch');
  });

  it('computes the checksum before the write loop, not after', () => {
    expect(src.indexOf('Checksum mismatch')).toBeLessThan(src.indexOf('batch.commit()'));
  });
});

describe('P1-6b: restore supports a non-destructive dry run', () => {
  const src = read(RESTORE);

  it('accepts a dryRun option and a tenant filter', () => {
    expect(src).toContain('options.dryRun === true');
    expect(src).toContain('options.tenantIds');
  });

  it('skips all Firestore writes when dry-running', () => {
    expect(src).toContain('if (dryRun) {');
    expect(src).toMatch(/if \(!dryRun\)[\s\S]{0,80}restoreStatus: 'in_progress'/);
  });

  it('still verifies every checksum during a dry run', () => {
    expect(src.indexOf('Checksum mismatch')).toBeLessThan(src.indexOf('if (dryRun) {'));
  });
});

describe('P1-6b: the restore route exposes dry-run and stays super_admin-gated', () => {
  const src = read(ROUTE);

  it('still requires a super_admin', () => {
    expect(src).toContain('requireSuperAdmin');
  });

  it('passes dryRun and tenantIds through to the restore', () => {
    expect(src).toContain('dryRun: body.dryRun === true');
    expect(src).toContain('tenantIds: Array.isArray(body.tenantIds)');
  });

  it('returns the restore result so a dry run is inspectable', () => {
    expect(src).toContain('ok: true, result');
  });
});
