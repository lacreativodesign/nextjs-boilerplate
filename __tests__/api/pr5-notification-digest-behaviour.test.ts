/**
 * PR5 — the notification digest worker, exercised rather than described.
 *
 * __tests__/api/pr5-notification-digest-durability.test.ts asserts that the worker's SOURCE
 * mentions a dead-letter collection, a deterministic in-app id and an idempotency key. Those
 * strings are all present in an implementation that loses every message, so they cannot show
 * that a cross-tenant recipient is actually rejected, that a failing recipient does not
 * replay the ones before it, or that no queue row disappears. Those are runtime properties
 * and are checked here by running the worker.
 *
 * The REAL outbox runs underneath this suite rather than a stub, so "the digest email is
 * idempotent" is proved end to end through the same deduplication path production uses.
 */

import { createInMemoryFirestore } from './test-utils/in-memory-firestore';

const firestore = createInMemoryFirestore();
const sendEmail = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return firestore.adminDb;
  },
}));
jest.mock('@/lib/email/email-service', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));
jest.mock('@/lib/email/tenant-sender', () => ({
  resolveTenantSender: () => ({}),
}));
jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__server_timestamp__' } },
}));
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: (date: Date) => ({ toMillis: () => date.getTime() }),
  },
}));

import { OUTBOX_COLLECTION } from '@/lib/email/outbox';
import { processNotificationDigestBatch } from '@/lib/notifications/digest-worker';

const DIGEST = 'notification_digest_queue';
const DEAD_LETTER = 'dead_letter_notifications';
const NOW = new Date('2026-05-10T09:00:00.000Z');

/** A queue row that is due at NOW. */
function queueItem(id: string, over: Record<string, unknown> = {}) {
  firestore.seed(DIGEST, id, {
    tenantId: 'tenant-a',
    userId: 'user-a',
    eventType: 'invoice_overdue',
    title: 'Invoice overdue',
    message: 'Payment is due',
    channels: ['in_app', 'email'],
    frequency: 'daily',
    scheduledFor: { toMillis: () => NOW.getTime() - 60_000 },
    createdAt: { toMillis: () => NOW.getTime() - 60_000 },
    ...over,
  });
}

function user(id: string, over: Record<string, unknown> = {}) {
  firestore.seed('users', id, {
    tenantId: 'tenant-a',
    email: `${id}@example.com`,
    status: 'active',
    ...over,
  });
}

const queueIds = () =>
  firestore
    .all(DIGEST)
    .map(([id]) => id)
    .sort();
const deadLetterReasons = () =>
  firestore
    .all(DEAD_LETTER)
    .map(([, data]) => String(data.reason))
    .sort();
const outboxRecipients = () =>
  firestore
    .all(OUTBOX_COLLECTION)
    .map(([, data]) => String(data.to))
    .sort();

beforeEach(() => {
  firestore.reset();
  sendEmail.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PR5 digest: delivery is scoped to the tenant that owns the recipient', () => {
  it('delivers to an active in-tenant recipient and clears their queue rows', async () => {
    user('user-a');
    queueItem('item-1');
    queueItem('item-2');

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(result).toMatchObject({ scanned: 2, groups: 1, emailQueued: 1, inAppWritten: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('user-a@example.com');
    expect(queueIds()).toEqual([]);
  });

  it('refuses a recipient whose user record belongs to a different tenant', async () => {
    // The queue row claims tenant-a; the identity says tenant-b. Delivering would leak one
    // tenant's notification content to a user account outside it.
    user('user-a', { tenantId: 'tenant-b' });
    queueItem('item-1');

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.deadLettered).toBe(1);
    expect(deadLetterReasons()).toEqual(['recipient_missing_cross_tenant_or_inactive']);
    // Removed from rotation, but recorded — never silently dropped.
    expect(queueIds()).toEqual([]);
  });

  it('refuses a deactivated recipient', async () => {
    user('user-a', { status: 'inactive' });
    queueItem('item-1');

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.deadLettered).toBe(1);
    expect(deadLetterReasons()).toEqual(['recipient_missing_cross_tenant_or_inactive']);
  });

  it('refuses a recipient whose identity no longer exists', async () => {
    queueItem('item-1');

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.deadLettered).toBe(1);
  });

  it('dead-letters a recipient with no address instead of dropping the row', async () => {
    user('user-a', { email: '' });
    queueItem('item-1', { channels: ['email'] });

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(deadLetterReasons()).toEqual(['recipient_email_missing']);
    expect(result.deadLettered).toBe(1);
  });

  it('keeps two tenants that share a user id apart', async () => {
    firestore.seed('users', 'shared', {
      tenantId: 'tenant-a',
      email: 'a@example.com',
      status: 'active',
    });
    queueItem('a-1', { tenantId: 'tenant-a', userId: 'shared' });
    queueItem('b-1', { tenantId: 'tenant-b', userId: 'shared' });

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(result.groups).toBe(2);
    // tenant-a matches the identity and is delivered; tenant-b does not and is refused.
    expect(outboxRecipients()).toEqual(['a@example.com']);
    expect(deadLetterReasons()).toEqual(['recipient_missing_cross_tenant_or_inactive']);
  });
});

describe('PR5 digest: one recipient cannot stop or replay another', () => {
  it('processes later groups after an unexpected fault in an earlier one', async () => {
    // The regression: every group ran in one try-less loop, so a fault anywhere threw out of
    // the whole batch. Because the scan is ordered by scheduledFor, a permanently failing
    // row at the head starved every later recipient for good.
    user('user-a');
    user('user-b', { email: 'user-b@example.com' });
    queueItem('a-1', { userId: 'user-a' });
    queueItem('b-1', { userId: 'user-b' });

    // The first group's identity read throws.
    firestore.failNext('users', 'user-a', 'get', 'firestore unavailable');

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(result.groups).toBe(2);
    // user-b was still served.
    expect(outboxRecipients()).toEqual(['user-b@example.com']);
    // user-a's row survived for the next run rather than being lost or dead-lettered.
    expect(queueIds()).toEqual(['a-1']);
    expect(result.retainedForRetry).toBe(1);
    expect(deadLetterReasons()).toEqual([]);
  });

  it('does not resend an earlier successful group when a later group is retried', async () => {
    user('user-a');
    user('user-b', { email: 'user-b@example.com' });
    queueItem('a-1', { userId: 'user-a' });
    queueItem('b-1', { userId: 'user-b' });
    firestore.failNext('users', 'user-b', 'get', 'firestore unavailable');

    await processNotificationDigestBatch('daily', NOW);
    expect(outboxRecipients()).toEqual(['user-a@example.com']);
    expect(queueIds()).toEqual(['b-1']);

    // Second run: only the retained group remains, so user-a cannot be mailed twice.
    sendEmail.mockClear();
    await processNotificationDigestBatch('daily', NOW);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('user-b@example.com');
    expect(queueIds()).toEqual([]);
  });

  it('retains a group whose email could not be made durable', async () => {
    user('user-a');
    queueItem('item-1');
    // Both the outbox write and the direct fallback send fail.
    firestore.failNext(OUTBOX_COLLECTION, '*', 'set', 'firestore unavailable');
    sendEmail.mockRejectedValue(new Error('provider down'));

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(result.retainedForRetry).toBe(1);
    expect(result.deleted).toBe(0);
    // The row is still there to try again: required channels were not durable.
    expect(queueIds()).toEqual(['item-1']);
  });
});

describe('PR5 digest: a retry cannot duplicate what already succeeded', () => {
  it('writes the same in-app digest document rather than a second one', async () => {
    user('user-a');
    queueItem('item-1', { channels: ['in_app'] });
    await processNotificationDigestBatch('daily', NOW);

    const afterFirst = firestore.all('notifications');
    expect(afterFirst).toHaveLength(1);

    // The same item comes back around (its delete was lost, or it was re-queued).
    queueItem('item-1', { channels: ['in_app'] });
    await processNotificationDigestBatch('daily', NOW);

    const afterSecond = firestore.all('notifications');
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0][0]).toBe(afterFirst[0][0]);
  });

  it('does not mail the same digest twice when the queue rows come back', async () => {
    user('user-a');
    queueItem('item-1');
    await processNotificationDigestBatch('daily', NOW);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    queueItem('item-1');
    await processNotificationDigestBatch('daily', NOW);

    // The outbox row is keyed by tenant + user + the exact item set, and it is already sent,
    // so the second pass reuses it instead of putting a second copy in the inbox.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(firestore.all(OUTBOX_COLLECTION)).toHaveLength(1);
  });

  it('routes the digest as platform mail, never through a tenant provider', async () => {
    user('user-a');
    queueItem('item-1');

    await processNotificationDigestBatch('daily', NOW);

    const [, record] = firestore.all(OUTBOX_COLLECTION)[0];
    expect(record.tenantId).toBeUndefined();
    expect(record.messageClass).toBe('notification_digest');
    expect(sendEmail.mock.calls[0][0]).not.toHaveProperty('tenantId');
  });
});

describe('PR5 digest: queue rows are accounted for', () => {
  it('never deletes a row before its required channels are durable', async () => {
    user('user-a');
    queueItem('item-1');
    firestore.failNext(OUTBOX_COLLECTION, '*', 'set', 'firestore unavailable');
    sendEmail.mockRejectedValue(new Error('provider down'));

    await processNotificationDigestBatch('daily', NOW);

    expect(queueIds()).toEqual(['item-1']);
  });

  it('rejects a group whose rows disagree about who they belong to', async () => {
    // Ids containing a colon can collide on the `tenantId:userId` grouping key, so the
    // worker re-checks every row in a group against the group it was placed in.
    user('user-a');
    queueItem('mixed-1', { tenantId: 'tenant-a:user', userId: 'a' });
    queueItem('mixed-2', { tenantId: 'tenant-a', userId: 'user:a' });

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(deadLetterReasons()).toEqual(['invalid_or_mixed_digest_scope']);
    expect(result.deadLettered).toBe(2);
  });

  it('leaves rows scheduled for the future and rows of another frequency alone', async () => {
    user('user-a');
    queueItem('due');
    queueItem('later', { scheduledFor: { toMillis: () => NOW.getTime() + 3_600_000 } });
    queueItem('weekly', { frequency: 'weekly' });

    const result = await processNotificationDigestBatch('daily', NOW);

    expect(result.scanned).toBe(1);
    expect(queueIds()).toEqual(['later', 'weekly']);
  });
});
