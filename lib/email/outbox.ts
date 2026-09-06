import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { sendEmail } from '@/lib/email/email-service';
import { resolveTenantSender, type TenantSenderSource } from '@/lib/email/tenant-sender';

/** Durable tenant-business email outbox. */
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
  return message.replace(/[\w.+-]+@[\w.-]+/g, '[address]').slice(0, 300);
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

export type EnqueueResult = {
  id: string;
  status: OutboxStatus;
};

type OutboxIdentity = { fromEmail?: string; fromName?: string; replyTo?: string };

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

/**
 * Records a tenant-to-customer message BEFORE calling the provider and then attempts the
 * first delivery inline. The function never throws back into the already-committed business
 * mutation: a persisted message is recoverable by the worker, and an unavailable queue gets
 * one best-effort direct send rather than losing the message without trying.
 */
export async function enqueueTenantEmail(input: TenantEmailInput): Promise<EnqueueResult> {
  const now = new Date();
  const identity = resolveTenantSender(input.tenant);
  const ref = adminDb.collection(OUTBOX_COLLECTION).doc();
  const record = {
    tenantId: input.tenantId,
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

  try {
    await ref.set(record);
  } catch (error) {
    console.error('[OUTBOX] failed to persist message:', safeErrorSummary(error));
    try {
      await sendEmail({
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...identity,
        tenantId: input.tenantId,
      });
      return { id: '', status: 'sent' };
    } catch {
      return { id: '', status: 'failed' };
    }
  }

  // If the process dies after ref.set() and before this call, the row remains `queued` and
  // the worker now queries queued + failed records. That closes the old permanent-loss gap.
  const status = (await attemptDelivery(ref.id, record, now)) || 'queued';
  return { id: ref.id, status };
}

/**
 * Atomically leases one due row. The status remains queued/failed while the lease is held,
 * which means a crashed worker becomes retryable automatically as soon as the short lease
 * expires. A transaction prevents two serverless instances from sending the same due row at
 * the same time.
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

/** Shared first-attempt/retry path. Null means another worker owns the current lease. */
async function attemptDelivery(
  id: string,
  _record: OutboxRecord,
  now: Date,
): Promise<OutboxStatus | null> {
  const claim = await claimDelivery(id, now);
  if (!claim) return null;

  try {
    await sendEmail({
      to: claim.to,
      subject: claim.subject,
      html: claim.html,
      ...(claim.text ? { text: claim.text } : {}),
      ...(claim.identity || {}),
      ...(claim.tenantId ? { tenantId: claim.tenantId } : {}),
    });

    await finishDelivery(id, claim, {
      status: 'sent',
      sentAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextAttemptAt: null,
      lastError: null,
    });
    return 'sent';
  } catch (error) {
    const attempts = claim.attempts;
    const exhausted = attempts >= MAX_ATTEMPTS;
    const status: OutboxStatus = exhausted ? 'dead_letter' : 'failed';

    await finishDelivery(id, claim, {
      status,
      lastError: safeErrorSummary(error),
      nextAttemptAt: exhausted ? null : nextAttemptAt(attempts, now),
      updatedAt: now.toISOString(),
    }).catch(() => {
      console.error('[OUTBOX] failed to record delivery failure');
      return false;
    });

    return status;
  }
}

export type DrainResult = {
  claimed: number;
  sent: number;
  failed: number;
  deadLettered: number;
};

/**
 * Retries due queued AND failed messages. Including `queued` is critical: persistence happens
 * before the first send, so a process crash in that tiny window must leave a recoverable row,
 * not a message that no worker ever selects. Lease acquisition is transactional, making
 * overlapping/manual workers safe across distributed Vercel instances.
 */
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
