import { adminDb } from '@/lib/firebaseAdmin';
import type { DailyJobContext, DailyJobRunResult } from '@/lib/cron/types';

/**
 * A full multi-tenant export has no honest completion guarantee inside the remaining
 * Hobby function budget. Record a durable, idempotent coordination item so operations
 * can see the due backup without pretending the export completed.
 */
export async function coordinateDailyBackup(context: DailyJobContext): Promise<DailyJobRunResult> {
  await adminDb.collection('backup_coordination').doc(context.runDate).set(
    {
      runDate: context.runDate,
      orchestrationRunId: context.runId,
      status: 'owner_decision_required',
      reasonCode: 'HOBBY_RUNTIME_CANNOT_GUARANTEE_FULL_EXPORT',
      manualExportRoute: '/api/cron/backup',
      requestedAt: context.startedAt,
      updatedAt: new Date(),
    },
    { merge: true },
  );

  return {
    outcome: 'blocked',
    code: 'OWNER_DECISION_REQUIRED_BACKUP_EXECUTION',
  };
}
