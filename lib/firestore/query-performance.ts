import { logInfo } from "@/lib/logging";

type SlowQueryContext = {
  route: string;
  tenantId?: string | null;
  queryName: string;
  metadata?: Record<string, unknown>;
};

const SLOW_QUERY_MS = 1000;

export async function executeMonitoredQuery<T>(run: () => Promise<T>, context: SlowQueryContext): Promise<T> {
  const startedAt = Date.now();
  const result = await run();
  const durationMs = Date.now() - startedAt;

  if (durationMs > SLOW_QUERY_MS) {
    logInfo("slow_firestore_query", {
      route: context.route,
      tenantId: context.tenantId ?? null,
      metadata: {
        queryName: context.queryName,
        durationMs,
        ...context.metadata,
      },
    });
  }

  return result;
}

export function getPageSize(raw: string | null, fallback = 50, max = 100): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}
