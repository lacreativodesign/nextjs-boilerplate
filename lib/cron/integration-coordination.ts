import { adminDb } from '@/lib/firebaseAdmin';
import type { DailyJobContext, DailyJobRunResult } from '@/lib/cron/types';

const INSPECTION_LIMIT = 20;

/**
 * Connected integrations can be synchronized immediately through their authenticated
 * tenant routes. A daily all-tenant provider sweep, however, has no bounded completion
 * guarantee on the current Hobby function because the provider clients do not expose a
 * cooperative timeout/cursor contract. Make that limitation durable and observable
 * instead of enqueueing work that no scheduled worker consumes or overrunning the cron.
 */
export async function inspectDailyIntegrationSchedules(
  context: DailyJobContext,
): Promise<DailyJobRunResult> {
  const snapshot = await adminDb
    .collectionGroup('integrations')
    .where('connected', '==', true)
    .where('settings.scheduleDaily', '==', true)
    .limit(INSPECTION_LIMIT + 1)
    .get();
  const dueCount = Math.min(snapshot.size, INSPECTION_LIMIT);
  const truncated = snapshot.size > INSPECTION_LIMIT;

  if (dueCount === 0) {
    return { outcome: 'succeeded', metrics: { dueIntegrations: 0 } };
  }

  await adminDb.collection('cron_owner_blocks').doc('scheduled-integrations').set(
    {
      status: 'owner_decision_required',
      reasonCode: 'PROVIDER_SYNC_RUNTIME_NOT_BOUNDED',
      dueCount,
      truncated,
      orchestrationRunId: context.runId,
      observedAt: context.startedAt,
      updatedAt: new Date(),
    },
    { merge: true },
  );

  return {
    outcome: 'blocked',
    code: 'OWNER_DECISION_REQUIRED_INTEGRATION_SCHEDULING',
    metrics: { dueIntegrations: dueCount, truncated },
  };
}
