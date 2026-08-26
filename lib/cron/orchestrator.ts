import { randomUUID } from 'crypto';
import { firestoreDailyJobStore } from '@/lib/cron/firestore-store';
import { dailyJobRegistry } from '@/lib/cron/registry';
import { CronRouteJobError } from '@/lib/cron/route-adapter';
import type { DailyJobDefinition, DailyJobStore, OrchestrationJobResult } from '@/lib/cron/types';

const DEFAULT_RUNTIME_BUDGET_MS = 270_000;
const MIN_RUNTIME_BUDGET_MS = 60_000;
const MAX_RUNTIME_BUDGET_MS = 270_000;
const COMPLETION_RESERVE_MS = 10_000;

export function runtimeBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.DAILY_CRON_RUNTIME_BUDGET_MS);
  if (!Number.isFinite(configured)) return DEFAULT_RUNTIME_BUDGET_MS;
  return Math.min(MAX_RUNTIME_BUDGET_MS, Math.max(MIN_RUNTIME_BUDGET_MS, configured));
}

export function utcRunDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function hasRuntimeBudget(
  remainingMs: number,
  estimatedJobMs: number,
  reserveMs = COMPLETION_RESERVE_MS,
): boolean {
  return remainingMs >= estimatedJobMs + reserveMs;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof CronRouteJobError) return error.code;
  if (error instanceof Error && /^CRON_[A-Z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  return 'JOB_EXECUTION_FAILED';
}

export type DailyOrchestrationResult = {
  ok: boolean;
  runId: string;
  runDate: string;
  status: 'completed' | 'completed_with_blocks' | 'incomplete' | 'failed';
  durationMs: number;
  counts: Record<string, number>;
  jobs: OrchestrationJobResult[];
};

export async function runDailyOrchestrator(
  options: {
    jobs?: readonly DailyJobDefinition[];
    store?: DailyJobStore;
    env?: NodeJS.ProcessEnv;
    clock?: () => number;
    runId?: string;
  } = {},
): Promise<DailyOrchestrationResult> {
  const jobs: readonly DailyJobDefinition[] = options.jobs ?? dailyJobRegistry;
  const store = options.store || firestoreDailyJobStore;
  const env = options.env || process.env;
  const clock = options.clock || Date.now;
  const runId = options.runId || randomUUID();
  const startedAtMs = clock();
  const startedAt = new Date(startedAtMs);
  const runDate = utcRunDate(startedAt);
  const deadlineAt = new Date(startedAtMs + runtimeBudgetMs(env));
  const results: OrchestrationJobResult[] = [];

  await store.beginRun({
    runId,
    runDate,
    startedAt,
    deadlineAt,
    jobCount: jobs.length,
  });

  for (const job of jobs) {
    const jobStartedAtMs = clock();
    const now = new Date(jobStartedAtMs);

    if (job.due && !job.due(now)) {
      await store.recordSkipped({
        runId,
        runDate,
        jobId: job.id,
        status: 'not_due',
        recordedAt: now,
      });
      results.push({ id: job.id, status: 'not_due', attempts: 0, durationMs: 0 });
      continue;
    }

    if (!hasRuntimeBudget(deadlineAt.getTime() - jobStartedAtMs, job.estimatedMaxRuntimeMs)) {
      await store.recordSkipped({
        runId,
        runDate,
        jobId: job.id,
        status: 'budget_skipped',
        recordedAt: now,
      });
      results.push({
        id: job.id,
        status: 'budget_skipped',
        attempts: 0,
        durationMs: 0,
        code: 'RUNTIME_BUDGET_EXHAUSTED',
      });
      continue;
    }

    let finalResult: OrchestrationJobResult | null = null;

    while (!finalResult) {
      let acquisition;
      try {
        acquisition = await store.acquireLease({
          runId,
          runDate,
          job,
          now: new Date(clock()),
        });
      } catch {
        finalResult = {
          id: job.id,
          status: 'failed',
          attempts: 0,
          durationMs: clock() - jobStartedAtMs,
          code: 'LEASE_ACQUIRE_FAILED',
        };
        break;
      }

      if (acquisition.state === 'already_terminal') {
        finalResult = {
          id: job.id,
          status: 'already_terminal',
          attempts: 0,
          durationMs: clock() - jobStartedAtMs,
          code: acquisition.outcome,
        };
        break;
      }

      if (acquisition.state === 'leased') {
        await store.recordSkipped({
          runId,
          runDate,
          jobId: job.id,
          status: 'leased',
          recordedAt: new Date(clock()),
        });
        finalResult = {
          id: job.id,
          status: 'leased',
          attempts: 0,
          durationMs: clock() - jobStartedAtMs,
        };
        break;
      }

      if (acquisition.state === 'attempts_exhausted') {
        finalResult = {
          id: job.id,
          status: 'attempts_exhausted',
          attempts: job.maxAttempts,
          durationMs: clock() - jobStartedAtMs,
          code: 'MAX_ATTEMPTS_EXHAUSTED',
        };
        break;
      }

      const attemptStartedAtMs = clock();
      try {
        const jobResult = await job.run({ runId, runDate, startedAt, deadlineAt });
        const completedAt = new Date(clock());
        const durationMs = completedAt.getTime() - attemptStartedAtMs;

        try {
          await store.finishAttempt({
            runId,
            runDate,
            jobId: job.id,
            attempt: acquisition.attempt,
            outcome: jobResult.outcome,
            code: jobResult.code,
            durationMs,
            metrics: jobResult.metrics,
            completedAt,
          });
          finalResult = {
            id: job.id,
            status: jobResult.outcome,
            attempts: acquisition.attempt,
            durationMs: completedAt.getTime() - jobStartedAtMs,
            code: jobResult.code,
            metrics: jobResult.metrics,
          };
        } catch {
          // The work ran, so never retry merely because its execution log could not finalize.
          finalResult = {
            id: job.id,
            status: 'failed',
            attempts: acquisition.attempt,
            durationMs: completedAt.getTime() - jobStartedAtMs,
            code: 'LEASE_FINALIZE_FAILED',
          };
        }
      } catch (error) {
        const failedAt = new Date(clock());
        const errorCode = safeErrorCode(error);
        try {
          await store.failAttempt({
            runId,
            runDate,
            jobId: job.id,
            attempt: acquisition.attempt,
            errorCode,
            durationMs: failedAt.getTime() - attemptStartedAtMs,
            failedAt,
          });
        } catch {
          finalResult = {
            id: job.id,
            status: 'failed',
            attempts: acquisition.attempt,
            durationMs: failedAt.getTime() - jobStartedAtMs,
            code: 'LEASE_FAILURE_LOG_FAILED',
          };
          break;
        }

        const canRetry =
          job.retrySafe &&
          acquisition.attempt < job.maxAttempts &&
          hasRuntimeBudget(deadlineAt.getTime() - clock(), job.estimatedMaxRuntimeMs);

        if (!canRetry) {
          finalResult = {
            id: job.id,
            status: 'failed',
            attempts: acquisition.attempt,
            durationMs: failedAt.getTime() - jobStartedAtMs,
            code: errorCode,
          };
        }
      }
    }

    results.push(finalResult);
  }

  const counts = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  const hasFailure = Boolean((counts.failed || 0) + (counts.attempts_exhausted || 0));
  // A concurrent invocation holding a lease is not proof that the work completed.
  // Report this run as incomplete; the lease owner will publish its own terminal run.
  const hasIncomplete = Boolean((counts.budget_skipped || 0) + (counts.leased || 0));
  const hasBlocks = Boolean(counts.blocked || 0);
  const status = hasFailure
    ? 'failed'
    : hasIncomplete
      ? 'incomplete'
      : hasBlocks
        ? 'completed_with_blocks'
        : 'completed';
  const completedAt = new Date(clock());
  const durationMs = completedAt.getTime() - startedAtMs;

  await store.finishRun({ runId, status, completedAt, durationMs, counts });

  return {
    ok: !hasFailure && !hasIncomplete,
    runId,
    runDate,
    status,
    durationMs,
    counts,
    jobs: results,
  };
}
