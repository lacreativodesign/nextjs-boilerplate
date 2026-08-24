import { NextRequest } from 'next/server';
import { isSecureCronSecret } from '@/lib/cron/auth';
import type { DailyJobRunResult } from '@/lib/cron/types';

type CronRouteHandler = (request: NextRequest) => Promise<Response>;
type CronRouteModule = { GET: CronRouteHandler };

const METRIC_KEY =
  /(count|scanned|processed|sent|failed|deleted|locked|applied|queued|generated|skipped|truncated|refreshed|revoked|archived|tenants|files|records|errors)$/i;

function safeMetrics(body: unknown): Record<string, number | boolean> {
  if (!body || typeof body !== 'object') return {};
  const result: Record<string, number | boolean> = {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (METRIC_KEY.test(key) && (typeof value === 'number' || typeof value === 'boolean')) {
      result[key] = value;
    }
    if (key === 'summary' || key === 'results' || key === 'details') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        if (
          METRIC_KEY.test(nestedKey) &&
          (typeof nestedValue === 'number' || typeof nestedValue === 'boolean')
        ) {
          result[`${key}.${nestedKey}`] = nestedValue;
        }
      }
    }
  }

  return result;
}

function reportsFailure(body: Record<string, unknown> | null): boolean {
  if (!body) return false;
  if (Array.isArray(body.errors) && body.errors.length > 0) return true;
  if (typeof body.errors === 'number' && body.errors > 0) return true;
  if (typeof body.failed === 'number' && body.failed > 0) return true;
  if (body.results && typeof body.results === 'object' && !Array.isArray(body.results)) {
    const nested = body.results as Record<string, unknown>;
    if (typeof nested.errors === 'number' && nested.errors > 0) return true;
    if (typeof nested.failed === 'number' && nested.failed > 0) return true;
  }
  if (Array.isArray(body.results)) {
    return body.results.some(
      (result) =>
        Boolean(result) &&
        typeof result === 'object' &&
        ((result as Record<string, unknown>).ok === false ||
          (result as Record<string, unknown>).success === false ||
          (result as Record<string, unknown>).error !== undefined),
    );
  }
  return false;
}

export class CronRouteJobError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CronRouteJobError';
  }
}

/** Invokes an existing cron handler in-process; no hostname or cross-environment fetch. */
export async function invokeCronRoute(
  path: string,
  load: () => Promise<CronRouteModule>,
): Promise<DailyJobRunResult> {
  const secret = process.env.CRON_SECRET;
  if (!isSecureCronSecret(secret)) {
    throw new CronRouteJobError('CRON_SECRET_MISCONFIGURED');
  }

  const routeModule = await load();
  const request = new NextRequest(`https://cron.internal${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${secret}`,
      'user-agent': 'bizosto-daily-orchestrator',
    },
  });
  const response = await routeModule.GET(request);
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (
    !response.ok ||
    body?.ok === false ||
    body?.success === false ||
    body?.error !== undefined ||
    reportsFailure(body)
  ) {
    throw new CronRouteJobError(`ROUTE_${response.status || 500}`);
  }

  const metrics = safeMetrics(body);
  const nestedResults =
    body?.results && typeof body.results === 'object' && !Array.isArray(body.results)
      ? (body.results as Record<string, unknown>)
      : null;
  if (body?.blocked === true || body?.truncated === true || nestedResults?.truncated === true) {
    return { outcome: 'blocked', code: 'OWNER_CAPACITY_DECISION_REQUIRED', metrics };
  }
  if (body?.skipped === true) {
    return { outcome: 'blocked', code: 'FEATURE_DISABLED', metrics };
  }

  return { outcome: 'succeeded', metrics };
}
