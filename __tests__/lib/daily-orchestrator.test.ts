import { hasRuntimeBudget, runDailyOrchestrator, runtimeBudgetMs } from '@/lib/cron/orchestrator';
import type { DailyJobDefinition, DailyJobStore, LeaseAcquisition } from '@/lib/cron/types';
import { invokeCronRoute } from '@/lib/cron/route-adapter';

function memoryStore(): DailyJobStore & { attempts: Map<string, number> } {
  const attempts = new Map<string, number>();
  return {
    attempts,
    beginRun: jest.fn(async () => undefined),
    acquireLease: jest.fn(async ({ job }): Promise<LeaseAcquisition> => {
      const attempt = (attempts.get(job.id) || 0) + 1;
      attempts.set(job.id, attempt);
      return attempt > job.maxAttempts
        ? { state: 'attempts_exhausted' }
        : { state: 'acquired', attempt };
    }),
    finishAttempt: jest.fn(async () => undefined),
    failAttempt: jest.fn(async () => undefined),
    recordSkipped: jest.fn(async () => undefined),
    finishRun: jest.fn(async () => undefined),
  };
}

const job = (
  id: string,
  run: DailyJobDefinition['run'],
  overrides: Partial<DailyJobDefinition> = {},
): DailyJobDefinition => ({
  id,
  description: id,
  estimatedMaxRuntimeMs: 1,
  leaseDurationMs: 60_000,
  maxAttempts: 1,
  retrySafe: false,
  run,
  ...overrides,
});

describe('daily orchestrator', () => {
  it('isolates a failed job and continues the registry', async () => {
    const second = jest.fn(async () => ({ outcome: 'succeeded' as const }));
    const result = await runDailyOrchestrator({
      jobs: [
        job('first', async () => {
          throw new Error('provider included PII that must not be stored');
        }),
        job('second', second),
      ],
      store: memoryStore(),
      env: { ...process.env, DAILY_CRON_RUNTIME_BUDGET_MS: '60000' },
      runId: 'test-failure-isolation',
    });

    expect(second).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.jobs.map(({ id, status, code }) => ({ id, status, code }))).toEqual([
      { id: 'first', status: 'failed', code: 'JOB_EXECUTION_FAILED' },
      { id: 'second', status: 'succeeded', code: undefined },
    ]);
    expect(JSON.stringify(result)).not.toContain('provider included PII');
  });

  it('retries only a job explicitly marked retry-safe', async () => {
    let calls = 0;
    const store = memoryStore();
    const result = await runDailyOrchestrator({
      jobs: [
        job(
          'retry-safe',
          async () => {
            calls += 1;
            if (calls === 1) throw new Error('transient');
            return { outcome: 'succeeded' };
          },
          { retrySafe: true, maxAttempts: 2 },
        ),
      ],
      store,
      env: { ...process.env, DAILY_CRON_RUNTIME_BUDGET_MS: '60000' },
      runId: 'test-safe-retry',
    });

    expect(calls).toBe(2);
    expect(store.failAttempt).toHaveBeenCalledTimes(1);
    expect(result.jobs[0]).toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it('records explicit owner blocks without pretending the job failed or completed', async () => {
    const result = await runDailyOrchestrator({
      jobs: [
        job('blocked', async () => ({
          outcome: 'blocked',
          code: 'OWNER_DECISION_REQUIRED',
        })),
      ],
      store: memoryStore(),
      runId: 'test-owner-block',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('completed_with_blocks');
    expect(result.jobs[0]).toMatchObject({
      status: 'blocked',
      code: 'OWNER_DECISION_REQUIRED',
    });
  });

  it('clamps configured runtime and reserves completion time before starting work', () => {
    expect(runtimeBudgetMs({ ...process.env, DAILY_CRON_RUNTIME_BUDGET_MS: '1' })).toBe(60_000);
    expect(runtimeBudgetMs({ ...process.env, DAILY_CRON_RUNTIME_BUDGET_MS: '999999' })).toBe(
      270_000,
    );
    expect(hasRuntimeBudget(20_000, 10_000)).toBe(true);
    expect(hasRuntimeBudget(19_999, 10_000)).toBe(false);
  });

  it('treats a route-reported partial failure as a failed job', async () => {
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 't'.repeat(32);
    try {
      await expect(
        invokeCronRoute('/api/cron/example', async () => ({
          GET: async () => Response.json({ ok: true, processed: 2, errors: ['redacted'] }),
        })),
      ).rejects.toMatchObject({ code: 'ROUTE_200' });
    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
    }
  });

  it('turns a nested route capacity ceiling into an observable owner block', async () => {
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 't'.repeat(32);
    try {
      await expect(
        invokeCronRoute('/api/cron/example', async () => ({
          GET: async () =>
            Response.json({ success: true, results: { scanned: 100, truncated: true } }),
        })),
      ).resolves.toMatchObject({
        outcome: 'blocked',
        code: 'OWNER_CAPACITY_DECISION_REQUIRED',
      });
    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
    }
  });
});
