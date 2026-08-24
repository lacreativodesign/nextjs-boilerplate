import { coordinateDailyBackup } from '@/lib/cron/backup-coordination';
import { inspectDailyIntegrationSchedules } from '@/lib/cron/integration-coordination';
import { invokeCronRoute } from '@/lib/cron/route-adapter';
import { inspectDueReportSchedules } from '@/lib/cron/report-coordination';
import type { DailyJobDefinition } from '@/lib/cron/types';

const routeJob =
  (path: string, load: Parameters<typeof invokeCronRoute>[1]): DailyJobDefinition['run'] =>
  async () =>
    invokeCronRoute(path, load);

/**
 * The only daily job registry. Ordering is intentional: access/billing correctness and
 * customer communications run before lower-priority housekeeping.
 */
export const dailyJobRegistry = [
  {
    id: 'billing-lock-reconciliation',
    description: 'Advance due subscription locks and period-end downgrades.',
    estimatedMaxRuntimeMs: 20_000,
    leaseDurationMs: 10 * 60_000,
    maxAttempts: 2,
    retrySafe: true,
    run: routeJob('/api/cron/billing-locks', () => import('@/app/api/cron/billing-locks/route')),
  },
  {
    id: 'trial-reminders',
    description: 'Send due trial reminders and advance expired trial states.',
    estimatedMaxRuntimeMs: 25_000,
    leaseDurationMs: 10 * 60_000,
    maxAttempts: 1,
    retrySafe: false,
    run: routeJob('/api/cron/trial-emails', () => import('@/app/api/cron/trial-emails/route')),
  },
  {
    id: 'invoice-reminders',
    description: 'Enqueue tenant-branded invoice reminders from canonical invoices.',
    estimatedMaxRuntimeMs: 35_000,
    leaseDurationMs: 15 * 60_000,
    maxAttempts: 1,
    retrySafe: false,
    run: routeJob(
      '/api/cron/invoice-reminders',
      () => import('@/app/api/cron/invoice-reminders/route'),
    ),
  },
  {
    id: 'recurring-invoice-generation',
    description: 'Generate due recurring invoices when the sandbox-certified flag is enabled.',
    estimatedMaxRuntimeMs: 25_000,
    leaseDurationMs: 15 * 60_000,
    maxAttempts: 1,
    retrySafe: false,
    run: routeJob(
      '/api/cron/generate-invoices',
      () => import('@/app/api/cron/generate-invoices/route'),
    ),
  },
  {
    id: 'abandoned-signup-cleanup',
    description: 'Remind and remove eligible unpaid abandoned tenant signups.',
    estimatedMaxRuntimeMs: 30_000,
    leaseDurationMs: 15 * 60_000,
    maxAttempts: 1,
    retrySafe: false,
    run: routeJob(
      '/api/cron/abandoned-signups',
      () => import('@/app/api/cron/abandoned-signups/route'),
    ),
  },
  {
    id: 'email-outbox-drain',
    description: 'Retry the bounded batch of due transactional-email outbox records.',
    estimatedMaxRuntimeMs: 10_000,
    leaseDurationMs: 10 * 60_000,
    maxAttempts: 1,
    retrySafe: false,
    run: routeJob('/api/cron/email-outbox', () => import('@/app/api/cron/email-outbox/route')),
  },
  {
    id: 'retention-cleanup',
    description: 'Apply configured retention rules across bounded tenant data.',
    estimatedMaxRuntimeMs: 25_000,
    leaseDurationMs: 15 * 60_000,
    maxAttempts: 2,
    retrySafe: true,
    run: routeJob(
      '/api/cron/compliance-retention',
      () => import('@/app/api/cron/compliance-retention/route'),
    ),
  },
  {
    id: 'daily-core-housekeeping',
    description: 'Run digests, session cleanup, exchange refresh, and archival.',
    estimatedMaxRuntimeMs: 40_000,
    leaseDurationMs: 15 * 60_000,
    maxAttempts: 1,
    retrySafe: false,
    run: routeJob('/api/cron/daily-tasks', () => import('@/app/api/cron/daily-tasks/route')),
  },
  {
    id: 'scheduled-integration-coordination',
    description: 'Expose daily provider sync work whose runtime cannot yet be bounded safely.',
    estimatedMaxRuntimeMs: 5_000,
    leaseDurationMs: 5 * 60_000,
    maxAttempts: 2,
    retrySafe: true,
    run: inspectDailyIntegrationSchedules,
  },
  {
    id: 'scheduled-report-coordination',
    description: 'Expose due scheduled reports without claiming an absent worker completed them.',
    estimatedMaxRuntimeMs: 5_000,
    leaseDurationMs: 5 * 60_000,
    maxAttempts: 2,
    retrySafe: true,
    run: inspectDueReportSchedules,
  },
  {
    id: 'weekly-compliance-report',
    description: 'Generate weekly compliance summaries on Sunday UTC.',
    estimatedMaxRuntimeMs: 15_000,
    leaseDurationMs: 10 * 60_000,
    maxAttempts: 1,
    retrySafe: false,
    due: (now: Date) => now.getUTCDay() === 0,
    run: routeJob(
      '/api/cron/compliance-report',
      () => import('@/app/api/cron/compliance-report/route'),
    ),
  },
  {
    id: 'backup-coordination',
    description: 'Record the full-export owner blocker without claiming a backup completed.',
    estimatedMaxRuntimeMs: 5_000,
    leaseDurationMs: 5 * 60_000,
    maxAttempts: 2,
    retrySafe: true,
    run: coordinateDailyBackup,
  },
] as const satisfies readonly DailyJobDefinition[];
