import fs from 'fs';
import path from 'path';

/** MAIL-5 / PR5 — tenant email is durable across provider failure and process death. */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const OUTBOX = 'lib/email/outbox.ts';
const WORKER = 'app/api/cron/email-outbox/route.ts';
const ORCHESTRATOR = 'lib/cron/daily-orchestrator.ts';

const QUEUED_SENDS = [
  'app/api/cron/generate-invoices/route.ts',
  'app/api/cron/invoice-reminders/route.ts',
];

describe('MAIL-5: the record is written before the provider is called', () => {
  const src = active(OUTBOX);

  it('persists first, then attempts delivery', () => {
    const writeAt = src.indexOf('await ref.set(record)');
    const sendAt = src.indexOf('attemptDelivery(ref.id');
    expect(writeAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(writeAt);
  });

  it('starts queued rather than optimistically sent', () => {
    expect(src).toContain("status: 'queued'");
  });

  it('still tries to send when the queue itself is unavailable', () => {
    const fallback = src.slice(src.indexOf('[OUTBOX] failed to persist message'));
    expect(fallback).toContain('sendEmail(');
  });

  it('never throws at the caller', () => {
    const fn = src.slice(
      src.indexOf('export async function enqueueTenantEmail'),
      src.indexOf('async function claimDelivery'),
    );
    expect(fn).toContain('try {');
    expect(fn).toContain('catch');
    expect(fn).not.toContain('throw');
  });
});

describe('PR5: a crash after persistence cannot strand queued mail forever', () => {
  const src = active(OUTBOX);

  it('the worker selects both queued and failed due records', () => {
    expect(src).toContain(".where('status', 'in', ['queued', 'failed'])");
    expect(src).toContain(".where('nextAttemptAt', '<=', now.toISOString())");
  });

  it('claims delivery inside a Firestore transaction', () => {
    expect(src).toContain('async function claimDelivery');
    expect(src).toContain('adminDb.runTransaction');
    expect(src).toContain('leaseToken');
    expect(src).toContain('leaseExpiresAt');
  });

  it('rejects an unexpired lease and lets an abandoned lease expire', () => {
    expect(src).toContain('leaseUntil > now.getTime()');
    expect(src).toContain('DELIVERY_LEASE_MS');
  });

  it('only the worker holding the lease may finalize the row', () => {
    expect(src).toContain('current.leaseToken !== claim.leaseToken');
    expect(src).toContain('leaseToken: null');
    expect(src).toContain('leaseExpiresAt: null');
  });

  it('uses no process-local mutex as a distributed lock', () => {
    expect(src).not.toMatch(/\bMutex\b|globalThis\.__|new Map\([^)]*lock/i);
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
    expect(src).toContain("'dead_letter'");
    expect(src).toContain('nextAttemptAt: exhausted ? null :');
  });

  it('uses the same attempt path for inline delivery and retries', () => {
    const calls = src.match(/attemptDelivery\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('MAIL-5: the queue never becomes a directory of customers', () => {
  const src = active(OUTBOX);

  it('strips addresses out of stored provider errors and caps their length', () => {
    // Pinned by shape, not by the exact literal: the quantifiers are bounded so a hostile
    // provider error cannot drive super-linear backtracking, and RFC 5321's 64/255 limits
    // keep every real address matching. Behavioural proof that a recipient never reaches
    // lastError is in __tests__/api/pr5-email-outbox-behaviour.test.ts.
    expect(src).toContain('safeErrorSummary');
    expect(src).toMatch(
      /replace\(\s*\/\[\\w\.\+-\]\{1,\d+\}@\[\\w\.-\]\{1,\d+\}\/g,\s*'\[address\]'/,
    );
    expect(src).toContain('.slice(0, 300)');
  });

  it('logs counts only, never a recipient or a tenant', () => {
    const worker = active(WORKER);
    expect(worker).toContain('claimed=');
    expect(worker).not.toMatch(/console\.log\([^)]*\b(to|recipient|email|tenantId)\b/);
  });
});

describe('PR5: one scheduled trigger still reaches the outbox worker', () => {
  it('protects the worker with CRON_SECRET', () => {
    const src = active(WORKER);
    expect(src).toContain('Bearer ${CRON_SECRET}');
    expect(src).toContain("CRON_SECRET === 'change-me-in-production'");
  });

  it('drains due messages', () => {
    expect(active(WORKER)).toContain('drainOutbox()');
  });

  it('schedules only daily-tasks in Vercel and dispatches the outbox from there', () => {
    const cfg = JSON.parse(read('vercel.json')) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(cfg.crons).toEqual([{ path: '/api/cron/daily-tasks', schedule: '0 0 * * *' }]);
    expect(active(ORCHESTRATOR)).toContain("path: '/api/cron/email-outbox'");
  });

  it('bounds a single retry drain', () => {
    const src = active(OUTBOX);
    expect(src).toContain('drainOutbox(limit = 50');
    expect(src).toContain('.limit(limit)');
  });

  it('has the composite index its query needs', () => {
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

describe('MAIL-5: customer-facing invoice mail is durable', () => {
  it.each(QUEUED_SENDS)('%s enqueues rather than sending inline', (rel) => {
    const src = active(rel);
    expect(src).toContain('enqueueTenantEmail(');
    expect(src).not.toMatch(/await sendEmail\(/);
  });

  it.each(QUEUED_SENDS)('%s labels the message class for operators', (rel) => {
    expect(active(rel)).toContain('messageClass:');
  });

  it('snapshots the tenant sender identity at enqueue time', () => {
    const src = active(OUTBOX);
    expect(src).toContain('resolveTenantSender(input.tenant)');
    const record = src.slice(src.indexOf('const record = {'));
    expect(record.slice(0, 900)).toContain('identity,');
  });
});
