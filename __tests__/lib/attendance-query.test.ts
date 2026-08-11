import {
  fetchAttendanceRange,
  fetchRoster,
  fetchUserAttendanceRange,
  monthRange,
  summarizeAttendanceDay,
  summarizeMonth,
  MAX_ROSTER,
} from '@/lib/attendance/query';

/**
 * S12 — the attendance readers.
 *
 * S11 rebuilt the writer as one document per user per day, keyed on the auth uid. The
 * readers were still written for the shape that came before it: a stream of
 * `{ type: 'login' | 'logout' }` events joined against the `employees` collection S10
 * retired. Both screens would therefore have kept rendering empty even though real
 * attendance was finally being recorded.
 *
 * These tests exercise the shared reader against a fake Firestore, so the join, the date
 * bounds and the hours arithmetic are checked as behaviour rather than as source text.
 */

const collections: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
  users: [],
  attendance: [],
};
const capturedLimits: number[] = [];

/** Minimal Firestore query double: records limits and applies where/limit in memory. */
function makeQuery(name: string, filters: Array<[string, string, unknown]> = []) {
  const run = () =>
    collections[name]
      .filter((doc) =>
        filters.every(([field, op, value]) => {
          const actual = doc.data[field];
          if (op === '==') return actual === value;
          if (op === '>=') return String(actual) >= String(value);
          if (op === '<=') return String(actual) <= String(value);
          return true;
        }),
      )
      .map((doc) => ({ id: doc.id, data: () => doc.data }));

  const api: any = {
    where: (field: string, op: string, value: unknown) =>
      makeQuery(name, [...filters, [field, op, value]]),
    limit: (n: number) => {
      capturedLimits.push(n);
      return { ...api, get: async () => ({ docs: run().slice(0, n) }) };
    },
    get: async () => ({ docs: run() }),
  };
  return api;
}

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: { collection: (name: string) => makeQuery(name) },
}));

const seedUser = (id: string, data: Record<string, unknown>) =>
  collections.users.push({ id, data: { tenantId: 't1', ...data } });

const seedDay = (userId: string, date: string, data: Record<string, unknown> = {}) =>
  collections.attendance.push({
    id: `t1__${userId}__${date}`,
    data: { tenantId: 't1', userId, date, ...data },
  });

beforeEach(() => {
  collections.users = [];
  collections.attendance = [];
  capturedLimits.length = 0;
});

describe('S12: month bounds', () => {
  it('covers the whole month, including short and leap months', () => {
    expect(monthRange('2026-01')).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(monthRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('rejects anything that is not YYYY-MM rather than guessing', () => {
    for (const bad of ['', '2026', '2026-1', '2026-13', '2026-00', 'not-a-month', null]) {
      expect(monthRange(bad)).toBeNull();
    }
  });

  it('produces lexicographically comparable bounds, which the date filter relies on', () => {
    const range = monthRange('2026-09')!;
    expect('2026-09-01' >= range.from).toBe(true);
    expect('2026-09-30' <= range.to).toBe(true);
    expect('2026-10-01' <= range.to).toBe(false);
  });
});

describe('S12: per-day arithmetic', () => {
  it('reports arrival-to-departure hours', () => {
    const day = summarizeAttendanceDay({
      date: '2026-06-01',
      firstLoginAt: '2026-06-01T09:00:00.000Z',
      lastLogoutAt: '2026-06-01T17:30:00.000Z',
      loginCount: 3,
    });
    expect(day.hours).toBe(8.5);
    expect(day.loginCount).toBe(3);
  });

  it('reports no hours for a day no sign-out has closed', () => {
    const day = summarizeAttendanceDay({
      date: '2026-06-01',
      firstLoginAt: '2026-06-01T09:00:00.000Z',
      loginCount: 1,
    });
    expect(day.hours).toBeNull();
    expect(day.firstLoginAt).toBe('2026-06-01T09:00:00.000Z');
  });

  it('reports no hours rather than a negative day when timestamps are out of order', () => {
    const day = summarizeAttendanceDay({
      date: '2026-06-01',
      firstLoginAt: '2026-06-01T18:00:00.000Z',
      lastLogoutAt: '2026-06-01T09:00:00.000Z',
    });
    expect(day.hours).toBeNull();
  });

  it('counts a day as present on a sign-in alone', () => {
    const summary = summarizeMonth({
      '2026-06-01': summarizeAttendanceDay({
        date: '2026-06-01',
        firstLoginAt: '2026-06-01T09:00:00.000Z',
        lastLogoutAt: '2026-06-01T17:00:00.000Z',
      }),
      // Still at their desk: present, but no hours yet.
      '2026-06-02': summarizeAttendanceDay({
        date: '2026-06-02',
        firstLoginAt: '2026-06-02T09:00:00.000Z',
      }),
    });
    expect(summary.daysPresent).toBe(2);
    expect(summary.totalHours).toBe(8);
  });
});

describe('S12: the roster comes from users', () => {
  it('returns tenant staff keyed by the uid the writer stamps', async () => {
    seedUser('uid_a', { name: 'Ana', role: 'sales' });
    seedUser('uid_b', { name: 'Ben', role: 'finance' });
    seedUser('uid_other', { name: 'Zed', role: 'sales', tenantId: 't2' });

    expect((await fetchRoster('t1')).map((m) => m.id)).toEqual(['uid_a', 'uid_b']);
  });

  it('excludes the external client role from the attendance sheet', async () => {
    seedUser('uid_a', { name: 'Ana', role: 'sales' });
    seedUser('uid_client', { name: 'Client Co', role: 'client' });

    expect((await fetchRoster('t1')).map((m) => m.role)).toEqual(['sales']);
  });

  it('caps the roster query', async () => {
    await fetchRoster('t1');
    expect(capturedLimits).toContain(MAX_ROSTER);
  });
});

describe('S12: the join that could never match now matches', () => {
  it('groups a range by the uid the roster is keyed on', async () => {
    seedUser('uid_a', { name: 'Ana', role: 'sales' });
    seedDay('uid_a', '2026-06-01', {
      firstLoginAt: '2026-06-01T09:00:00.000Z',
      lastLogoutAt: '2026-06-01T17:00:00.000Z',
    });
    seedDay('uid_a', '2026-06-02', { firstLoginAt: '2026-06-02T10:00:00.000Z' });

    const roster = await fetchRoster('t1');
    const byUser = await fetchAttendanceRange({
      tenantId: 't1',
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(byUser[roster[0].id]['2026-06-01'].hours).toBe(8);
    expect(byUser[roster[0].id]['2026-06-02'].hours).toBeNull();
  });

  it('excludes days outside the requested month', async () => {
    seedDay('uid_a', '2026-05-31', { firstLoginAt: '2026-05-31T09:00:00.000Z' });
    seedDay('uid_a', '2026-06-15', { firstLoginAt: '2026-06-15T09:00:00.000Z' });
    seedDay('uid_a', '2026-07-01', { firstLoginAt: '2026-07-01T09:00:00.000Z' });

    const byUser = await fetchAttendanceRange({
      tenantId: 't1',
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(Object.keys(byUser.uid_a)).toEqual(['2026-06-15']);
  });

  it("never returns another tenant's days", async () => {
    seedDay('uid_a', '2026-06-01', { firstLoginAt: '2026-06-01T09:00:00.000Z' });
    collections.attendance.push({
      id: 't2__uid_a__2026-06-02',
      data: {
        tenantId: 't2',
        userId: 'uid_a',
        date: '2026-06-02',
        firstLoginAt: '2026-06-02T09:00:00.000Z',
      },
    });

    const byUser = await fetchAttendanceRange({
      tenantId: 't1',
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(Object.keys(byUser.uid_a)).toEqual(['2026-06-01']);
  });

  it("scopes a single user's range to that user", async () => {
    seedDay('uid_a', '2026-06-01', { firstLoginAt: '2026-06-01T09:00:00.000Z' });
    seedDay('uid_b', '2026-06-01', { firstLoginAt: '2026-06-01T09:30:00.000Z' });

    const days = await fetchUserAttendanceRange({
      tenantId: 't1',
      userId: 'uid_a',
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(Object.keys(days)).toEqual(['2026-06-01']);
    expect(days['2026-06-01'].firstLoginAt).toBe('2026-06-01T09:00:00.000Z');
  });

  it('skips a document with no userId instead of bucketing it under an empty key', async () => {
    collections.attendance.push({
      id: 'malformed',
      data: { tenantId: 't1', date: '2026-06-01', firstLoginAt: '2026-06-01T09:00:00.000Z' },
    });

    const byUser = await fetchAttendanceRange({
      tenantId: 't1',
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(byUser).toEqual({});
  });
});
