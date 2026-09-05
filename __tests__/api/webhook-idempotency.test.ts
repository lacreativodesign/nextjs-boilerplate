import * as fs from 'fs';
import * as path from 'path';

/**
 * Transactional webhook idempotency gate (S37, audit P1).
 *
 * Claims are transaction-backed leases. A fresh processing claim suppresses duplicate
 * deliveries, a finalized claim stays permanently duplicate, and a stale processing claim
 * may be reclaimed so a crashed worker cannot suppress Stripe retries forever.
 */

class FakeDoc {
  constructor(
    private store: Map<string, Record<string, unknown>>,
    private id: string,
  ) {}

  async create(data: Record<string, unknown>) {
    if (this.store.has(this.id)) {
      const err: Error & { code?: number } = new Error('ALREADY_EXISTS');
      err.code = 6;
      throw err;
    }
    this.store.set(this.id, { ...data });
  }

  async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
    const prev = opts?.merge ? this.store.get(this.id) || {} : {};
    this.store.set(this.id, { ...prev, ...data });
  }

  async delete() {
    this.store.delete(this.id);
  }

  async get() {
    const data = this.store.get(this.id);
    return { exists: data !== undefined, data: () => data };
  }
}

const store = new Map<string, Record<string, unknown>>();
let transactionTail: Promise<void> = Promise.resolve();
let nextTransactionError: Error | null = null;

const fakeDb = {
  collection() {
    return {
      doc: (id: string) => new FakeDoc(store, id),
    };
  },

  runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const execute = async () => {
      if (nextTransactionError) {
        const error = nextTransactionError;
        nextTransactionError = null;
        throw error;
      }

      const writes: Array<() => Promise<void>> = [];
      const tx = {
        get: (ref: FakeDoc) => ref.get(),
        create: (ref: FakeDoc, data: Record<string, unknown>) => {
          writes.push(() => ref.create(data));
          return tx;
        },
        set: (
          ref: FakeDoc,
          data: Record<string, unknown>,
          opts?: { merge?: boolean },
        ) => {
          writes.push(() => ref.set(data, opts));
          return tx;
        },
      };

      const result = await fn(tx);
      for (const write of writes) await write();
      return result;
    };

    // Serialize the fake transactions so Promise.all exercises the same exactly-one-winner
    // invariant Firestore provides instead of letting the in-memory double race unrealistically.
    const run = transactionTail.then(execute, execute);
    transactionTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  },
};

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return fakeDb;
  },
}));

import {
  claimWebhookEvent,
  finalizeWebhookEvent,
  releaseWebhookEvent,
} from '@/lib/stripe/webhook-idempotency';

beforeEach(() => {
  store.clear();
  transactionTail = Promise.resolve();
  nextTransactionError = null;
});

describe('claimWebhookEvent', () => {
  it('claims a fresh event', async () => {
    const result = await claimWebhookEvent('evt_1', 'checkout.session.completed');
    expect(result).toBe('claimed');
    expect(store.has('evt_1')).toBe(true);
    expect(store.get('evt_1')?.status).toBe('processing');
    expect(store.get('evt_1')?.claimAttempts).toBe(1);
  });

  it('reports a duplicate while the same processing lease is fresh', async () => {
    const first = await claimWebhookEvent('evt_1', 'checkout.session.completed');
    const second = await claimWebhookEvent('evt_1', 'checkout.session.completed');
    expect(first).toBe('claimed');
    expect(second).toBe('duplicate');
  });

  it('only one of two concurrent claims for the same event wins', async () => {
    const [a, b] = await Promise.all([
      claimWebhookEvent('evt_race', 'invoice.paid'),
      claimWebhookEvent('evt_race', 'invoice.paid'),
    ]);
    expect([a, b].sort()).toEqual(['claimed', 'duplicate']);
  });

  it('reclaims a stale processing lease after a worker dies', async () => {
    await claimWebhookEvent('evt_stale', 'invoice.paid');
    const stale = store.get('evt_stale') || {};
    store.set('evt_stale', {
      ...stale,
      claimedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    });

    const reclaimed = await claimWebhookEvent('evt_stale', 'invoice.paid');
    expect(reclaimed).toBe('claimed');
    expect(store.get('evt_stale')?.claimAttempts).toBe(2);
    expect(store.get('evt_stale')?.reclaimedAt).toBeTruthy();
  });

  it('rethrows transaction failures so the route can return 500 and Stripe can retry', async () => {
    const err: Error & { code?: number } = new Error('UNAVAILABLE');
    err.code = 14;
    nextTransactionError = err;
    await expect(claimWebhookEvent('evt_err', 'invoice.paid')).rejects.toThrow('UNAVAILABLE');
  });
});

describe('finalize and release lifecycle', () => {
  it('finalize marks the event processed and keeps redelivery duplicate', async () => {
    await claimWebhookEvent('evt_2', 'account.updated');
    await finalizeWebhookEvent('evt_2', 'account.updated');
    expect(store.get('evt_2')?.status).toBe('processed');
    await expect(claimWebhookEvent('evt_2', 'account.updated')).resolves.toBe('duplicate');
  });

  it('release deletes the claim so a retry can re-claim', async () => {
    await claimWebhookEvent('evt_3', 'invoice.paid');
    await releaseWebhookEvent('evt_3');
    expect(store.has('evt_3')).toBe(false);
    await expect(claimWebhookEvent('evt_3', 'invoice.paid')).resolves.toBe('claimed');
  });
});

describe('all webhook routes use the transactional claim (static gate)', () => {
  const read = (relative: string): string =>
    fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  const routes = [
    'app/api/stripe/webhook/route.ts',
    'app/api/stripe/connect/webhook/route.ts',
    'app/api/stripe/subscription-webhook/route.ts',
  ];

  it.each(routes)('%s uses claimWebhookEvent and no longer does read-then-write', (file) => {
    const source = read(file);
    expect(source).toContain('claimWebhookEvent');
    expect(source).toContain('finalizeWebhookEvent');
    expect(source).not.toContain('processedRef');
    expect(source).not.toContain("collection('processed_webhook_events')");
  });

  it.each(routes)('%s releases the claim on handler failure', (file) => {
    const source = read(file);
    expect(source).toContain('releaseWebhookEvent');
  });
});
