import * as fs from 'fs';
import * as path from 'path';

const FIREBASE = 'firebase.json';
const VERCEL = 'vercel.json';
const ORCHESTRATOR = 'lib/cron/daily-orchestrator.ts';

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

  it('keeps exactly one Vercel schedule and fans legacy responsibilities from it', () => {
    const vercel = JSON.parse(read(VERCEL)) as { crons: Array<{ path: string; schedule: string }> };
    expect(vercel.crons).toEqual([{ path: '/api/cron/daily-tasks', schedule: '0 0 * * *' }]);

    const orchestrator = read(ORCHESTRATOR);
    for (const cronPath of [
      '/api/cron/generate-invoices',
      '/api/cron/backup',
      '/api/cron/email-outbox',
    ]) {
      expect(orchestrator).toContain(`path: '${cronPath}'`);
    }

    // Compliance retention/reporting are already executed directly by daily-tasks itself,
    // so scheduling their old standalone routes as well would double-run them.
    const dailyTasks = read('app/api/cron/daily-tasks/route.ts');
    expect(dailyTasks).toContain('runRetentionCleanupAcrossTenants()');
    expect(dailyTasks).toContain('generateWeeklyComplianceReports()');

    // The other half of that reasoning, asserted rather than assumed: dispatching the
    // standalone routes as well would run the audit-log purge and the compliance report
    // twice a day. The routes stay deployed for manual recovery runs, unscheduled.
    for (const alsoInline of ['/api/cron/compliance-retention', '/api/cron/compliance-report']) {
      expect(orchestrator).not.toContain(alsoInline);
    }
  });
});
