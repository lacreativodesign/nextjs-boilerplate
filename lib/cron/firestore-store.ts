import { adminDb } from '@/lib/firebaseAdmin';
import type { DailyJobOutcome, DailyJobStore, LeaseAcquisition } from '@/lib/cron/types';

const RUNS = 'cron_orchestration_runs';
const LEASES = 'cron_job_leases';
const EXECUTIONS = 'cron_job_executions';

function leaseId(runDate: string, jobId: string): string {
  return `${runDate}__${jobId}`;
}

function executionId(runId: string, jobId: string, attempt: number | 'skipped'): string {
  return `${runId}__${jobId}__${attempt}`;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export const firestoreDailyJobStore: DailyJobStore = {
  async beginRun(input) {
    await adminDb
      .collection(RUNS)
      .doc(input.runId)
      .set({
        ...input,
        status: 'running',
        deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      });
  },

  async acquireLease(input): Promise<LeaseAcquisition> {
    const ref = adminDb.collection(LEASES).doc(leaseId(input.runDate, input.job.id));
    const executionCollection = adminDb.collection(EXECUTIONS);

    return adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = (snapshot.data() || {}) as {
        status?: string;
        outcome?: DailyJobOutcome;
        attempts?: number;
        leaseUntil?: unknown;
        leaseOwner?: string;
      };

      if (current.status === 'completed' && current.outcome) {
        return { state: 'already_terminal', outcome: current.outcome };
      }

      const leaseUntil = toDate(current.leaseUntil);
      if (
        current.status === 'running' &&
        leaseUntil &&
        leaseUntil.getTime() > input.now.getTime() &&
        current.leaseOwner !== input.runId
      ) {
        return { state: 'leased' };
      }

      const attempt = Number(current.attempts || 0) + 1;
      if (attempt > input.job.maxAttempts) {
        return { state: 'attempts_exhausted' };
      }

      const leaseUntilAt = new Date(input.now.getTime() + input.job.leaseDurationMs);
      transaction.set(
        ref,
        {
          idempotencyKey: leaseId(input.runDate, input.job.id),
          runDate: input.runDate,
          jobId: input.job.id,
          status: 'running',
          attempts: attempt,
          leaseOwner: input.runId,
          leaseUntil: leaseUntilAt,
          startedAt: input.now,
          updatedAt: input.now,
        },
        { merge: true },
      );
      transaction.set(executionCollection.doc(executionId(input.runId, input.job.id, attempt)), {
        runId: input.runId,
        runDate: input.runDate,
        jobId: input.job.id,
        attempt,
        status: 'running',
        startedAt: input.now,
      });

      return { state: 'acquired', attempt };
    });
  },

  async finishAttempt(input) {
    const leaseRef = adminDb.collection(LEASES).doc(leaseId(input.runDate, input.jobId));
    const executionRef = adminDb
      .collection(EXECUTIONS)
      .doc(executionId(input.runId, input.jobId, input.attempt));

    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(leaseRef);
      const lease = snapshot.data() as { leaseOwner?: string; attempts?: number } | undefined;
      if (lease?.leaseOwner !== input.runId || lease.attempts !== input.attempt) {
        throw new Error('CRON_LEASE_OWNERSHIP_LOST');
      }

      transaction.set(
        leaseRef,
        {
          status: 'completed',
          outcome: input.outcome,
          resultCode: input.code || null,
          leaseUntil: input.completedAt,
          completedAt: input.completedAt,
          updatedAt: input.completedAt,
        },
        { merge: true },
      );
      transaction.set(
        executionRef,
        {
          status: input.outcome,
          resultCode: input.code || null,
          durationMs: input.durationMs,
          metrics: input.metrics || {},
          completedAt: input.completedAt,
        },
        { merge: true },
      );
    });
  },

  async failAttempt(input) {
    const leaseRef = adminDb.collection(LEASES).doc(leaseId(input.runDate, input.jobId));
    const executionRef = adminDb
      .collection(EXECUTIONS)
      .doc(executionId(input.runId, input.jobId, input.attempt));

    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(leaseRef);
      const lease = snapshot.data() as { leaseOwner?: string; attempts?: number } | undefined;
      if (lease?.leaseOwner !== input.runId || lease.attempts !== input.attempt) {
        throw new Error('CRON_LEASE_OWNERSHIP_LOST');
      }

      transaction.set(
        leaseRef,
        {
          status: 'failed',
          errorCode: input.errorCode,
          leaseUntil: input.failedAt,
          failedAt: input.failedAt,
          updatedAt: input.failedAt,
        },
        { merge: true },
      );
      transaction.set(
        executionRef,
        {
          status: 'failed',
          errorCode: input.errorCode,
          durationMs: input.durationMs,
          failedAt: input.failedAt,
        },
        { merge: true },
      );
    });
  },

  async recordSkipped(input) {
    await adminDb
      .collection(EXECUTIONS)
      .doc(executionId(input.runId, input.jobId, 'skipped'))
      .set({ ...input });
  },

  async finishRun(input) {
    await adminDb.collection(RUNS).doc(input.runId).set(
      {
        status: input.status,
        completedAt: input.completedAt,
        durationMs: input.durationMs,
        counts: input.counts,
      },
      { merge: true },
    );
  },
};
