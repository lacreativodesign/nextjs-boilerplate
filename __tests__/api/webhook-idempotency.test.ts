import * as fs from 'fs';
import * as path from 'path';

/**
 * Transactional webhook idempotency gate (S37, audit P1).
 *
 * The previous read-then-write pattern (get → check exists → ...process... →
 * set) let two concurrent deliveries of the same event both pass the existence
 * check and both process. claimWebhookEvent uses Firestore create(), which is
 * atomic — exactly one caller wins; the loser is a duplicate. These tests use a
 * minimal in-memory store that mimics create()'s ALREADY_EXISTS (gRPC code 6)
 * behavior, plus static assertions that all three webhook routes use the claim.
 */

// --- Minimal Firestore-create mock: create() throws {code:6} if id exists. ---
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
const fakeDb = {
  collection() {
    return {
      doc: (id: string) => new FakeDoc(store, id),
    };
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
});

describe('claimWebhookEvent', () => {
  it('claims a fresh event', async () => {
    const result = await claimWebhookEvent('evt_1', 'checkout.session.completed');
    expect(result).toBe('claimed');
    expect(store.has('evt_1')).toBe(true);
    expect(store.get('evt_1')?.status).toBe('processing');
  });

  it('reports a duplicate when the same event id is claimed twice', async () => {
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
    const outcomes = [a, b].sort();
    expect(outcomes).toEqual(['claimed', 'duplicate']);
  });

  it('rethrows non-existence errors so the route returns 500', async () => {
    // Swap the collection().doc().create() to throw a non-6 error for one call.
    const spy = jest.spyOn(fakeDb, 'collection').mockReturnValueOnce({
      doc: () => ({
        async create() {
          const err: Error & { code?: number } = new Error('UNAVAILABLE');
          err.code = 14;
          throw err;
        },
      }),
    } as unknown as ReturnType<typeof fakeDb.collection>);

    await expect(claimWebhookEvent('evt_err', 'invoice.paid')).rejects.toThrow('UNAVAILABLE');
    spy.mockRestore();
  });
});

describe('finalize and release lifecycle', () => {
  it('finalize marks the event processed', async () => {
    await claimWebhookEvent('evt_2', 'account.updated');
    await finalizeWebhookEvent('evt_2', 'account.updated');
    expect(store.get('evt_2')?.status).toBe('processed');
  });

  it('release deletes the claim so a retry can re-claim', async () => {
    await claimWebhookEvent('evt_3', 'invoice.paid');
    await releaseWebhookEvent('evt_3');
    expect(store.has('evt_3')).toBe(false);
    // A retry can now claim it fresh.
    const again = await claimWebhookEvent('evt_3', 'invoice.paid');
    expect(again).toBe('claimed');
  });
});

describe('all webhook routes use the atomic claim (static gate)', () => {
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
    // The old racy pattern is gone.
    expect(source).not.toContain('processedRef');
    expect(source).not.toContain("collection('processed_webhook_events')");
  });

  it.each(routes)('%s releases the claim on handler failure', (file) => {
    const source = read(file);
    expect(source).toContain('releaseWebhookEvent');
  });
});
