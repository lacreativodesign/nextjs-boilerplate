/**
 * S11 — the attendance writer.
 *
 * The original writer was deleted in S6 because nothing called it and what it wrote could
 * never be read: it keyed events on an `employees` auto-id that no auth session carries,
 * and it appended each login to an unbounded `logs` array on one document, which breaches
 * Firestore's 1 MB ceiling at roughly ten thousand appends and then hard-fails that
 * user's writes permanently.
 *
 * This is the rebuild on the identity settled in S10 — one document per user per day,
 * keyed by the Firebase Auth uid. These tests exercise it against a fake Firestore, so
 * idempotency, the arrival-time rule and the fail-soft contract are checked as behaviour
 * rather than as source text.
 */

type StoredDoc = Record<string, unknown> | undefined;

const store = new Map<string, Record<string, unknown>>();
let failNextWrite = false;

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ __key: `${name}/${id}` }),
    }),
    async runTransaction(fn: (tx: unknown) => Promise<void>) {
      if (failNextWrite) throw new Error('firestore unavailable');
      const tx = {
        async get(ref: { __key: string }) {
          const existing = store.get(ref.__key);
          return { exists: existing !== undefined, data: () => existing };
        },
        set(ref: { __key: string }, value: Record<string, unknown>) {
          store.set(ref.__key, { ...(store.get(ref.__key) || {}), ...value });
        },
      };
      await fn(tx);
    },
  },
}));

import { attendanceDayKey, attendanceDocId, recordAttendanceEvent } from '@/lib/attendance/record';

const key = (tenantId: string, userId: string, date: string) =>
  `attendance/${attendanceDocId(tenantId, userId, date)}`;

const stored = (tenantId: string, userId: string, date: string): StoredDoc =>
  store.get(key(tenantId, userId, date));

beforeEach(() => {
  store.clear();
  failNextWrite = false;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('S11: the day key', () => {
  it('is YYYY-MM-DD so range filters compare correctly as strings', () => {
    const key = attendanceDayKey(new Date('2026-06-15T13:45:00.000Z'));
    expect(key).toBe('2026-06-15');
    expect('2026-06-01' <= key && key <= '2026-06-30').toBe(true);
  });

  it('buckets by the supplied timezone, not the server clock', () => {
    // 23:30 UTC is already the next morning in Karachi (UTC+5).
    const at = new Date('2026-06-15T23:30:00.000Z');
    expect(attendanceDayKey(at, 'UTC')).toBe('2026-06-15');
    expect(attendanceDayKey(at, 'Asia/Karachi')).toBe('2026-06-16');
  });

  it('falls back to UTC rather than losing the event on a bad zone', () => {
    const at = new Date('2026-06-15T13:45:00.000Z');
    expect(attendanceDayKey(at, 'Not/AZone')).toBe('2026-06-15');
    expect(attendanceDayKey(at, '')).toBe('2026-06-15');
  });
});

describe('S11: the document id', () => {
  it('cannot collide across tenants', () => {
    expect(attendanceDocId('t1', 'uid', '2026-06-15')).not.toBe(
      attendanceDocId('t2', 'uid', '2026-06-15'),
    );
  });

  it('contains no path separator Firestore would split on', () => {
    expect(attendanceDocId('t1', 'uid_a', '2026-06-15')).not.toContain('/');
  });
});

describe('S11: one document per user per day', () => {
  it('records arrival on the first sign-in', async () => {
    const result = await recordAttendanceEvent({
      tenantId: 't1',
      userId: 'uid_a',
      type: 'login',
      at: new Date('2026-06-15T09:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, docId: 't1__uid_a__2026-06-15', date: '2026-06-15' });
    expect(stored('t1', 'uid_a', '2026-06-15')).toMatchObject({
      tenantId: 't1',
      userId: 'uid_a',
      date: '2026-06-15',
      firstLoginAt: '2026-06-15T09:00:00.000Z',
      loginCount: 1,
    });
  });

  it('never lets a later sign-in overwrite the arrival time', async () => {
    for (const time of ['09:00', '11:30', '14:15']) {
      await recordAttendanceEvent({
        tenantId: 't1',
        userId: 'uid_a',
        type: 'login',
        at: new Date(`2026-06-15T${time}:00.000Z`),
      });
    }

    expect(stored('t1', 'uid_a', '2026-06-15')).toMatchObject({
      firstLoginAt: '2026-06-15T09:00:00.000Z',
      lastLoginAt: '2026-06-15T14:15:00.000Z',
      loginCount: 3,
    });
  });

  it('keeps one document however many times someone signs in', async () => {
    for (let i = 0; i < 40; i++) {
      await recordAttendanceEvent({
        tenantId: 't1',
        userId: 'uid_a',
        type: 'login',
        at: new Date(`2026-06-15T09:${String(i).padStart(2, '0')}:00.000Z`),
      });
    }

    expect(store.size).toBe(1);
    // Nothing accumulates INSIDE the document either — that was the 1 MB failure.
    const doc = stored('t1', 'uid_a', '2026-06-15')!;
    expect(doc.logs).toBeUndefined();
    expect(Object.keys(doc).sort()).toEqual([
      'createdAt',
      'date',
      'firstLoginAt',
      'lastLoginAt',
      'loginCount',
      'tenantId',
      'updatedAt',
      'userId',
    ]);
  });

  it('closes the day on sign-out without disturbing the arrival', async () => {
    await recordAttendanceEvent({
      tenantId: 't1',
      userId: 'uid_a',
      type: 'login',
      at: new Date('2026-06-15T09:00:00.000Z'),
    });
    await recordAttendanceEvent({
      tenantId: 't1',
      userId: 'uid_a',
      type: 'logout',
      at: new Date('2026-06-15T17:30:00.000Z'),
    });

    expect(stored('t1', 'uid_a', '2026-06-15')).toMatchObject({
      firstLoginAt: '2026-06-15T09:00:00.000Z',
      lastLogoutAt: '2026-06-15T17:30:00.000Z',
      loginCount: 1,
    });
  });

  it('records a sign-out with no matching sign-in rather than dropping it', async () => {
    // A session that outlived a deploy still produces a logout.
    await recordAttendanceEvent({
      tenantId: 't1',
      userId: 'uid_a',
      type: 'logout',
      at: new Date('2026-06-15T17:30:00.000Z'),
    });

    const doc = stored('t1', 'uid_a', '2026-06-15')!;
    expect(doc.lastLogoutAt).toBe('2026-06-15T17:30:00.000Z');
    expect(doc.firstLoginAt).toBeUndefined();
  });

  it('separates days, users and tenants', async () => {
    const at = new Date('2026-06-15T09:00:00.000Z');
    await recordAttendanceEvent({ tenantId: 't1', userId: 'uid_a', type: 'login', at });
    await recordAttendanceEvent({ tenantId: 't1', userId: 'uid_b', type: 'login', at });
    await recordAttendanceEvent({ tenantId: 't2', userId: 'uid_a', type: 'login', at });
    await recordAttendanceEvent({
      tenantId: 't1',
      userId: 'uid_a',
      type: 'login',
      at: new Date('2026-06-16T09:00:00.000Z'),
    });

    expect(store.size).toBe(4);
    expect(stored('t2', 'uid_a', '2026-06-15')).toMatchObject({ tenantId: 't2' });
  });
});

describe('S11: attendance never blocks signing in or out', () => {
  it('refuses to write without both a tenant and a user', async () => {
    const cases = [
      { tenantId: '', userId: 'uid_a' },
      { tenantId: 't1', userId: '' },
      { tenantId: null, userId: 'uid_a' },
      { tenantId: 't1', userId: undefined },
    ];

    for (const identity of cases) {
      const result = await recordAttendanceEvent({ ...identity, type: 'login' });
      expect(result).toEqual({ ok: false, reason: 'missing-identity' });
    }

    // An event with no tenant would otherwise land in a bucket every tenant read matches.
    expect(store.size).toBe(0);
  });

  it('returns a failure instead of throwing when Firestore is unavailable', async () => {
    failNextWrite = true;

    await expect(
      recordAttendanceEvent({ tenantId: 't1', userId: 'uid_a', type: 'login' }),
    ).resolves.toEqual({ ok: false, reason: 'write-failed' });
  });

  it('logs the failure without the uid or tenant id', async () => {
    failNextWrite = true;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await recordAttendanceEvent({ tenantId: 't1_secret', userId: 'uid_secret', type: 'login' });

    const logged = spy.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('[ATTENDANCE]');
    expect(logged).not.toContain('uid_secret');
    expect(logged).not.toContain('t1_secret');
  });
});
