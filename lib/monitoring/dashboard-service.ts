import { adminDb } from '@/lib/firebaseAdmin';
import { evaluateAlertStates } from '@/lib/monitoring/alerts';
import { monitoringLogger } from '@/lib/monitoring/logger';
import type {
  MetricIngestPayload,
  MonitoringDashboardPayload,
  MonitoringModule,
} from '@/lib/monitoring/types';

const METRIC_COLLECTION = 'monitoring_metrics';
const API_USAGE_COLLECTION = 'api_usage_logs';

type NumberArray = number[];

function percentile(values: NumberArray, p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] || 0;
}

function avg(values: NumberArray) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function toBucketKey(iso: string) {
  const date = new Date(iso);
  date.setSeconds(0, 0);
  date.setMinutes(Math.floor(date.getMinutes() / 5) * 5);
  return date.toISOString();
}

function toModule(value: string | undefined): MonitoringModule {
  if (
    value === 'api' ||
    value === 'database' ||
    value === 'cache' ||
    value === 'auth' ||
    value === 'billing' ||
    value === 'frontend'
  ) {
    return value;
  }
  return 'unknown';
}

export async function ingestMetric(payload: MetricIngestPayload) {
  const event = {
    ...payload,
    module: toModule(payload.module),
    endpoint: payload.endpoint || 'unknown',
    createdAt: new Date().toISOString(),
  };

  await adminDb.collection(METRIC_COLLECTION).add(event);

  if (payload.type === 'error_event') {
    await monitoringLogger.error('monitoring_error_event', 'monitoring', {
      endpoint: event.endpoint,
      module: event.module,
      errorCode: payload.errorCode || 'UNKNOWN',
      metadata: payload.metadata || {},
    });
  }
}

async function getUsageLogs(startIso: string) {
  const usageSnap = await adminDb
    .collection(API_USAGE_COLLECTION)
    .where('createdAt', '>=', startIso)
    .orderBy('createdAt', 'asc')
    .limit(3000)
    .get();

  return usageSnap.docs.map((doc) => doc.data() as Record<string, any>);
}

async function getMetricEvents(startIso: string) {
  const metricSnap = await adminDb
    .collection(METRIC_COLLECTION)
    .where('createdAt', '>=', startIso)
    .orderBy('createdAt', 'asc')
    .limit(5000)
    .get();

  return metricSnap.docs.map((doc) => doc.data() as Record<string, any>);
}

export async function getMonitoringDashboard(): Promise<MonitoringDashboardPayload> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [usageLogs, metricEvents] = await Promise.all([
    getUsageLogs(dayAgo),
    getMetricEvents(dayAgo),
  ]);

  const buckets = new Map<
    string,
    {
      responseTimes: number[];
      errors: number;
      requests: number;
      dbDurations: number[];
      cacheHits: number;
      cacheMisses: number;
      activeUsers: number[];
    }
  >();

  const endpointMap = new Map<
    string,
    { responseTimes: number[]; errors: number; requests: number }
  >();
  const moduleMap = new Map<MonitoringModule, { errors: number; events: number }>();

  for (const log of usageLogs) {
    const createdAt = typeof log.createdAt === 'string' ? log.createdAt : now.toISOString();
    const bucket = toBucketKey(createdAt);
    const existing = buckets.get(bucket) || {
      responseTimes: [],
      errors: 0,
      requests: 0,
      dbDurations: [],
      cacheHits: 0,
      cacheMisses: 0,
      activeUsers: [],
    };

    const responseTime = Number(log.responseTimeMs || 0);
    existing.requests += 1;
    existing.responseTimes.push(responseTime);
    if (Number(log.status || 200) >= 500) existing.errors += 1;
    buckets.set(bucket, existing);

    const endpoint = String(log.endpoint || 'unknown');
    const endpointStats = endpointMap.get(endpoint) || {
      responseTimes: [],
      errors: 0,
      requests: 0,
    };
    endpointStats.requests += 1;
    endpointStats.responseTimes.push(responseTime);
    if (Number(log.status || 200) >= 500) endpointStats.errors += 1;
    endpointMap.set(endpoint, endpointStats);
  }

  let rumPageViews = 0;
  let trialCount = 0;
  let paidCount = 0;

  for (const event of metricEvents) {
    const createdAt = typeof event.createdAt === 'string' ? event.createdAt : now.toISOString();
    const bucket = toBucketKey(createdAt);
    const existing = buckets.get(bucket) || {
      responseTimes: [],
      errors: 0,
      requests: 0,
      dbDurations: [],
      cacheHits: 0,
      cacheMisses: 0,
      activeUsers: [],
    };

    if (event.type === 'database_query_duration') {
      existing.dbDurations.push(Number(event.durationMs || 0));
    }

    if (event.type === 'cache_event') {
      if (event.cacheResult === 'hit') existing.cacheHits += 1;
      if (event.cacheResult === 'miss') existing.cacheMisses += 1;
    }

    if (event.type === 'active_session') {
      existing.activeUsers.push(Number(event.activeUsers || 0));
    }

    if (event.type === 'error_event') {
      existing.errors += 1;
      const moduleKey = toModule(typeof event.module === 'string' ? event.module : 'unknown');
      const moduleStats = moduleMap.get(moduleKey) || { errors: 0, events: 0 };
      moduleStats.errors += 1;
      moduleStats.events += 1;
      moduleMap.set(moduleKey, moduleStats);
    }

    if (event.type === 'web_vital') {
      rumPageViews += 1;
    }

    if (event.type === 'conversion_event') {
      if (event.conversionStage === 'trial') trialCount += 1;
      if (event.conversionStage === 'paid') paidCount += 1;
    }

    buckets.set(bucket, existing);
  }

  const windows = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-48)
    .map(([bucket, stats]) => {
      const cacheTotal = stats.cacheHits + stats.cacheMisses;
      return {
        bucket,
        responseTimeP95: round(percentile(stats.responseTimes, 95)),
        errorRate: round(stats.requests > 0 ? (stats.errors / stats.requests) * 100 : 0),
        databaseQueryP95: round(percentile(stats.dbDurations, 95)),
        cacheHitRate: round(cacheTotal > 0 ? (stats.cacheHits / cacheTotal) * 100 : 0),
        activeUsers: round(avg(stats.activeUsers)),
      };
    });

  const allResponseTimes = usageLogs.map((log) => Number(log.responseTimeMs || 0));
  const totalRequests = usageLogs.length;
  const totalErrors = usageLogs.filter((log) => Number(log.status || 200) >= 500).length;

  const allDbDurations = metricEvents
    .filter((event) => event.type === 'database_query_duration')
    .map((event) => Number(event.durationMs || 0));

  const cacheHits = metricEvents.filter(
    (event) => event.type === 'cache_event' && event.cacheResult === 'hit',
  ).length;
  const cacheMisses = metricEvents.filter(
    (event) => event.type === 'cache_event' && event.cacheResult === 'miss',
  ).length;
  const activeUsers = metricEvents
    .filter((event) => event.type === 'active_session')
    .map((event) => Number(event.activeUsers || 0));

  const responseTimeP95 = round(percentile(allResponseTimes, 95));
  const errorRate = round(totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0);
  const databaseQueryP95 = round(percentile(allDbDurations, 95));
  const cacheHitRate = round(
    cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0,
  );
  const avgActiveUsers = round(avg(activeUsers));
  const conversionTrialToPaidRate = round(trialCount > 0 ? (paidCount / trialCount) * 100 : 0);

  const healthSnapshot = await adminDb.collection('system_health').doc('latest').get();
  const health = healthSnapshot.exists ? (healthSnapshot.data() as Record<string, unknown>) : {};
  const databaseCpu = Number(health.databaseCpu ?? 0);
  const diskAvailable = Number(health.diskAvailable ?? 100);

  const alerts = await evaluateAlertStates({
    errorRate,
    responseTimeP95,
    databaseCpu,
    diskAvailable,
  });

  const endpointMetrics = [...endpointMap.entries()]
    .map(([endpoint, stats]) => ({
      endpoint,
      p95ResponseMs: round(percentile(stats.responseTimes, 95)),
      errorRate: round(stats.requests > 0 ? (stats.errors / stats.requests) * 100 : 0),
      requests: stats.requests,
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 15);

  const moduleErrorRates = [...moduleMap.entries()].map(([module, stats]) => ({
    module,
    errorRate: round(stats.events > 0 ? (stats.errors / stats.events) * 100 : 0),
    errors: stats.errors,
    events: stats.events,
  }));

  return {
    generatedAt: now.toISOString(),
    windows,
    summary: {
      responseTimeP95,
      errorRate,
      activeUsers: avgActiveUsers,
      cacheHitRate,
      databaseQueryP95,
      conversionTrialToPaidRate,
      rumPageViews,
    },
    endpointMetrics,
    moduleErrorRates,
    alerts,
  };
}
