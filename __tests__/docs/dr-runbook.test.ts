import fs from 'fs';
import path from 'path';

/**
 * Q10 — Disaster Recovery runbook / code sync guard.
 * Pins the runbook's endpoints and paths to strings that must also exist in the
 * real backup/restore code, so the runbook can't silently drift out of sync.
 */

const read = (rel: string): string => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const RUNBOOK = 'docs/runbooks/disaster-recovery.md';
const BACKUP_ROUTE = 'app/api/cron/backup/route.ts';
const RESTORE_ROUTE = 'app/api/super_admin/restore/route.ts';

describe('DR runbook exists and is substantive', () => {
  const doc = read(RUNBOOK);

  it('is present and non-trivial', () => {
    expect(doc.length).toBeGreaterThan(1500);
    expect(doc).toContain('# Disaster Recovery Runbook');
  });

  it('documents RPO/RTO and the witnessed restore drill', () => {
    expect(doc).toMatch(/RPO/);
    expect(doc).toMatch(/RTO/);
    expect(doc).toMatch(/[Ww]itnessed restore drill/);
  });
});

describe('runbook references match the real backup/restore code', () => {
  const doc = read(RUNBOOK);
  const backup = read(BACKUP_ROUTE);
  const restore = read(RESTORE_ROUTE);

  it('backup endpoint and schedule are accurate', () => {
    expect(doc).toContain('/api/cron/backup');
    const vercel = read('vercel.json');
    expect(doc).toContain('0 2 * * *');
    expect(vercel).toContain('0 2 * * *');
  });

  it('restore endpoint is accurate and super_admin-gated', () => {
    expect(doc).toContain('/api/super_admin/restore');
    expect(restore).toContain('requireSuperAdmin');
  });

  it('backup layout and manifest names match the code', () => {
    expect(doc).toContain('backups/<runDate>/manifest.json');
    expect(backup).toContain('manifest.json');
    expect(backup).toContain('backups/');
  });

  it('isolated restore-collection prefix matches the code', () => {
    expect(doc).toContain('restore_<runDate>__<collection>');
    expect(restore).toContain('restore_');
    expect(restore).toContain('restore_audit');
  });

  it('durability sinks (dead-letter) match the code', () => {
    expect(doc).toContain('dead_letter_backups');
    expect(backup).toContain('dead_letter_backups');
  });

  it('bucket resolver referenced by the runbook exists', () => {
    expect(doc).toContain('getBackupBucketName()');
    expect(backup).toContain('getBackupBucketName');
  });
});
