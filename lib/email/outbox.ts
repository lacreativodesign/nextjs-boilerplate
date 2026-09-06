import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { sendEmail } from '@/lib/email/email-service';
import { resolveTenantSender, type TenantSenderSource } from '@/lib/email/tenant-sender';

/** Durable email outbox for tenant-business and platform notification mail. */
export type OutboxStatus = 'queued' | 'sent' | 'failed' | 'dead_letter';

export const OUTBOX_COLLECTION = 'email_outbox';
export const MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [1, 5, 15, 60, 240, 720];
const DELIVERY_LEASE_MS = 5 * 60_000;

function nextAttemptAt(attempts: number, now: Date): string {
  const index = Math.max(0, Math.min(attempts - 1, BACKOFF_MINUTES.length - 1));
  return new Date(now.getTime() + BACKOFF_MINUTES[index] * 60_000).toISOString();
}

function safeErrorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  return message.replace(/[\w.+-]{1,64}@[\w.-]{1,255}/g, '[address]').slice(0, 300);
}

function dedupeDocumentId(key: string): string {
  return `dedupe_${crypto.createHash('sha256').update(key).digest('hex')}`;
}

export type TenantEmailInput = {
  tenantId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  messageClass: string;
  entityId?: string;
  tenant?: TenantSenderSource | null;
};

export type PlatformEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  messageClass: string;
  entityId?: string;
  /** Stable key for callers that must survive a retry after their own commit/delete fails. */
  idempotencyKey?: string;
};

export type EnqueueResult = {
  id: string;
  status: OutboxStatus;
};

type OutboxIdentity = { fromEmail?: string; fromName?: string; replyTo?: string };

type DurableEmailInput = {
  tenantId?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  messageClass: string;
  entityId?: string;
  identity?: OutboxIdentity;
  idempotencyKey?: string;
};

type OutboxRecord = {
  tenantId?: string;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  identity?: OutboxIdentity;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
};

type DeliveryClaim = OutboxRecord & {
  leaseToken: string;
  attempts: number;
};

/** Tenant business mail uses the tenant sender/provider when configured. */
export async function enqueueTenantEmail(input: TenantEmailInput): Promise<EnqueueResult> {
  const identity = resolveTenantSender(input.tenant);
  return enqueueDurableEmail({
    tenantId: input.tenantId,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    messageClass: input.messageClass,
    entityId: input.entityId,
    identity,
  });
}

/**
 * Platform mail intentionally carries no tenantId, so security/app-notification messages
 * are sent through Bizosto's own provider rather than a tenant-controlled account.
 */
export async function enqueuePlatformEmail(input: PlatformEmailInput): Promise<EnqueueResult> {
  // Fields are picked explicitly rather than spread. A caller holding an object that also
  // carries a tenantId or a sender identity must not be able to widen platform mail into
  // tenant-routed mail: that would put a Bizosto security message in a third party's
  // provider account and sending logs.
  return enqueueDurableEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    messageClass: input.messageClass,
    entityId: input.entityId,
    idempotencyKey: input.idempotencyKey,
  });
}

async function persistRecord(
  ref: FirebaseFirestore.DocumentReference,
  record: Record<string, unknown>,
  idempotent: boolean,
): Promise<{ created: boolean; existing?: OutboxRecord }> {
  if (!idempotent) {
    await ref.set(record);
    return { created: true };
  }

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      return { created: false, existing: snap.data() as OutboxRecord };
    }
    tx.set(ref, record);
    return { created: true };
  });
}

/**
 * Persists BEFORE calling the provider. A process dying after persistence but before the
 * first provider call leaves a queued row that the worker can reclaim. This function never
 * throws into the already-committed business mutation.
 *
 * When an idempotency key is supplied, the outbox document id is deterministic and its
 * creation is transactional. This lets a caller safely retry after its own post-enqueue
 * commit fails without creating a second outbound message.
 */
async function enqueueDurableEmail(input: DurableEmailInput): Promise<EnqueueResult> {
  const now = new Date();
  const identity = input.identity || {};
  const ref = input.idempotencyKey
    ? adminDb.collection(OUTBOX_COLLECTION).doc(dedupeDocumentId(input.idempotencyKey))
    : adminDb.collection(OUTBOX_COLLECTION).doc();
  const record = {
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text ?? null,
    messageClass: input.messageClass,
    entityId: input.entityId ?? null,
    identity,
    status: 'queued' as OutboxStatus,
    attempts: 0,
    nextAttemptAt: now.toISOString(),
    leaseToken: null,
    leaseExpiresAt: null,
    lastError: null as string | null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  let persisted: { created: boolean; existing?: OutboxRecord };
  try {
    persisted = await persistRecord(ref, record, Boolean(input.idempotencyKey));
  } catch (error) {
    console.error('[OUTBOX] failed to persist message:', safeErrorSummary(error));
    try {
      await sendEmail({
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...identity,
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      });
      return { id: '', status: 'sent' };
    } catch {
      return { id: '', status: 'failed' };
    }
  }

  if (!persisted.created && persisted.existing) {
    const existing = persisted.existing;
    if (existing.status === 'sent' || existing.status === 'dead_letter') {
      return { id: ref.id, status: existing.status };
    }
    const retried = await attemptDelivery(ref.id, existing, now);
    return { id: ref.id, status: retried || existing.status };
  }

  const status = (await attemptDelivery(ref.id, record, now)) || 'queued';
  return { id: ref.id, status };
}

/**
 * Atomically leases one due row. Status stays queued/failed while leased, so a crashed
 * worker becomes retryable automatically after the short lease expires. The transaction
 * prevents two distributed serverless instances from sending the same due row at once.
 */
async function claimDelivery(id: string, now: Date): Promise<DeliveryClaim | null> {
  const ref = adminDb.collection(OUTBOX_COLLECTION).doc(id);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const record = snap.data() as OutboxRecord;
    if (record.status !== 'queued' && record.status !== 'failed') return null;

    const dueAt = record.nextAttemptAt ? new Date(record.nextAttemptAt).getTime() : 0;
    if (Number.isFinite(dueAt) && dueAt > now.getTime()) return null;

    const leaseUntil = record.leaseExpiresAt ? new Date(record.leaseExpiresAt).getTime() : 0;
    if (Number.isFinite(leaseUntil) && leaseUntil > now.getTime()) return null;

    const attempts = Number(record.attempts || 0) + 1;
    const leaseToken = crypto.randomBytes(18).toString('hex');
    const leaseExpiresAt = new Date(now.getTime() + DELIVERY_LEASE_MS).toISOString();

    tx.update(ref, {
      attempts,
      leaseToken,
      leaseExpiresAt,
      updatedAt: now.toISOString(),
    });

    return { ...record, attempts, leaseToken, leaseExpiresAt };
  });
}

async function finishDelivery(
  id: string,
  claim: DeliveryClaim,
  update: Record<string, unknown>,
): Promise<boolean> {
  const ref = adminDb.collection(OUTBOX_COLLECTION).doc(id);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const current = snap.data() as OutboxRecord;
    if (current.leaseToken !== claim.leaseToken) return false;
    tx.update(ref, {
      ...update,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    return true;
  });
}

/**
 * Records a completed send, retrying the finalizing transaction a bounded number of times.
 *
 * The provider has already accepted the message by this point, so a lost finalization is
 * the one case that can put a second copy in a customer's inbox: the row would keep its
 * queued/failed status and be reclaimed once the lease expires. Contention against a single
 * document is the likely cause and it clears on a retry, so retry rather than accept the
 * duplicate. `false` (lease no longer ours) is a decision, not a transient fault, and is
 * returned immediately.
 */
async function finalizeSent(
  id: string,
  claim: DeliveryClaim,
  update: Record<string, unknown>,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await finishDelivery(id, claim, update);
    } catch {
      if (attempt === 3) {
        console.error('[OUTBOX] message was delivered but the send could not be recorded');
        return false;
      }
    }
  }
  return false;
}

/** Shared first-attempt/retry path. Null means another worker owns the current lease. */
async function attemptDelivery(
  id: string,
  _record: OutboxRecord,
  now: Date,
): Promise<OutboxStatus | null> {
  const claim = await claimDelivery(id, now);
  if (!claim) return null;

  // The provider call is deliberately isolated from finalization. When both shared one
  // try/catch, a Firestore fault while recording a SUCCESSFUL send was caught as a delivery
  // failure: the row was rescheduled, the attempt counter advanced toward dead-letter, and
  // the next drain sent the customer a second copy of a message that had already left. A
  // send that happened is never recorded as one that did not.
  let sendError: unknown;
  let delivered = false;
  try {
    await sendEmail({
      to: claim.to,
      subject: claim.subject,
      html: claim.html,
      ...(claim.text ? { text: claim.text } : {}),
      ...(claim.identity || {}),
      ...(claim.tenantId ? { tenantId: claim.tenantId } : {}),
    });
    delivered = true;
  } catch (error) {
    sendError = error;
  }

  if (delivered) {
    const finalized = await finalizeSent(id, claim, {
      status: 'sent',
      sentAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextAttemptAt: null,
      lastError: null,
    });
    return finalized ? 'sent' : null;
  }

  const attempts = claim.attempts;
  const exhausted = attempts >= MAX_ATTEMPTS;
  const status: OutboxStatus = exhausted ? 'dead_letter' : 'failed';

  const finalized = await finishDelivery(id, claim, {
    status,
    lastError: safeErrorSummary(sendError),
    nextAttemptAt: exhausted ? null : nextAttemptAt(attempts, now),
    updatedAt: now.toISOString(),
  }).catch(() => {
    console.error('[OUTBOX] failed to record delivery failure');
    return false;
  });

  return finalized ? status : null;
}

export type DrainResult = {
  claimed: number;
  sent: number;
  failed: number;
  deadLettered: number;
};

/** Retries due queued AND failed messages under a distributed Firestore lease. */
export async function drainOutbox(limit = 50, now = new Date()): Promise<DrainResult> {
  const result: DrainResult = { claimed: 0, sent: 0, failed: 0, deadLettered: 0 };

  const due = await adminDb
    .collection(OUTBOX_COLLECTION)
    .where('status', 'in', ['queued', 'failed'])
    .where('nextAttemptAt', '<=', now.toISOString())
    .orderBy('nextAttemptAt', 'asc')
    .limit(limit)
    .get();

  for (const doc of due.docs) {
    const status = await attemptDelivery(doc.id, doc.data() as OutboxRecord, now);
    if (!status) continue;
    result.claimed += 1;
    if (status === 'sent') result.sent += 1;
    else if (status === 'dead_letter') result.deadLettered += 1;
    else result.failed += 1;
  }

  return result;
}
