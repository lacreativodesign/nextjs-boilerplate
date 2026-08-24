import fs from 'fs';
import path from 'path';
import { dailyJobRegistry } from '@/lib/cron/registry';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('one-daily-cron architecture', () => {
  it('configures exactly one daily Vercel schedule', () => {
    const config = JSON.parse(read('vercel.json')) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(config.crons).toEqual([{ path: '/api/cron/daily-orchestrator', schedule: '0 2 * * *' }]);
  });

  it('keeps all daily work in one unique central registry', () => {
    const ids = dailyJobRegistry.map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'trial-reminders',
        'billing-lock-reconciliation',
        'invoice-reminders',
        'recurring-invoice-generation',
        'retention-cleanup',
        'abandoned-signup-cleanup',
        'email-outbox-drain',
        'scheduled-integration-coordination',
        'scheduled-report-coordination',
        'backup-coordination',
      ]),
    );
  });

  it('does not mistake an unconsumed queue or unbounded provider sweep for completed work', () => {
    const registry = read('lib/cron/registry.ts');
    const coordination = read('lib/cron/integration-coordination.ts');
    expect(registry).toContain('inspectDailyIntegrationSchedules');
    expect(registry).not.toContain("'/api/cron/quickbooks-sync'");
    expect(registry).not.toContain("'/api/cron/xero-sync'");
    expect(coordination).toContain('OWNER_DECISION_REQUIRED_INTEGRATION_SCHEDULING');
  });

  it('permits a second attempt only for jobs declared retry-safe', () => {
    for (const job of dailyJobRegistry) {
      expect(job.maxAttempts === 1 || job.retrySafe).toBe(true);
      expect(job.maxAttempts).toBeLessThanOrEqual(2);
    }
  });

  it('uses per-job leases, execution logs, and a bounded runtime budget', () => {
    const store = read('lib/cron/firestore-store.ts');
    const orchestrator = read('lib/cron/orchestrator.ts');
    expect(store).toContain("const LEASES = 'cron_job_leases'");
    expect(store).toContain("const EXECUTIONS = 'cron_job_executions'");
    expect(store).toContain('idempotencyKey');
    expect(orchestrator).toContain('DAILY_CRON_RUNTIME_BUDGET_MS');
    expect(orchestrator).toContain('RUNTIME_BUDGET_EXHAUSTED');
  });

  it('requires the bearer secret on every cron route and never trusts x-vercel-cron', () => {
    const routeRoot = path.join(process.cwd(), 'app', 'api', 'cron');
    const routeFiles = fs
      .readdirSync(routeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(routeRoot, entry.name, 'route.ts'))
      .filter((file) => fs.existsSync(file));

    for (const file of routeFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).toContain('CRON_SECRET');
      expect(source).toContain('authorizeCronRequest');
      expect(source).not.toContain("request.headers.get('x-vercel-cron')");
    }
  });
});
