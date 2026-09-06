/**
 * PR5 — the single-trigger cron orchestrator, exercised rather than described.
 *
 * Bizosto's hosting plan gives one dependable scheduled trigger a day, so `vercel.json` now
 * schedules only `/api/cron/daily-tasks` and that handler fans out to the child routes. The
 * risk this creates is a job quietly disappearing: it is still deployed, still reachable by
 * hand, and never actually runs. A source-string check on vercel.json cannot see that.
 *
 * These tests run the dispatcher and assert on what it really requests.
 */

import {
  dispatchScheduledCronTasks,
  scheduledCronPathsForDate,
} from '@/lib/cron/daily-orchestrator';

const ORIGIN = 'https://app.bizosto.com';
const AUTHORIZATION = 'Bearer super-secret-cron-token';

const request = (over: { origin?: string; authorization?: string | null } = {}) =>
  ({
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization'
          ? over.authorization === undefined
            ? AUTHORIZATION
            : over.authorization
          : null,
    },
    nextUrl: { origin: over.origin ?? ORIGIN },
  }) as never;

/** Paths every daily run must reach, whatever the calendar date. */
const DAILY_PATHS = [
  '/api/cron/trial-emails',
  '/api/cron/abandoned-signups',
  '/api/cron/backup',
  '/api/cron/invoice-reminders',
  '/api/cron/billing-locks',
  '/api/cron/email-outbox',
];

const FIRST_OF_MONTH = new Date('2026-07-01T00:05:00.000Z');
const MID_MONTH = new Date('2026-07-17T00:05:00.000Z');

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
  global.fetch = fetchMock as unknown as typeof global.fetch;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

const requestedPaths = () =>
  fetchMock.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+/, ''));

describe('PR5 orchestrator: nothing that used to be scheduled has gone missing', () => {
  it('reaches every daily job on an ordinary day', async () => {
    await dispatchScheduledCronTasks(request(), MID_MONTH);

    expect(requestedPaths().sort()).toEqual([...DAILY_PATHS].sort());
  });

  it('adds monthly invoice generation on the first of the month only', async () => {
    await dispatchScheduledCronTasks(request(), FIRST_OF_MONTH);
    expect(requestedPaths()).toContain('/api/cron/generate-invoices');

    fetchMock.mockClear();
    await dispatchScheduledCronTasks(request(), MID_MONTH);
    // A monthly job that ran daily would generate a month of duplicate invoices.
    expect(requestedPaths()).not.toContain('/api/cron/generate-invoices');
  });

  it('reports the same set it dispatches', async () => {
    for (const now of [FIRST_OF_MONTH, MID_MONTH]) {
      fetchMock.mockClear();
      await dispatchScheduledCronTasks(request(), now);
      expect(requestedPaths().sort()).toEqual([...scheduledCronPathsForDate(now)].sort());
    }
  });

  it('runs jobs in an order their dependencies require', async () => {
    await dispatchScheduledCronTasks(request(), FIRST_OF_MONTH);
    const paths = requestedPaths();
    const at = (path: string) => paths.indexOf(path);

    // Invoices exist before reminders are evaluated against them.
    expect(at('/api/cron/generate-invoices')).toBeLessThan(at('/api/cron/invoice-reminders'));
    // Trial transitions settle before the dunning ladder advances.
    expect(at('/api/cron/trial-emails')).toBeLessThan(at('/api/cron/billing-locks'));
    // The outbox drains last, so mail queued by everything above it goes out on this run.
    expect(at('/api/cron/email-outbox')).toBe(paths.length - 1);
  });
});

describe('PR5 orchestrator: failures are visible', () => {
  it('reports a child that returned an error status', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('backup') ? { ok: false, status: 500 } : { ok: true, status: 200 },
    );

    const results = await dispatchScheduledCronTasks(request(), MID_MONTH);
    const backup = results.find((entry) => entry.path === '/api/cron/backup');

    expect(backup).toMatchObject({ ok: false, status: 500 });
    // A failure must not stop the rest of the day's work.
    expect(results.filter((entry) => entry.ok)).toHaveLength(DAILY_PATHS.length - 1);
  });

  it('reports a child that could not be reached at all', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('email-outbox')) throw new Error('connect ETIMEDOUT');
      return { ok: true, status: 200 };
    });

    const results = await dispatchScheduledCronTasks(request(), MID_MONTH);

    expect(results.find((entry) => entry.path === '/api/cron/email-outbox')).toMatchObject({
      ok: false,
      status: 0,
    });
  });

  it('keeps recipient addresses out of a reported dispatch error', async () => {
    fetchMock.mockRejectedValue(new Error('failed to notify owner@tenant-a.test'));

    const results = await dispatchScheduledCronTasks(request(), MID_MONTH);

    for (const entry of results) {
      expect(entry.error).not.toContain('owner@tenant-a.test');
      expect(entry.error).toContain('[address]');
    }
  });
});

describe('PR5 orchestrator: the cron credential is not forwarded anywhere it likes', () => {
  it('passes the caller-verified Authorization header through to each child', async () => {
    await dispatchScheduledCronTasks(request(), MID_MONTH);

    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.authorization).toBe(AUTHORIZATION);
    }
  });

  it('refuses to dispatch without an Authorization header', async () => {
    // The child routes are fail-closed on their own, but dispatching unauthenticated would
    // spend the day's single trigger producing nothing but 401s.
    await expect(
      dispatchScheduledCronTasks(request({ authorization: null }), MID_MONTH),
    ).rejects.toThrow(/Authorization header/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('will not send the cron secret to a host derived from a rewritten Host header', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.bizosto.com';

    await dispatchScheduledCronTasks(request({ origin: 'https://attacker.example' }), MID_MONTH);

    for (const [url] of fetchMock.mock.calls) {
      expect(String(url).startsWith('https://app.bizosto.com/')).toBe(true);
    }
  });

  it('still uses the request origin on a preview deployment it recognises', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.bizosto.com';
    process.env.VERCEL_URL = 'bizosto-git-pr5.vercel.app';

    await dispatchScheduledCronTasks(
      request({ origin: 'https://bizosto-git-pr5.vercel.app' }),
      MID_MONTH,
    );

    for (const [url] of fetchMock.mock.calls) {
      expect(String(url).startsWith('https://bizosto-git-pr5.vercel.app/')).toBe(true);
    }
  });

  it('falls back to the request origin when nothing is configured to check against', async () => {
    await dispatchScheduledCronTasks(request({ origin: 'http://localhost:3000' }), MID_MONTH);

    for (const [url] of fetchMock.mock.calls) {
      expect(String(url).startsWith('http://localhost:3000/')).toBe(true);
    }
  });
});
