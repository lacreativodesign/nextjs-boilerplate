import * as fs from 'fs';
import * as path from 'path';
import { getBackupCollections } from '@/lib/backup/backup-registry';

const ROUTE = 'app/api/cron/backup/route.ts';
const OLD_FUNCTION = 'functions/src/scheduled-backup.ts';
const VERCEL = 'vercel.json';
const ORCHESTRATOR = 'lib/cron/daily-orchestrator.ts';

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
    expect(source).not.toMatch(/\.doc\([^)]*\)\s*\.collection\(/);
    expect(source).not.toContain("collection('tenants')");
  });

  it('covers the core tenant-scoped collections', () => {
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

  it('is cron-authenticated by CRON_SECRET alone, with no spoofable header bypass', () => {
    expect(source).toContain('CRON_SECRET');
    expect(source).toContain('Bearer ${secret}');
    expect(source).toContain('status: 401');
    expect(source).not.toContain('if (isCronFromVercel) return true;');
  });

  it('dead-letters + alerts admin on failure', () => {
    expect(source).toContain("collection('dead_letter_backups')");
    expect(source).toContain("to: 'admin@bizosto.com'");
  });

  it('is reached through the single scheduled daily orchestrator', () => {
    const vercel = JSON.parse(read(VERCEL)) as { crons: Array<{ path: string; schedule: string }> };
    expect(vercel.crons).toEqual([{ path: '/api/cron/daily-tasks', schedule: '0 0 * * *' }]);
    expect(read(ORCHESTRATOR)).toContain("path: '/api/cron/backup'");
  });
});
