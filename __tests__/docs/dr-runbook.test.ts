import fs from 'fs';
import path from 'path';

const read = (rel: string): string => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const RUNBOOK = 'docs/runbooks/disaster-recovery.md';
const BACKUP_ROUTE = 'app/api/cron/backup/route.ts';
const RESTORE_ROUTE = 'app/api/super_admin/restore/route.ts';
const ORCHESTRATOR = 'lib/cron/daily-orchestrator.ts';

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

  it('does not claim a deployed restore drill happened without evidence', () => {
    expect(doc).toContain('Do not state that a deployed restore drill has been completed');
  });
});

describe('runbook references match the real backup/restore code', () => {
  const doc = read(RUNBOOK);
  const backup = read(BACKUP_ROUTE);
  const restore = read(RESTORE_ROUTE);

  it('documents the single scheduler and its daily backup fanout', () => {
    expect(doc).toContain('/api/cron/daily-tasks');
    expect(doc).toContain('0 0 * * *');
    expect(doc).toContain('/api/cron/backup');

    const vercel = JSON.parse(read('vercel.json')) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(vercel.crons).toEqual([{ path: '/api/cron/daily-tasks', schedule: '0 0 * * *' }]);
    expect(read(ORCHESTRATOR)).toContain("path: '/api/cron/backup'");
  });

  it('documents Bearer CRON_SECRET rather than the spoofable x-vercel-cron header', () => {
    expect(doc).toContain('Authorization: Bearer <CRON_SECRET>');
    expect(doc).toContain('is **not** authorization');
    expect(backup).toContain('Bearer ${secret}');
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
