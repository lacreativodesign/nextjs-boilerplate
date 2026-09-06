import fs from 'fs';
import path from 'path';
import { digestRenderingForTest } from '@/lib/notifications/digest-worker';
import type { NotificationDigestItem } from '@/types/notifications';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

function item(
  overrides: Partial<NotificationDigestItem> = {},
): NotificationDigestItem & { id: string } {
  return {
    id: 'digest-item-1',
    tenantId: 'tenant-a',
    userId: 'user-a',
    eventType: 'invoice_overdue',
    title: 'Invoice update',
    message: 'Payment is due',
    channels: ['in_app', 'email'],
    createdAt: {} as NotificationDigestItem['createdAt'],
    scheduledFor: {} as NotificationDigestItem['scheduledFor'],
    frequency: 'daily',
    ...overrides,
  };
}

describe('PR5 notification digest durability', () => {
  const worker = read('lib/notifications/digest-worker.ts');

  it('uses the durable platform outbox rather than direct provider send', () => {
    expect(worker).toContain('enqueuePlatformEmail({');
    expect(worker).not.toContain('sendEmail({');
    expect(worker).toContain('idempotencyKey:');
  });

  it('deletes queue rows per recipient group rather than bulk-deleting the full snapshot', () => {
    expect(worker).toContain('async function deleteItems');
    expect(worker).toContain('await deleteItems(items)');
    expect(worker).not.toContain('snapshot.docs.forEach((doc) => batch.delete(doc.ref))');
  });

  it('retains a group when both durable persistence and direct fallback failed', () => {
    // Behavioural proof that the rows really survive to the next run — and that the group is
    // abandoned before its queue rows are deleted — is in
    // __tests__/api/pr5-notification-digest-behaviour.test.ts.
    expect(worker).toContain("if (!queued.id && queued.status !== 'sent')");
    expect(worker).toContain('result.retainedForRetry += items.length');
    // The group is abandoned at that point rather than falling through to deleteItems.
    const retain = worker.slice(worker.indexOf("if (!queued.id && queued.status !== 'sent')"));
    expect(retain.slice(0, retain.indexOf('}'))).toMatch(/\breturn;/);
  });

  it('isolates each recipient group so one failure cannot starve the queue', () => {
    // The scan is ordered by scheduledFor, so before this a permanently failing row at the
    // head threw out of the batch and every later recipient was never processed at all.
    const loop = worker.slice(worker.indexOf('for (const items of grouped.values())'));
    expect(loop.slice(0, loop.indexOf('async function'))).toMatch(
      /try \{[\s\S]*await processGroup\([\s\S]*\} catch/,
    );
    expect(worker).toContain('result.retainedForRetry += items.length');
  });

  it('dead-letters undeliverable or cross-tenant recipients instead of silently dropping them', () => {
    expect(worker).toContain("reason: 'recipient_email_missing'");
    expect(worker).toContain("reason: 'recipient_missing_cross_tenant_or_inactive'");
    expect(worker).toContain('collection(DEAD_LETTER_COLLECTION)');
  });

  it('uses a deterministic in-app digest id so a retry cannot duplicate it', () => {
    expect(worker).toContain("const id = `digest_${crypto.createHash('sha256')");
    // Written at that id with merge, so replaying a group rewrites one document instead of
    // adding a second. Behavioural proof is in the digest behaviour suite.
    const write = worker.slice(worker.indexOf('async function writeInAppDigest'));
    expect(write).toMatch(/collection\('notifications'\)\s*\.doc\(id\)\s*\.set\(/);
    expect(write).toContain('{ merge: true }');
    expect(write).not.toContain("collection('notifications').add(");
  });
});

describe('PR5 digest rendering safety', () => {
  it('escapes notification-controlled HTML', () => {
    const html = digestRenderingForTest.buildDigestHtml(
      [
        item({
          title: '<img src=x onerror=alert(1)>',
          message: '<script>alert(1)</script>',
          actionLabel: '<b>Open</b>',
        }),
      ],
      'daily',
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Open</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('rejects javascript and protocol-relative action links', () => {
    expect(digestRenderingForTest.safeActionUrl('javascript:alert(1)')).toBeNull();
    expect(digestRenderingForTest.safeActionUrl('//evil.example/path')).toBeNull();
  });

  it('turns an internal relative path into an application URL', () => {
    expect(digestRenderingForTest.safeActionUrl('/notifications')).toMatch(
      /^https:\/\/.*\/notifications$/,
    );
  });
});

describe('PR5 legacy notification facades cannot reintroduce the old vulnerabilities', () => {
  const preferences = read('lib/notifications/preferences.ts');
  const daily = read('app/api/cron/daily-tasks/route.ts');

  it('delegates legacy unsubscribe helpers to the signed implementation', () => {
    expect(preferences).toContain('buildNotificationUnsubscribeToken');
    expect(preferences).toContain('parseNotificationUnsubscribeToken(token)');
    expect(preferences).not.toContain(
      '`${normalizeTenantId(params.tenantId)}:${params.userId}:${params.eventType}`',
    );
  });

  it('delegates legacy digest processing and daily tasks use the safe worker directly', () => {
    expect(preferences).toContain('processNotificationDigestBatch(frequency, now)');
    expect(daily).toContain("processNotificationDigestBatch('daily')");
  });
});
