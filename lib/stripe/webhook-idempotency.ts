import { adminDb } from '@/lib/firebaseAdmin';

/**
 * Transactional webhook idempotency.
 *
 * Claims are leases rather than permanent "processing" tombstones. A worker that dies
 * after claiming an event must not suppress Stripe retries forever; once the lease is
 * stale, exactly one later delivery may reclaim it transactionally.
 */

const COLLECTION = 'processed_webhook_events';
const CLAIM_STALE_MS = 10 * 60 * 1000;

export type WebhookClaim = 'claimed' | 'duplicate';

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function claimWebhookEvent(eventId: string, type: string): Promise<WebhookClaim> {
  const ref = adminDb.collection(COLLECTION).doc(eventId);

  return adminDb.runTransaction<WebhookClaim>(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    if (!snap.exists) {
      tx.create(ref, {
        eventId,
        type,
        status: 'processing',
        claimedAt: nowIso,
        claimAttempts: 1,
      });
      return 'claimed';
    }

    const data = snap.data() || {};
    if (String(data.status || '') === 'processed') {
      return 'duplicate';
    }

    const claimedAtMs = toMillis(data.claimedAt);
    if (claimedAtMs > 0 && now - claimedAtMs < CLAIM_STALE_MS) {
      return 'duplicate';
    }

    tx.set(
      ref,
      {
        eventId,
        type,
        status: 'processing',
        claimedAt: nowIso,
        reclaimedAt: nowIso,
        claimAttempts: Math.max(1, Number(data.claimAttempts || 1)) + 1,
      },
      { merge: true },
    );
    return 'claimed';
  });
}

export async function finalizeWebhookEvent(eventId: string, type: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(eventId).set(
    {
      eventId,
      type,
      status: 'processed',
      processedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function releaseWebhookEvent(eventId: string): Promise<void> {
  try {
    await adminDb.collection(COLLECTION).doc(eventId).delete();
  } catch (err) {
    // Best-effort. A failed delete no longer suppresses retries permanently because stale
    // processing claims can be reclaimed by claimWebhookEvent().
    console.error('[WEBHOOK] Failed to release event claim', eventId, err);
  }
}
