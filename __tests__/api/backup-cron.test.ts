import * as fs from 'fs';
import * as path from 'path';
import { getBackupCollections } from '@/lib/backup/backup-registry';

/**
 * Canonical nightly backup cron gate (DR-01, DR-02).
 *
 * Baseline findings:
 *  - DR-01: the old Firebase function read tenants/{id}/{collection}
 *    subcollections, but Bizosto keeps tenant data in TOP-LEVEL collections
 *    filtered by a `tenantId` field, so those backups were near-empty.
 *  - DR-02: that function was never wired for deployment.
 *
 * This gate proves, by static analysis, that the replacement route reads the
 * real top-level collections, groups by tenantId, emits a checksummed manifest,
 * is cron-authenticated, dead-letters + alerts on failure, and remains available
 * only as an operator action while the daily orchestrator records the Hobby-plan blocker.
 */

const ROUTE = 'app/api/cron/backup/route.ts';
const OLD_FUNCTION = 'functions/src/scheduled-backup.ts';
const VERCEL = 'vercel.json';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('canonical nightly backup cron (DR-01, DR-02)', () => {
  const source = read(ROUTE);

  it('deletes the broken subcollection-based, undeployed function', () => {
    expect(fs.existsSync(path.join(process.cwd(), OLD_FUNCTION))).toBe(false);
  });

  it('reads TOP-LEVEL collections and groups by tenantId, not subcollections (DR-01)', () => {
    expect(source).toContain('adminDb.collection(collectionName)');
    expect(source).toContain('tenantId');
    // No per-tenant subcollection walk (tenants/{id}/{collection}).
    expect(source).not.toMatch(/\.doc\([^)]*\)\s*\.collection\(/);
    expect(source).not.toContain("collection('tenants')");
  });

  it('covers the core tenant-scoped collections', () => {
    // P1-6a: the collection set moved out of this file into the classification registry, so
    // the coverage assertion targets the registry-derived list rather than the route's source
    // text. The intent is unchanged — the core tenant collections must be backed up.
    const backed = getBackupCollections();
    for (const collection of ['users', 'clients', 'invoices', 'projects', 'payments']) {
      expect(backed).toContain(collection);
    }
  });

  it('writes a manifest with per-file record counts and sha256 checksums', () => {
    expect(source).toContain('manifest.json');
    expect(source).toContain('createHash');
    expect(source).toContain('sha256');
    expect(source).toContain('records:');
  });

  it('is cron-authenticated with CRON_SECRET and never trusts metadata headers', () => {
    expect(source).toContain('CRON_SECRET');
    expect(source).toContain('authorizeCronRequest');
    expect(source).not.toContain("request.headers.get('x-vercel-cron')");
  });

  it('dead-letters + alerts admin on failure and is not an additional Vercel schedule', () => {
    expect(source).toContain("collection('dead_letter_backups')");
    expect(source).toContain("to: 'admin@bizosto.com'");

    const vercel = JSON.parse(read(VERCEL)) as { crons: Array<{ path: string; schedule: string }> };
    const cron = vercel.crons.find((entry) => entry.path === '/api/cron/backup');
    expect(cron).toBeUndefined();
    expect(vercel.crons).toEqual([{ path: '/api/cron/daily-orchestrator', schedule: '0 2 * * *' }]);
  });
});
