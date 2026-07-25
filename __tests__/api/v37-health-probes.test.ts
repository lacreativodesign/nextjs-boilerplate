import fs from 'fs';
import path from 'path';

/**
 * P1-5 — the readiness probe fails red on a dead dependency.
 *
 * /api/health is liveness ("is the process up?") and stays dependency-free.
 * /api/health/ready is readiness ("can this instance serve a request?"), which requires the
 * hard dependencies to be reachable.
 *
 * Before this change the readiness probe checked Firestore only, and on failure returned a
 * bare `not_ready` naming no dependency. Redis — which every rate-limited and cached path
 * needs — was not checked, so an instance with a dead cache reported itself ready and then
 * failed requests. These assertions pin the contract:
 *   - liveness stays dependency-free
 *   - readiness checks Firestore and Redis, names the failing one, and returns 503 on failure
 *   - an unconfigured optional dependency is skipped, not failed
 *   - the probe never throws a 500
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const LIVENESS = 'app/api/health/route.ts';
const READINESS = 'app/api/health/ready/route.ts';

describe('P1-5: liveness stays a pure, dependency-free probe', () => {
  const src = read(LIVENESS);

  it('does not touch Firestore, Redis or any other dependency', () => {
    expect(src).not.toContain('adminDb');
    expect(src).not.toContain('getRedisClient');
    expect(src).not.toContain('await');
  });

  it('always returns a 200 status body', () => {
    expect(src).toContain("status: 'ok'");
  });
});

describe('P1-5: readiness checks the hard dependencies', () => {
  const src = read(READINESS);

  it('checks Firestore', () => {
    expect(src).toContain('checkFirestore');
    expect(src).toContain("adminDb.collection('settings').doc('platform').get()");
  });

  it('checks Redis, which was previously unchecked', () => {
    expect(src).toContain('checkRedis');
    expect(src).toContain('getRedisClient');
  });

  it('runs the checks concurrently', () => {
    expect(src).toContain('Promise.all([checkFirestore(), checkRedis()])');
  });

  it('bounds every check with a timeout so a hung dependency cannot hang the probe', () => {
    expect(src).toContain('CHECK_TIMEOUT_MS');
    expect(src).toContain('withTimeout');
  });
});

describe('P1-5: readiness fails red and says why', () => {
  const src = read(READINESS);

  it('returns 503 when a required check is not ok', () => {
    expect(src).toContain("status: ready ? 'ready' : 'not_ready'");
    expect(src).toContain('status: ready ? 200 : 503');
  });

  it('reports a per-check state instead of a bare not_ready', () => {
    expect(src).toContain('checks');
    expect(src).toContain("state: 'ok'");
    expect(src).toContain("state: 'error'");
    expect(src).toContain('error: error instanceof Error ? error.message');
  });

  it('treats an unconfigured optional dependency as skipped, not failed', () => {
    expect(src).toContain("state: 'skipped'");
    expect(src).toContain('required: false');
    expect(src).toContain("check.state === 'skipped' && !check.required");
  });

  it('treats a configured-but-unreachable Redis as a real failure', () => {
    expect(src).toContain('Redis is configured but the client could not be created');
    expect(src).toMatch(/configured[\s\S]{0,200}required: true/);
  });

  it('never throws a 500 — an error in the probe is itself a not-ready signal', () => {
    const handler = src.slice(src.indexOf('export async function GET'));
    expect(handler).toContain('catch (error: unknown)');
    expect(handler).toContain("status: 'not_ready'");
    expect(handler).not.toContain('{ status: 500 }');
  });
});

describe('P1-5: the readiness decision is correct across dependency states', () => {
  // Mirrors the aggregation in the GET handler. Kept in lockstep with the route by the
  // source assertions above; this exercises the truth table directly.
  type Check = { state: 'ok' | 'error' | 'skipped'; required: boolean };
  const decide = (checks: Record<string, Check>) =>
    Object.values(checks).every((c) => c.state === 'ok' || (c.state === 'skipped' && !c.required));

  it('ready when every required dependency is ok', () => {
    expect(
      decide({ fs: { state: 'ok', required: true }, redis: { state: 'ok', required: true } }),
    ).toBe(true);
  });

  it('not ready when Firestore is down', () => {
    expect(
      decide({ fs: { state: 'error', required: true }, redis: { state: 'ok', required: true } }),
    ).toBe(false);
  });

  it('not ready when a configured Redis is down', () => {
    expect(
      decide({ fs: { state: 'ok', required: true }, redis: { state: 'error', required: true } }),
    ).toBe(false);
  });

  it('ready when Redis is unconfigured and therefore skipped', () => {
    expect(
      decide({ fs: { state: 'ok', required: true }, redis: { state: 'skipped', required: false } }),
    ).toBe(true);
  });

  it('fails closed if a required check is somehow skipped', () => {
    expect(
      decide({ fs: { state: 'skipped', required: true }, redis: { state: 'ok', required: true } }),
    ).toBe(false);
  });
});
