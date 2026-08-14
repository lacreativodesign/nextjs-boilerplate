import fs from 'fs';
import path from 'path';

/**
 * MAIL-5 — a customer email that fails to send is retried, not lost.
 *
 * Every customer-facing send was fire-and-forget. The invoice generator shows the cost:
 * it creates the invoice, calls sendEmail() inside a try/catch, logs a line if the
 * provider is down, and carries on. The invoice exists and is owed; the customer never
 * receives it; nothing retries; the tenant's finance screen shows an invoice sent. A
 * transient provider outage at 01:00 on the first of the month silently un-bills a month
 * of recurring revenue across every tenant at once, and the first anyone knows is that
 * nobody pays.
 *
 * The reminder cron survived only by accident: a throw left `lastReminderSent` unwritten,
 * so the next daily run tried again. That is a retry with a 24-hour interval, no attempt
 * limit, and no record of why it failed.
 *
 * The outbox makes the send a durable fact — recorded before the provider is called,
 * attempted inline, retried on a widening backoff by a worker, and dead-lettered once
 * a failure stops looking transient.
 *
 * Deliberately out of scope: provider webhooks, bounce and complaint suppression, and
 * per-tenant provider credentials. Those need an adapter layer that does not exist yet.
 * This is the durability half — the half that stops mail being lost.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about the old behaviour is not the behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const OUTBOX = 'lib/email/outbox.ts';
const WORKER = 'app/api/cron/email-outbox/route.ts';

/** Customer-facing sends that must be durable. */
const QUEUED_SENDS = [
  'app/api/cron/generate-invoices/route.ts',
  'app/api/cron/invoice-reminders/route.ts',
];

describe('MAIL-5: the record is written before the provider is called', () => {
  const src = active(OUTBOX);

  it('persists first, then attempts delivery', () => {
    // A process that dies mid-send must leave evidence, not silence.
    const writeAt = src.indexOf('await ref.set(record)');
    const sendAt = src.indexOf('attemptDelivery(ref.id');
    expect(writeAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(writeAt);
  });

  it('starts queued rather than optimistically sent', () => {
    expect(src).toContain("status: 'queued'");
  });

  it('still tries to send when the queue itself is unavailable', () => {
    // Losing the message is worse than losing the record of it.
    const fallback = src.slice(src.indexOf('[OUTBOX] failed to persist message'));
    expect(fallback).toContain('sendEmail(');
  });

  it('never throws at the caller', () => {
    // The business fact is already committed — an invoice exists, a lead is captured — so
    // an email failure must not roll it back or surface as a request error. Asserted on
    // the code rather than the doc comment: `src` here is comment-stripped.
    const fn = src.slice(
      src.indexOf('export async function enqueueTenantEmail'),
      src.indexOf('async function attemptDelivery'),
    );
    expect(fn).toContain('try {');
    expect(fn).toContain('catch');
    // Every exit is a returned result, never a rethrow.
    expect(fn).not.toContain('throw');
  });
});

describe('MAIL-5: retries are bounded and back off', () => {
  const src = active(OUTBOX);

  it('widens the interval instead of hammering a downed provider', () => {
    expect(src).toContain('BACKOFF_MINUTES');
    const backoff = src.slice(src.indexOf('const BACKOFF_MINUTES'));
    expect(backoff.slice(0, 120)).toContain('[1, 5, 15, 60, 240, 720]');
  });

  it('gives up after a bounded number of attempts', () => {
    expect(src).toContain('MAX_ATTEMPTS = 6');
    expect(src).toContain('attempts >= MAX_ATTEMPTS');
  });

  it('dead-letters rather than retrying forever', () => {
    // Past a day and a half a failure is almost never transient, and endless retries bury
    // the ones an operator should look at.
    expect(src).toContain("'dead_letter'");
  });

  it('takes a dead-lettered message out of rotation', () => {
    // nextAttemptAt is what the worker queries on, so clearing it is the removal.
    expect(src).toContain('nextAttemptAt: exhausted ? null :');
  });

  it('counts an attempt on the enqueue path too, not only in the worker', () => {
    // Both paths go through attemptDelivery, so the count and the backoff cannot diverge.
    const calls = src.match(/attemptDelivery\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('MAIL-5: the queue never becomes a directory of customers', () => {
  const src = active(OUTBOX);

  it('strips addresses out of stored provider errors', () => {
    // A failure message often echoes the recipient back, and the outbox is read by Super
    // Admin tooling.
    expect(src).toContain('safeErrorSummary');
    expect(src).toContain('/[\\w.+-]+@[\\w.-]+/g');
  });

  it('caps the stored error length', () => {
    expect(src).toContain('.slice(0, 300)');
  });

  it('logs counts only, never a recipient or a tenant', () => {
    const worker = active(WORKER);
    expect(worker).toContain('claimed=');
    expect(worker).not.toMatch(/console\.log\([^)]*\b(to|recipient|email|tenantId)\b/);
  });
});

describe('MAIL-5: the worker exists and is scheduled', () => {
  it('is protected by the cron secret', () => {
    const src = active(WORKER);
    expect(src).toContain('Bearer ${CRON_SECRET}');
    expect(src).toContain("CRON_SECRET === 'change-me-in-production'");
  });

  it('drains due messages', () => {
    expect(active(WORKER)).toContain('drainOutbox()');
  });

  it('is registered in vercel.json', () => {
    // Without a schedule the outbox is only a log: a failure would be recorded and never
    // tried again, which is no better than the fire-and-forget it replaced.
    const cfg = JSON.parse(read('vercel.json')) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const cron = cfg.crons.find((c) => c.path === '/api/cron/email-outbox');
    expect(cron).toBeDefined();
    // Vercel Hobby rejects anything more frequent than daily at deployment time, so a
    // sub-daily schedule here does not merely run less often — it stops the build.
    // 09:30 is thirty minutes after /api/cron/invoice-reminders, so a failed reminder
    // gets a same-day retry instead of waiting until tomorrow.
    expect(cron?.schedule).toBe('30 9 * * *');
    expect(cron?.schedule).not.toMatch(/^\*\//);
  });

  it('bounds a single run, so one bad batch cannot starve the rest', () => {
    const src = active(OUTBOX);
    expect(src).toContain('drainOutbox(limit = 50');
    expect(src).toContain('.limit(limit)');
  });

  it('has the composite index its query needs', () => {
    // Without it the drain fails at runtime and every queued message stays queued.
    const indexes = JSON.parse(read('firestore.indexes.json')).indexes as Array<{
      collectionGroup: string;
      fields: Array<{ fieldPath: string; order?: string }>;
    }>;
    const shapes = indexes
      .filter((i) => i.collectionGroup === 'email_outbox')
      .map((i) => i.fields.map((f) => `${f.fieldPath}:${f.order}`).join(','));
    expect(shapes).toContain('status:ASCENDING,nextAttemptAt:ASCENDING');
  });
});

describe('MAIL-5: the sends that could be lost now go through it', () => {
  it.each(QUEUED_SENDS)('%s enqueues rather than sending inline', (rel) => {
    const src = active(rel);
    expect(src).toContain('enqueueTenantEmail(');
    expect(src).not.toMatch(/await sendEmail\(/);
  });

  it.each(QUEUED_SENDS)('%s labels the message class for operators', (rel) => {
    expect(active(rel)).toContain('messageClass:');
  });

  it('carries the tenant so the identity is resolved once, at enqueue time', () => {
    // A retry should send the message that was intended, not one re-addressed under
    // branding the tenant changed in the meantime.
    const src = active(OUTBOX);
    expect(src).toContain('resolveTenantSender(input.tenant)');
    const record = src.slice(src.indexOf('const record = {'));
    expect(record.slice(0, 900)).toContain('identity,');
  });
});
