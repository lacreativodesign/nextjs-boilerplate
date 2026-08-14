import { adminDb } from '@/lib/firebaseAdmin';
import { sendEmail } from '@/lib/email/email-service';
import { resolveTenantSender, type TenantSenderSource } from '@/lib/email/tenant-sender';

/**
 * Durable outbox for tenant business email (MAIL-5).
 *
 * Every customer-facing send was fire-and-forget. The invoice generator shows what that
 * costs: it creates the invoice, calls sendEmail() inside a try/catch, logs a line if the
 * provider is down, and moves on. The invoice exists and is owed; the customer never
 * receives it; nothing retries; and the tenant's finance screen shows an invoice sent. A
 * transient Resend outage at 01:00 on the first of the month silently un-bills a month of
 * recurring revenue for every tenant at once, and the first anyone knows is when nobody
 * pays.
 *
 * The reminder cron is better by accident rather than design — a throw leaves
 * `lastReminderSent` unwritten, so the next daily run tries again. That is a retry with a
 * 24-hour interval, no attempt limit, and no record of why it failed.
 *
 * An outbox makes the send a durable fact rather than a side effect:
 *
 *   - The record is written BEFORE the provider is called, so a process that dies
 *     mid-send leaves evidence rather than silence.
 *   - Delivery is attempted inline, because the common case is that it works and the
 *     caller should not wait for a worker.
 *   - A failure is retried with exponential backoff by a cron worker, bounded, and then
 *     dead-lettered where an operator can see it.
 *
 * What this deliberately does NOT do: provider webhooks, bounce and complaint
 * suppression, or per-tenant provider credentials. Those need a provider adapter layer
 * that does not exist yet. This is the durability half, which is what stops mail being
 * lost; the delivery-feedback half comes with BYOK.
 */

/** Terminal and non-terminal states a queued message can be in. */
export type OutboxStatus = 'queued' | 'sent' | 'failed' | 'dead_letter';

export const OUTBOX_COLLECTION = 'email_outbox';

/**
 * Give up after this many attempts.
 *
 * Six attempts spread over the backoff below spans roughly a day and a half. Past that a
 * failure is almost never transient — a wrong address, a suspended provider account, a
 * blocked domain — and retrying forever would bury the real ones.
 */
export const MAX_ATTEMPTS = 6;

/**
 * Backoff in minutes, indexed by attempt number.
 *
 * Front-loaded because most provider failures are brief, then widening so a sustained
 * outage does not generate thousands of pointless calls.
 */
const BACKOFF_MINUTES = [1, 5, 15, 60, 240, 720];

function nextAttemptAt(attempts: number, now: Date): string {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/**
 * Provider errors are not always safe to store.
 *
 * A failure message can echo the recipient address back, and the outbox is read by Super
 * Admin tooling that must not become a directory of tenants' customers. Only the shape of
 * the error is kept.
 */
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
  /** What this message is, for operators reading the queue. Never free-form user text. */
  messageClass: string;
  /** Ties a queued message back to the invoice or lead that caused it. */
  entityId?: string;
  /** Resolved once at enqueue time, so a retry sends under the identity that was intended. */
  tenant?: TenantSenderSource | null;
};

export type EnqueueResult = {
  id: string;
  status: OutboxStatus;
};

/**
 * Records a tenant-to-customer message and attempts delivery.
 *
 * Never throws. A caller has already committed the business fact — the invoice exists, the
 * lead is captured — and an email failure must not roll that back or surface as a request
 * error. The durable record is what makes swallowing the error acceptable: the message is
 * queued and will be retried, rather than lost the way it was before.
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
    // Snapshotted rather than re-resolved on retry: if a tenant changes their branding
    // between the invoice going out and a retry, the retry should still be the message
    // that was intended, not a differently-addressed one.
    identity,
    status: 'queued' as OutboxStatus,
    attempts: 0,
    nextAttemptAt: now.toISOString(),
    lastError: null as string | null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    // Written BEFORE the provider call. A process that dies mid-send leaves a queued
    // record the worker will pick up, rather than nothing at all.
    await ref.set(record);
  } catch (error) {
    // The queue itself is unavailable. Try the send anyway — losing the message is worse
    // than losing the record of it.
    console.error('[OUTBOX] failed to persist message:', safeErrorSummary(error));
    try {
      await sendEmail({ to: input.to, subject: input.subject, html: input.html, ...identity });
      return { id: '', status: 'sent' };
    } catch {
      return { id: '', status: 'failed' };
    }
  }

  const status = await attemptDelivery(ref.id, record, now);
  return { id: ref.id, status };
}

type OutboxRecord = {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  identity?: { fromEmail?: string; fromName?: string; replyTo?: string };
  attempts: number;
};

/**
 * One delivery attempt against a stored record. Shared by the enqueue path and the worker
 * so both count attempts and apply backoff the same way.
 */
async function attemptDelivery(id: string, record: OutboxRecord, now: Date): Promise<OutboxStatus> {
  const ref = adminDb.collection(OUTBOX_COLLECTION).doc(id);
  const attempts = Number(record.attempts || 0) + 1;

  try {
    await sendEmail({
      to: record.to,
      subject: record.subject,
      html: record.html,
      ...(record.text ? { text: record.text } : {}),
      ...(record.identity || {}),
    });

    await ref.update({
      status: 'sent',
      attempts,
      sentAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextAttemptAt: null,
    });
    return 'sent';
  } catch (error) {
    const exhausted = attempts >= MAX_ATTEMPTS;
    const status: OutboxStatus = exhausted ? 'dead_letter' : 'failed';

    await ref
      .update({
        status,
        attempts,
        lastError: safeErrorSummary(error),
        // A dead-lettered message stops being picked up; nextAttemptAt is what the worker
        // queries on, so clearing it is what takes it out of rotation.
        nextAttemptAt: exhausted ? null : nextAttemptAt(attempts, now),
        updatedAt: now.toISOString(),
      })
      .catch(() => {
        console.error('[OUTBOX] failed to record delivery failure');
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
 * Retries messages whose backoff has elapsed.
 *
 * Bounded per run so one poisoned batch cannot consume the whole function budget and
 * starve later messages.
 */
export async function drainOutbox(limit = 50, now = new Date()): Promise<DrainResult> {
  const result: DrainResult = { claimed: 0, sent: 0, failed: 0, deadLettered: 0 };

  const due = await adminDb
    .collection(OUTBOX_COLLECTION)
    .where('status', '==', 'failed')
    .where('nextAttemptAt', '<=', now.toISOString())
    .orderBy('nextAttemptAt', 'asc')
    .limit(limit)
    .get();

  for (const doc of due.docs) {
    result.claimed += 1;
    const status = await attemptDelivery(doc.id, doc.data() as OutboxRecord, now);
    if (status === 'sent') result.sent += 1;
    else if (status === 'dead_letter') result.deadLettered += 1;
    else result.failed += 1;
  }

  return result;
}
