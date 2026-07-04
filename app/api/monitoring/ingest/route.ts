// AUTH: Public endpoint — browser-side monitoring telemetry (web vitals, session events).
// Write-only; no tenant data is read or exposed. Because a browser cannot hold a secret,
// this endpoint is hardened by (1) the general per-IP middleware rate limit, (2) a hard
// request-size cap, and (3) strict field sanitization so a caller can never write
// arbitrary or oversized documents to the metrics collection.
import { NextResponse } from 'next/server';
import { ingestMetric } from '@/lib/monitoring/dashboard-service';
import type { MetricIngestPayload } from '@/lib/monitoring/types';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 8 * 1024; // 8KB is ample for a single telemetry event
const MAX_STR = 256;
const MAX_METADATA_BYTES = 2 * 1024;

const METRIC_TYPES = new Set([
  'api_response_time',
  'database_query_duration',
  'cache_event',
  'active_session',
  'error_event',
  'conversion_event',
  'web_vital',
]);
const MODULES = new Set(['api', 'database', 'cache', 'auth', 'billing', 'frontend', 'unknown']);
const CACHE_RESULTS = new Set(['hit', 'miss']);
const CONVERSION_STAGES = new Set(['trial', 'paid']);
const WEB_VITALS = new Set(['LCP', 'FID', 'CLS', 'INP', 'TTFB']);

function isMetricType(value: unknown): value is MetricIngestPayload['type'] {
  return typeof value === 'string' && METRIC_TYPES.has(value);
}

const clampStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length ? v.slice(0, MAX_STR) : undefined;

const finiteNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const enumStr = (v: unknown, set: Set<string>): string | undefined =>
  typeof v === 'string' && set.has(v) ? v : undefined;

// Build a payload containing ONLY known, bounded fields. ingestMetric spreads its
// argument straight into Firestore, so anything not whitelisted here is dropped.
function sanitizeMetricPayload(input: Record<string, unknown>): MetricIngestPayload {
  const out: Record<string, unknown> = { type: input.type };

  const endpoint = clampStr(input.endpoint);
  if (endpoint) out.endpoint = endpoint;
  const moduleVal = enumStr(input.module, MODULES);
  if (moduleVal) out.module = moduleVal;
  const durationMs = finiteNum(input.durationMs);
  if (durationMs !== undefined) out.durationMs = durationMs;
  const cacheResult = enumStr(input.cacheResult, CACHE_RESULTS);
  if (cacheResult) out.cacheResult = cacheResult;
  const activeUsers = finiteNum(input.activeUsers);
  if (activeUsers !== undefined) out.activeUsers = activeUsers;
  const errorCode = clampStr(input.errorCode);
  if (errorCode) out.errorCode = errorCode;
  const conversionStage = enumStr(input.conversionStage, CONVERSION_STAGES);
  if (conversionStage) out.conversionStage = conversionStage;
  const webVitalName = enumStr(input.webVitalName, WEB_VITALS);
  if (webVitalName) out.webVitalName = webVitalName;
  const webVitalValue = finiteNum(input.webVitalValue);
  if (webVitalValue !== undefined) out.webVitalValue = webVitalValue;

  // metadata: accept only a plain object whose serialized size is bounded; drop otherwise.
  if (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)) {
    try {
      const serialized = JSON.stringify(input.metadata);
      if (serialized.length <= MAX_METADATA_BYTES) {
        out.metadata = input.metadata as Record<string, unknown>;
      }
    } catch {
      // non-serializable metadata is dropped
    }
  }

  return out as MetricIngestPayload;
}

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
    }

    const body = parsed as Record<string, unknown>;
    if (!isMetricType(body.type)) {
      return NextResponse.json({ ok: false, error: 'Invalid metric type' }, { status: 400 });
    }

    await ingestMetric(sanitizeMetricPayload(body));

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    // Do not leak internal error details to an unauthenticated caller.
    console.error('monitoring ingest error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to ingest monitoring metric' },
      { status: 500 },
    );
  }
}
