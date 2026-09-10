import { logInfo } from '@/lib/logging';
import { ingestMetric } from '@/lib/monitoring/dashboard-service';

type SlowQueryContext = {
  route: string;
  tenantId?: string | null;
  queryName: string;
  metadata?: Record<string, unknown>;
};

const SLOW_QUERY_MS = 1000;

export async function executeMonitoredQuery<T>(
  run: () => Promise<T>,
  context: SlowQueryContext,
): Promise<T> {
  const startedAt = Date.now();
  const result = await run();
  const durationMs = Date.now() - startedAt;

  if (durationMs > SLOW_QUERY_MS) {
    logInfo('slow_firestore_query', {
      route: context.route,
      tenantId: context.tenantId ?? null,
      metadata: {
        queryName: context.queryName,
        durationMs,
        ...context.metadata,
      },
    });
  }

  await ingestMetric({
    type: 'database_query_duration',
    endpoint: context.route,
    module: 'database',
    durationMs,
    metadata: {
      queryName: context.queryName,
      ...context.metadata,
    },
  });

  return result;
}

export function getPageSize(raw: string | null, fallback = 50, max = 100): number {
  // Absence is resolved BEFORE the numeric parse, because `Number(null)` and `Number('')`
  // are 0 rather than NaN. The finite check therefore accepted a missing `limit` as the
  // number zero and clamped it up to 1, so every list route that reads its page size
  // straight from `searchParams.get('limit')` — invoices, payments, expenses, budgets,
  // projects and project tasks — returned exactly ONE row to any caller that did not
  // pass the parameter, which the finance pages do not. Only a genuinely absent or blank
  // value falls back; a value the caller actually supplied still clamps into [1, max].
  const supplied = String(raw ?? '').trim();
  if (supplied === '') return fallback;
  const parsed = Number(supplied);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}
