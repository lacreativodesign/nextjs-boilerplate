import * as fs from 'fs';
import * as path from 'path';

/**
 * Decommission gate for the legacy Node-18 functions/ directory (OPS-01).
 *
 * Baseline findings:
 *  - The functions/ directory held Firebase Cloud Functions (pollEmailInboxes,
 *    purgeAuditLogs, sendScheduledReports, scheduledInvoiceGeneration) pinned to
 *    Node 18, with no lockfile and outside the root CI/typecheck/lint.
 *  - firebase.json carries NO functions block, so none of it was ever deployed —
 *    it was untested dead code and an audit/diligence risk.
 *  - Its deployable responsibilities are covered by the sole Vercel cron's registry:
 *    compliance-retention (audit-log purge), generate-invoices (invoice
 *    generation), and backup.
 *
 * This gate proves the directory is gone, firebase.json declares no functions
 * target, and the replacing daily jobs are present — so the directory cannot
 * quietly return.
 */

const FIREBASE = 'firebase.json';
const VERCEL = 'vercel.json';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('legacy Node-18 functions/ directory is decommissioned (OPS-01)', () => {
  it('deletes the entire functions/ directory', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'functions'))).toBe(false);
  });

  it('declares no functions target in firebase.json', () => {
    const firebase = JSON.parse(read(FIREBASE)) as Record<string, unknown>;
    expect(firebase).not.toHaveProperty('functions');
  });

  it('covers the jobs in the sole daily registry without adding schedules', () => {
    const vercel = JSON.parse(read(VERCEL)) as { crons: Array<{ path: string; schedule: string }> };
    const registry = read('lib/cron/registry.ts');
    expect(vercel.crons).toEqual([{ path: '/api/cron/daily-orchestrator', schedule: '0 2 * * *' }]);
    for (const cronPath of ['/api/cron/compliance-retention', '/api/cron/generate-invoices']) {
      expect(registry).toContain(`'${cronPath}'`);
    }
    expect(registry).toContain('coordinateDailyBackup');
  });
});
