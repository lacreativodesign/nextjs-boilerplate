import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getRedisClient } from '@/lib/cache/redis-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Readiness probe (P1-5).
 *
 * Liveness ("is the process up?") lives at /api/health and stays dependency-free. Readiness
 * answers a different question: "can this instance actually serve a request?" — which means
 * the hard dependencies must be reachable, not merely configured.
 *
 * Previously this route checked Firestore only, and on failure returned a bare `not_ready`
 * with no indication of WHICH dependency was down. Redis — which every rate-limited and
 * cached path depends on — was not checked at all, so an instance with a dead cache reported
 * itself ready and then failed requests.
 *
 * Contract:
 *   - Every REQUIRED check passing            -> 200 { status: 'ready' }
 *   - Any REQUIRED check failing              -> 503 { status: 'not_ready' } and the failing
 *                                                check names itself
 *   - An OPTIONAL dependency that is simply not configured is reported as 'skipped' and never
 *     fails readiness (e.g. Redis on a preview deployment with no cache wired up)
 *
 * The probe never throws: an unhandled error is itself a not-ready signal and is returned as
 * one, not as a 500 stack trace.
 */

type CheckState = 'ok' | 'error' | 'skipped';

type CheckResult = {
  state: CheckState;
  required: boolean;
  latencyMs: number;
  error?: string;
};

const CHECK_TIMEOUT_MS = 3000;

async function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${CHECK_TIMEOUT_MS}ms`)),
      CHECK_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function timed(run: () => Promise<void>, required: boolean): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    await run();
    return { state: 'ok', required, latencyMs: Date.now() - startedAt };
  } catch (error: unknown) {
    return {
      state: 'error',
      required,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/** Firestore is a hard dependency: a read must succeed. */
async function checkFirestore(): Promise<CheckResult> {
  return timed(async () => {
    await withTimeout(adminDb.collection('settings').doc('platform').get(), 'firestore');
  }, true);
}

/**
 * Redis is required when configured. An unconfigured cache (no UPSTASH/KV env) is reported
 * 'skipped' so preview deployments without a cache do not report themselves unhealthy; a
 * configured-but-unreachable cache is a real not-ready.
 */
async function checkRedis(): Promise<CheckResult> {
  const startedAt = Date.now();
  const client = await getRedisClient().catch(() => null);

  if (!client) {
    const configured = Boolean(
      (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
    );
    if (!configured) {
      return { state: 'skipped', required: false, latencyMs: Date.now() - startedAt };
    }
    return {
      state: 'error',
      required: true,
      latencyMs: Date.now() - startedAt,
      error: 'Redis is configured but the client could not be created',
    };
  }

  return timed(async () => {
    const probeKey = 'health:ready:probe';
    await withTimeout(client.set(probeKey, Date.now(), { ex: 30 }), 'redis');
    await withTimeout(client.get(probeKey), 'redis');
  }, true);
}

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const [firestore, redis] = await Promise.all([checkFirestore(), checkRedis()]);
    const checks = { firestore, redis };

    const ready = Object.values(checks).every(
      (check) => check.state === 'ok' || (check.state === 'skipped' && !check.required),
    );

    return NextResponse.json(
      { status: ready ? 'ready' : 'not_ready', timestamp, checks },
      { status: ready ? 200 : 503 },
    );
  } catch (error: unknown) {
    // The probe itself failing is a not-ready signal, not a 500.
    return NextResponse.json(
      {
        status: 'not_ready',
        timestamp,
        error: error instanceof Error ? error.message : 'Readiness probe failed',
      },
      { status: 503 },
    );
  }
}
