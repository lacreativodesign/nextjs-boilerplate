import crypto from 'crypto';
import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { enqueuePlatformEmail } from '@/lib/email/outbox';
import { isUserAccessDisabled } from '@/lib/auth/user-access-state';
import { getAppUrl } from '@/lib/urls';
import type { NotificationDigestItem } from '@/types/notifications';

const DIGEST_COLLECTION = 'notification_digest_queue';
const DEAD_LETTER_COLLECTION = 'dead_letter_notifications';
const APP_URL = getAppUrl();

type Frequency = 'daily' | 'weekly';
type DigestItemWithId = NotificationDigestItem & { id: string };

export type DigestProcessResult = {
  scanned: number;
  groups: number;
  emailQueued: number;
  inAppWritten: number;
  deadLettered: number;
  retainedForRetry: number;
  deleted: number;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeActionUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return `${APP_URL}${raw}`;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Digest failures are logged on a shared platform dashboard: never a recipient address. */
function safeReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  return message.replace(/[\w.+-]{1,64}@[\w.-]{1,255}/g, '[address]').slice(0, 300);
}

/**
 * Deterministic, locale-independent ordering for the digest key.
 *
 * NOT localeCompare: this ordering feeds a SHA-256 idempotency key, and a locale-sensitive
 * comparison would let two runtimes derive different keys for the same item set and send
 * the digest twice. This reproduces the default sort's code-unit order exactly, so keys
 * issued before this comparator existed still match.
 */
function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function digestKey(frequency: Frequency, items: DigestItemWithId[]): string {
  const material = items
    .map((item) => item.id)
    .sort(compareIds)
    .join('|');
  return `${frequency}:${crypto.createHash('sha256').update(material).digest('hex')}`;
}

function subjectFor(frequency: Frequency) {
  return frequency === 'daily' ? 'Daily notification digest' : 'Weekly notification digest';
}

function groupItems(items: DigestItemWithId[]) {
  const groups = new Map<string, DigestItemWithId[]>();
  for (const item of items) {
    const current = groups.get(item.eventType) || [];
    current.push(item);
    groups.set(item.eventType, current);
  }
  return groups;
}

function buildDigestHtml(items: DigestItemWithId[], frequency: Frequency) {
  const sections = Array.from(groupItems(items).entries())
    .map(([eventType, notifications]) => {
      const rows = notifications
        .map((item) => {
          const url = safeActionUrl(item.actionUrl);
          const action = url
            ? `<p><a href="${escapeHtml(url)}">${escapeHtml(item.actionLabel || 'Open')}</a></p>`
            : '';
          return `<li><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p>${action}</li>`;
        })
        .join('');
      return `<h3>${escapeHtml(eventType.replace(/_/g, ' '))}</h3><ul>${rows}</ul>`;
    })
    .join('');

  return `<html><body><h2>${frequency === 'daily' ? 'Daily' : 'Weekly'} Digest</h2>${sections}</body></html>`;
}

function buildDigestText(items: DigestItemWithId[], frequency: Frequency) {
  const lines: string[] = [subjectFor(frequency)];
  for (const [eventType, notifications] of groupItems(items).entries()) {
    lines.push(`\n${eventType.replace(/_/g, ' ')}:`);
    for (const item of notifications) {
      lines.push(`- ${item.title}: ${item.message}`);
      const url = safeActionUrl(item.actionUrl);
      if (url) lines.push(`  ${url}`);
    }
  }
  return lines.join('\n');
}

async function deadLetterGroup(params: {
  tenantId: string;
  userId: string;
  frequency: Frequency;
  reason: string;
  itemCount: number;
}) {
  await adminDb.collection(DEAD_LETTER_COLLECTION).add({
    tenantId: params.tenantId,
    userId: params.userId,
    type: 'notification_digest',
    frequency: params.frequency,
    reason: params.reason,
    itemCount: params.itemCount,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteItems(items: DigestItemWithId[]) {
  const batch = adminDb.batch();
  for (const item of items) {
    batch.delete(adminDb.collection(DIGEST_COLLECTION).doc(item.id));
  }
  await batch.commit();
}

async function writeInAppDigest(
  tenantId: string,
  userId: string,
  frequency: Frequency,
  items: DigestItemWithId[],
) {
  const key = digestKey(frequency, items);
  const material = `${tenantId}:${userId}:${key}`;
  const id = `digest_${crypto.createHash('sha256').update(material).digest('hex')}`;
  await adminDb
    .collection('notifications')
    .doc(id)
    .set(
      {
        id,
        tenantId,
        recipientUid: userId,
        userId,
        recipientRole: null,
        type: 'system',
        title: subjectFor(frequency),
        message: `${items.length} notification${items.length === 1 ? '' : 's'} in your ${frequency} digest.`,
        entityType: null,
        entityId: null,
        isRead: false,
        toUserId: userId,
        body: `${items.length} notification${items.length === 1 ? '' : 's'} in your ${frequency} digest.`,
        read: false,
        deepLink: '/notifications',
        createdBy: null,
        priority: 'normal',
        roleTarget: null,
        metadata: {
          digest: true,
          frequency,
          digestItemIds: items.map((item) => item.id),
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

/**
 * Processes digest queue items one recipient group at a time.
 *
 * The previous worker sent email directly and then deleted the ENTIRE queried snapshot.
 * That lost items for users with no email, and if a later recipient failed it resent every
 * earlier successful group on the next run. PR5 makes each group independent: in-app uses a
 * deterministic id, email is persisted in the durable/idempotent platform outbox, and only
 * that group's queue documents are deleted after their required channels are durable.
 */
export async function processNotificationDigestBatch(
  frequency: Frequency,
  now = new Date(),
): Promise<DigestProcessResult> {
  const snapshot = await adminDb
    .collection(DIGEST_COLLECTION)
    .where('frequency', '==', frequency)
    .where('scheduledFor', '<=', Timestamp.fromDate(now))
    .orderBy('scheduledFor', 'asc')
    .limit(200)
    .get();

  const result: DigestProcessResult = {
    scanned: snapshot.size,
    groups: 0,
    emailQueued: 0,
    inAppWritten: 0,
    deadLettered: 0,
    retainedForRetry: 0,
    deleted: 0,
  };
  if (snapshot.empty) return result;

  const grouped = new Map<string, DigestItemWithId[]>();
  for (const doc of snapshot.docs) {
    const item = { id: doc.id, ...(doc.data() as Omit<NotificationDigestItem, 'id'>) };
    const key = `${item.tenantId}:${item.userId}`;
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  }

  for (const items of grouped.values()) {
    result.groups += 1;
    // One recipient must never be able to stop the queue. Before this, an unexpected fault
    // in any group (a Firestore read, the in-app write, the batch delete) threw out of the
    // whole batch, so every group ordered behind it was never processed — and because the
    // scan is ordered by scheduledFor, a permanently failing item at the head starved the
    // queue for good. A failed group keeps its queue rows and is retried on the next run;
    // its already-durable work is idempotent, so the retry cannot duplicate anything.
    try {
      await processGroup(frequency, items, result);
    } catch (error) {
      result.retainedForRetry += items.length;
      console.error('[DIGEST] recipient group failed, retained for retry:', safeReason(error));
    }
  }

  return result;
}

async function processGroup(
  frequency: Frequency,
  items: DigestItemWithId[],
  result: DigestProcessResult,
): Promise<void> {
  const first = items[0];
  const tenantId = String(first.tenantId || '').trim();
  const userId = String(first.userId || '').trim();

  if (
    !tenantId ||
    !userId ||
    items.some((item) => item.tenantId !== tenantId || item.userId !== userId)
  ) {
    await deadLetterGroup({
      tenantId: tenantId || 'unknown',
      userId: userId || 'unknown',
      frequency,
      reason: 'invalid_or_mixed_digest_scope',
      itemCount: items.length,
    });
    await deleteItems(items);
    result.deadLettered += items.length;
    result.deleted += items.length;
    return;
  }

  const userDoc = await adminDb.collection('users').doc(userId).get();
  const user = userDoc.data() || {};
  if (
    !userDoc.exists ||
    String(user.tenantId || '').trim() !== tenantId ||
    isUserAccessDisabled(user)
  ) {
    await deadLetterGroup({
      tenantId,
      userId,
      frequency,
      reason: 'recipient_missing_cross_tenant_or_inactive',
      itemCount: items.length,
    });
    await deleteItems(items);
    result.deadLettered += items.length;
    result.deleted += items.length;
    return;
  }

  const inAppItems = items.filter((item) => item.channels?.includes('in_app'));
  const emailItems = items.filter((item) => item.channels?.includes('email'));

  if (inAppItems.length) {
    await writeInAppDigest(tenantId, userId, frequency, inAppItems);
    result.inAppWritten += 1;
  }

  if (emailItems.length) {
    const userEmail = String(user.email || '').trim();
    if (!userEmail) {
      await deadLetterGroup({
        tenantId,
        userId,
        frequency,
        reason: 'recipient_email_missing',
        itemCount: emailItems.length,
      });
      result.deadLettered += emailItems.length;
    } else {
      const key = digestKey(frequency, emailItems);
      const queued = await enqueuePlatformEmail({
        to: userEmail,
        subject: subjectFor(frequency),
        html: buildDigestHtml(emailItems, frequency),
        text: buildDigestText(emailItems, frequency),
        messageClass: 'notification_digest',
        entityId: key,
        idempotencyKey: `notification-digest:${tenantId}:${userId}:${key}`,
      });

      // id != '' proves the email is durably in the outbox even when the inline provider
      // attempt failed. A direct fallback send with id='' is safe only when it succeeded.
      if (!queued.id && queued.status !== 'sent') {
        result.retainedForRetry += items.length;
        return;
      }
      result.emailQueued += 1;
    }
  }

  await deleteItems(items);
  result.deleted += items.length;
}

export const digestRenderingForTest = {
  escapeHtml,
  safeActionUrl,
  buildDigestHtml,
  buildDigestText,
};
