import { adminDb } from '@/lib/firebaseAdmin';
import type { DailyJobContext, DailyJobRunResult } from '@/lib/cron/types';

/**
 * Scheduled report definitions exist, but no certified renderer/delivery worker consumes
 * them. Detect due work and make that gap observable; never mark a queued report complete.
 */
export async function inspectDueReportSchedules(
  context: DailyJobContext,
): Promise<DailyJobRunResult> {
  const snapshot = await adminDb
    .collection('report_schedules')
    .where('nextRunAt', '<=', context.startedAt)
    .limit(20)
    .get();
  const dueCount = snapshot.docs.filter((doc) => doc.data()?.schedule?.enabled !== false).length;

  if (dueCount === 0) {
    return { outcome: 'succeeded', metrics: { dueSchedules: 0 } };
  }

  await adminDb
    .collection('cron_owner_blocks')
    .doc('scheduled-reports')
    .set(
      {
        status: 'owner_decision_required',
        reasonCode: 'SCHEDULED_REPORT_EXECUTOR_NOT_CERTIFIED',
        dueCount,
        truncated: snapshot.size === 20,
        orchestrationRunId: context.runId,
        observedAt: context.startedAt,
        updatedAt: new Date(),
      },
      { merge: true },
    );

  return {
    outcome: 'blocked',
    code: 'OWNER_DECISION_REQUIRED_REPORT_EXECUTION',
    metrics: { dueSchedules: dueCount, truncated: snapshot.size === 20 },
  };
}
