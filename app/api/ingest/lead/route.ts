import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sunset (INGEST-2). The canonical endpoint is POST /api/ingest/leads.
 *
 * This route was a second, divergent implementation of lead capture, and it was worse than
 * the canonical one on every axis that matters:
 *
 *   - No idempotency. IDEM-1 gave /api/ingest/leads an exact-once guarantee via an
 *     Idempotency-Key claim; this route had none, so every retried submission created
 *     another lead for the same person.
 *   - It wrote `tenantId` straight from the `x-tenant-id` header rather than from
 *     `auth.tenantId`. That was safe only by coincidence — authenticateIngest happens to
 *     validate a supplied header tenant against that tenant's own key hash, so a
 *     cross-tenant write was not possible. But the route did not depend on that check; it
 *     depended on nobody changing it. The project rule exists precisely so safety is not
 *     a coincidence.
 *   - It validated the body BEFORE authenticating, so an unauthenticated caller could
 *     probe which fields a workspace requires.
 *   - Its rate limiter was an in-process Map. On serverless each instance keeps its own
 *     counter, so the limit was effectively multiplied by the instance count, and the Map
 *     was never pruned.
 *   - It required `x-tenant-id`, so it could not use the key-only path that /leads
 *     supports, and it took a different payload shape (`fullName`, `message`) from the
 *     canonical one (`lead.name`, `lead.email`).
 *
 * Nothing calls it. It was unreachable until INGEST-1 (the middleware classified
 * /api/ingest as platform-internal and rejected every tenant key), and Settings → API Key
 * documents only the plural endpoint. A 410 rather than a deletion because it names the
 * replacement: anyone who did build against it gets an answer, not a 404.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        'This endpoint has been retired. Use POST /api/ingest/leads, which supports Idempotency-Key so retries never duplicate a lead.',
      code: 'endpoint_sunset',
      canonicalEndpoint: '/api/ingest/leads',
    },
    { status: 410 },
  );
}
