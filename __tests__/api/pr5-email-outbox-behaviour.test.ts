/**
 * PR5 — the durable email outbox, exercised rather than described.
 *
 * __tests__/api/email-outbox.test.ts pins the SHAPE of this module (a lease exists, the
 * worker selects queued and failed rows, no process-local mutex). Those guards are useful
 * and stay, but every one of them passes against an implementation that never delivers
 * anything: they read source text. The invariants that actually decide whether a customer
 * gets their invoice once, twice, or never are runtime properties, so they are tested here
 * by running the code against an in-memory Firestore with serializable transactions.
 */

import { createInMemoryFirestore } from './test-utils/in-memory-firestore';

const firestore = createInMemoryFirestore();
const sendEmail = jest.fn();
const resolveTenantSender = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return firestore.adminDb;
  },
}));
jest.mock('@/lib/email/email-service', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));
jest.mock('@/lib/email/tenant-sender', () => ({
  resolveTenantSender: (...args: unknown[]) => resolveTenantSender(...args),
}));

import {
  MAX_ATTEMPTS,
  OUTBOX_COLLECTION,
  drainOutbox,
  enqueuePlatformEmail,
  enqueueTenantEmail,
} from '@/lib/email/outbox';

const NOW = new Date('2026-03-04T12:00:00.000Z');

const message = (over: Record<string, unknown> = {}) => ({
  to: 'customer@example.com',
  subject: 'Invoice INV-1',
  html: '<p>Invoice</p>',
  messageClass: 'invoice',
  ...over,
});

/** Every row currently in the outbox. */
const rows = () => firestore.all(OUTBOX_COLLECTION);
const onlyRow = () => {
  const all = rows();
  expect(all).toHaveLength(1);
  return all[0][1] as Record<string, unknown>;
};

beforeEach(() => {
  firestore.reset();
  sendEmail.mockReset().mockResolvedValue(undefined);
  resolveTenantSender.mockReset().mockReturnValue({});
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PR5 outbox: the message is durable before the provider is involved', () => {
  it('has already persisted the row by the time the provider is called', async () => {
    let persistedAtSendTime: unknown;
    sendEmail.mockImplementation(async () => {
      persistedAtSendTime = rows();
    });

    await enqueuePlatformEmail(message());

    // The row exists during the provider call, so a process death mid-send leaves work the
    // worker can find — which is the entire point of an outbox.
    expect(persistedAtSendTime).toHaveLength(1);
    expect(onlyRow().status).toBe('sent');
  });

  it('recovers a message stranded in queued by a crash before the first attempt', async () => {
    // A process that died after persisting but before calling the provider leaves exactly
    // this row. It carries no lease and has never been attempted.
    firestore.seed(OUTBOX_COLLECTION, 'stranded', {
      ...message(),
      text: null,
      identity: {},
      status: 'queued',
      attempts: 0,
      nextAttemptAt: '2026-03-04T11:00:00.000Z',
      leaseToken: null,
      leaseExpiresAt: null,
    });

    const result = await drainOutbox(50, NOW);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    expect(firestore.read(OUTBOX_COLLECTION, 'stranded')?.status).toBe('sent');
  });

  it('does not throw into the caller when the queue itself is unavailable', async () => {
    firestore.failNext(OUTBOX_COLLECTION, '*', 'set', 'firestore unavailable');

    const result = await enqueuePlatformEmail(message());

    // Durability was lost, so it falls back to sending directly rather than dropping a
    // customer's mail on the floor — and still reports honestly that there is no row.
    expect(result).toEqual({ id: '', status: 'sent' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('PR5 outbox: idempotency is real, not a deterministic id that overwrites', () => {
  it('does not send twice for a repeated enqueue of the same key', async () => {
    const input = message({ idempotencyKey: 'invoice:INV-1:receipt' });

    const first = await enqueuePlatformEmail(input);
    const second = await enqueuePlatformEmail(input);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('sent');
    expect(rows()).toHaveLength(1);
  });

  it('does not reset an already-sent row back to queued', async () => {
    const input = message({ idempotencyKey: 'invoice:INV-2:receipt' });
    const first = await enqueuePlatformEmail(input);
    const sentAt = firestore.read(OUTBOX_COLLECTION, first.id)?.sentAt;

    await enqueuePlatformEmail(input);

    const record = firestore.read(OUTBOX_COLLECTION, first.id);
    expect(record?.status).toBe('sent');
    expect(record?.attempts).toBe(1);
    expect(record?.sentAt).toBe(sentAt);
  });

  it('leaves a dead-lettered key dead rather than restarting its ladder', async () => {
    const input = message({ idempotencyKey: 'invoice:INV-3:receipt' });
    const first = await enqueuePlatformEmail(input);
    firestore.seed(OUTBOX_COLLECTION, first.id, {
      ...(firestore.read(OUTBOX_COLLECTION, first.id) as Record<string, unknown>),
      status: 'dead_letter',
      nextAttemptAt: null,
    });
    sendEmail.mockClear();

    const again = await enqueuePlatformEmail(input);

    expect(again.status).toBe('dead_letter');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('retries a same-key row that is still queued instead of abandoning it', async () => {
    const input = message({ idempotencyKey: 'invoice:INV-4:receipt' });
    sendEmail.mockRejectedValueOnce(new Error('provider 503'));
    const first = await enqueuePlatformEmail(input);
    expect(firestore.read(OUTBOX_COLLECTION, first.id)?.status).toBe('failed');

    // The caller retried its own commit and enqueued again. Backoff has not elapsed, so the
    // row is not due: the second enqueue must not send, and must not lose the failure state.
    const second = await enqueuePlatformEmail(input);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(second.status).toBe('failed');
    expect(firestore.read(OUTBOX_COLLECTION, first.id)?.attempts).toBe(1);
  });
});

describe('PR5 outbox: exactly one worker delivers a row', () => {
  const dueRow = (id: string) =>
    firestore.seed(OUTBOX_COLLECTION, id, {
      ...message(),
      text: null,
      identity: {},
      status: 'queued',
      attempts: 0,
      nextAttemptAt: '2026-03-04T11:00:00.000Z',
      leaseToken: null,
      leaseExpiresAt: null,
    });

  it('two concurrent workers cannot both send the same message', async () => {
    dueRow('contended');

    const [a, b] = await Promise.all([drainOutbox(50, NOW), drainOutbox(50, NOW)]);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(a.sent + b.sent).toBe(1);
    expect(a.claimed + b.claimed).toBe(1);
  });

  it('will not steal a lease another worker still holds', async () => {
    firestore.seed(OUTBOX_COLLECTION, 'leased', {
      ...message(),
      text: null,
      identity: {},
      status: 'queued',
      attempts: 1,
      nextAttemptAt: '2026-03-04T11:00:00.000Z',
      leaseToken: 'held-by-another-worker',
      leaseExpiresAt: '2026-03-04T12:04:00.000Z', // still in the future at NOW
    });

    const result = await drainOutbox(50, NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.claimed).toBe(0);
    expect(firestore.read(OUTBOX_COLLECTION, 'leased')?.leaseToken).toBe('held-by-another-worker');
  });

  it('reclaims a row whose worker died and let the lease expire', async () => {
    firestore.seed(OUTBOX_COLLECTION, 'abandoned', {
      ...message(),
      text: null,
      identity: {},
      status: 'queued',
      attempts: 1,
      nextAttemptAt: '2026-03-04T11:00:00.000Z',
      leaseToken: 'token-from-a-dead-process',
      leaseExpiresAt: '2026-03-04T11:30:00.000Z', // already past at NOW
    });

    const result = await drainOutbox(50, NOW);

    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    const record = firestore.read(OUTBOX_COLLECTION, 'abandoned');
    expect(record?.status).toBe('sent');
    // The lease is released on finalization so the row cannot look busy forever.
    expect(record?.leaseToken).toBeNull();
    expect(record?.leaseExpiresAt).toBeNull();
  });

  it('a worker that lost its lease mid-send cannot overwrite the winner', async () => {
    dueRow('stolen');
    sendEmail.mockImplementation(async () => {
      // Simulate the row being finalized by another worker while this send is in flight.
      firestore.seed(OUTBOX_COLLECTION, 'stolen', {
        ...(firestore.read(OUTBOX_COLLECTION, 'stolen') as Record<string, unknown>),
        status: 'sent',
        leaseToken: 'a-different-workers-token',
      });
    });

    const result = await drainOutbox(50, NOW);

    // finishDelivery refuses to write under a lease token that is no longer ours.
    expect(result.claimed).toBe(0);
    expect(firestore.read(OUTBOX_COLLECTION, 'stolen')?.leaseToken).toBe(
      'a-different-workers-token',
    );
  });
});

describe('PR5 outbox: a send that happened is never recorded as one that did not', () => {
  const deliveredRow = (id: string) =>
    firestore.seed(OUTBOX_COLLECTION, id, {
      ...message(),
      text: null,
      identity: {},
      status: 'queued',
      attempts: 0,
      nextAttemptAt: '2026-03-04T11:00:00.000Z',
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: null,
    });

  it('does not turn a delivered message into a scheduled retry when finalization faults', async () => {
    // THE REGRESSION PIN. Exactly one injected fault is what separates the two designs.
    //
    // Before: the provider call and the finalizing write shared one try/catch, so a
    // Firestore fault while recording a SUCCESSFUL send was caught as a bounce. The catch
    // wrote status=failed with a fresh nextAttemptAt, and the next drain sent the customer
    // a second copy of an email that had already left.
    //
    // After: only sendEmail sits inside the try, and a finalization fault is retried, so the
    // row settles as sent. Checked against the pre-fix implementation, where this fails.
    deliveredRow('finalize-faults');
    sendEmail.mockImplementation(async () => {
      firestore.failNext(OUTBOX_COLLECTION, 'finalize-faults', 'update', 'firestore contention');
    });

    const result = await drainOutbox(50, NOW);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ sent: 1, failed: 0, deadLettered: 0 });

    const record = firestore.read(OUTBOX_COLLECTION, 'finalize-faults');
    expect(record?.status).toBe('sent');
    expect(record?.lastError).toBeNull();
    expect(record?.nextAttemptAt).toBeNull();

    // The duplicate this prevents: with the row rescheduled rather than settled, a drain
    // once the backoff elapsed would deliver the same message to the customer again.
    sendEmail.mockReset().mockResolvedValue(undefined);
    await drainOutbox(50, new Date('2026-03-05T00:00:00.000Z'));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('never records a delivered message as failed, even if finalization never succeeds', async () => {
    deliveredRow('finalize-hopeless');
    sendEmail.mockImplementation(async () => {
      for (let i = 0; i < 3; i += 1) {
        firestore.failNext(OUTBOX_COLLECTION, 'finalize-hopeless', 'update', 'firestore down');
      }
    });

    const result = await drainOutbox(50, NOW);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const record = firestore.read(OUTBOX_COLLECTION, 'finalize-hopeless');
    // Recording a delivered message as failed is what drives the duplicate. The row is left
    // under its unexpired lease instead, so nothing re-sends while the fault is current.
    expect(record?.status).not.toBe('failed');
    expect(record?.status).not.toBe('dead_letter');
    expect(record?.lastError).toBeNull();
    expect(result.failed).toBe(0);
    expect(result.deadLettered).toBe(0);

    sendEmail.mockReset().mockResolvedValue(undefined);
    await drainOutbox(50, NOW);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('PR5 outbox: retries are bounded and terminal failures leave rotation', () => {
  it('advances the attempt counter and backs off instead of hammering the provider', async () => {
    firestore.seed(OUTBOX_COLLECTION, 'failing', {
      ...message(),
      text: null,
      identity: {},
      status: 'queued',
      attempts: 0,
      nextAttemptAt: '2026-03-04T11:00:00.000Z',
      leaseToken: null,
      leaseExpiresAt: null,
    });
    sendEmail.mockRejectedValue(new Error('provider 500'));

    await drainOutbox(50, NOW);

    const record = firestore.read(OUTBOX_COLLECTION, 'failing');
    expect(record?.status).toBe('failed');
    expect(record?.attempts).toBe(1);
    // Backoff starts at one minute; the row is not due again at NOW.
    expect(new Date(String(record?.nextAttemptAt)).getTime()).toBeGreaterThan(NOW.getTime());

    sendEmail.mockClear();
    const second = await drainOutbox(50, NOW);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(second.claimed).toBe(0);
  });

  it('dead-letters on the last attempt and never selects the row again', async () => {
    firestore.seed(OUTBOX_COLLECTION, 'exhausted', {
      ...message(),
      text: null,
      identity: {},
      status: 'failed',
      attempts: MAX_ATTEMPTS - 1,
      nextAttemptAt: '2026-03-04T11:00:00.000Z',
      leaseToken: null,
      leaseExpiresAt: null,
    });
    sendEmail.mockRejectedValue(new Error('mailbox does not exist'));

    const result = await drainOutbox(50, NOW);

    expect(result).toMatchObject({ deadLettered: 1 });
    const record = firestore.read(OUTBOX_COLLECTION, 'exhausted');
    expect(record?.status).toBe('dead_letter');
    expect(record?.attempts).toBe(MAX_ATTEMPTS);
    expect(record?.nextAttemptAt).toBeNull();

    // Terminal means terminal: a later drain must not pick it up again.
    sendEmail.mockClear();
    const later = await drainOutbox(50, new Date('2026-04-01T00:00:00.000Z'));
    expect(sendEmail).not.toHaveBeenCalled();
    expect(later.claimed).toBe(0);
  });

  it('strips recipient addresses out of the stored provider error', async () => {
    firestore.seed(OUTBOX_COLLECTION, 'leaky', {
      ...message(),
      text: null,
      identity: {},
      status: 'queued',
      attempts: 0,
      nextAttemptAt: '2026-03-04T11:00:00.000Z',
      leaseToken: null,
      leaseExpiresAt: null,
    });
    sendEmail.mockRejectedValue(new Error('550 rejected for customer@example.com'));

    await drainOutbox(50, NOW);

    const lastError = String(firestore.read(OUTBOX_COLLECTION, 'leaky')?.lastError);
    expect(lastError).not.toContain('customer@example.com');
    expect(lastError).toContain('[address]');
  });
});

describe('PR5 outbox: sender identity is decided once and honoured on every retry', () => {
  it('sends a retry through the identity stored on the row, not a fresh resolution', async () => {
    firestore.seed(OUTBOX_COLLECTION, 'tenant-row', {
      tenantId: 'tenant-a',
      ...message(),
      text: null,
      identity: { fromEmail: 'billing@tenant-a.test', fromName: 'Tenant A' },
      status: 'failed',
      attempts: 1,
      nextAttemptAt: '2026-03-04T11:00:00.000Z',
      leaseToken: null,
      leaseExpiresAt: null,
    });

    await drainOutbox(50, NOW);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-a',
      fromEmail: 'billing@tenant-a.test',
      fromName: 'Tenant A',
    });
    // A retry must not re-decide routing: the tenant may have swapped providers since.
    expect(resolveTenantSender).not.toHaveBeenCalled();
  });

  it('snapshots the tenant identity at enqueue time', async () => {
    resolveTenantSender.mockReturnValue({ fromEmail: 'hello@tenant-b.test' });

    await enqueueTenantEmail({
      tenantId: 'tenant-b',
      ...message(),
      tenant: { id: 'tenant-b' } as never,
    });

    expect(onlyRow().identity).toEqual({ fromEmail: 'hello@tenant-b.test' });
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-b' });
  });

  it('never routes platform mail through a tenant provider', async () => {
    // A caller holding an object that also carries tenant routing must not be able to widen
    // a Bizosto security email into one that leaves through a third party's account.
    await enqueuePlatformEmail({
      ...message({ messageClass: 'password_reset' }),
      tenantId: 'tenant-c',
      identity: { fromEmail: 'attacker@tenant-c.test' },
    } as never);

    const record = onlyRow();
    expect(record.tenantId).toBeUndefined();
    expect(record.identity).toEqual({});
    expect(sendEmail.mock.calls[0][0]).not.toHaveProperty('tenantId');
    expect(sendEmail.mock.calls[0][0]).not.toHaveProperty('fromEmail');
    expect(resolveTenantSender).not.toHaveBeenCalled();
  });
});
