import { adminDb } from '@/lib/firebaseAdmin';

/**
 * Transactional webhook idempotency (audit P1).
 *
 * The previous pattern was read-then-write: get(eventId) → if exists return →
 * ...process... → set(eventId). Two concurrent deliveries of the SAME Stripe
 * event both read "not exists" and both process — a race that can double-apply
 * money movement or billing state.
 *
 * This helper claims the event atomically. Firestore's create() fails if the
 * document already exists, so exactly one caller wins the claim; any concurrent
 * or later delivery of the same event id loses and is treated as a duplicate.
 *
 * Lifecycle:
 *   1. claimWebhookEvent(id, type) — atomic. Returns 'claimed' | 'duplicate'.
 *   2. On success:  finalizeWebhookEvent(id, type)  — marks status 'processed'.
 *   3. On failure:  releaseWebhookEvent(id)         — deletes the claim so the
 *                   next Stripe retry can re-process (return non-2xx as well).
 */

const COLLECTION = 'processed_webhook_events';

export type WebhookClaim = 'claimed' | 'duplicate';

export async function claimWebhookEvent(eventId: string, type: string): Promise<WebhookClaim> {
  const ref = adminDb.collection(COLLECTION).doc(eventId);
  try {
    await ref.create({
      eventId,
      type,
      status: 'processing',
      claimedAt: new Date().toISOString(),
    });
    return 'claimed';
  } catch (err: unknown) {
    // ALREADY_EXISTS (gRPC code 6) means another delivery already claimed it.
    const code = (err as { code?: number | string })?.code;
    if (code === 6 || code === 'already-exists') {
      return 'duplicate';
    }
    // Any other error is a real failure — surface it so the route returns 500
    // and Stripe retries rather than silently dropping the event.
    throw err;
  }
}

export async function finalizeWebhookEvent(eventId: string, type: string): Promise<void> {
  await adminDb
    .collection(COLLECTION)
    .doc(eventId)
    .set(
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
    // Best-effort: if the release fails, the claim doc lingers as 'processing'.
    // Stripe will retry; the lingering doc simply means that specific retry is
    // treated as a duplicate. Logged so it is visible, never thrown.
    console.error('[WEBHOOK] Failed to release event claim', eventId, err);
  }
}
