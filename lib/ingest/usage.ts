import { adminDb } from '@/lib/firebaseAdmin';

/**
 * Ingest usage attribution (USAGE-2).
 *
 * Middleware logs every API call to `api_usage_logs`, and it resolves the tenant from the
 * `tenant_id` cookie — written at session-login from verified claims. That works for a
 * browser. It cannot work for ingest: a tenant's website posts server-to-server with an
 * `x-api-key` header and no cookies at all, so every one of those calls was filed under
 * `tenantId: 'unknown'` and `userId: 'ip:<hash>'`.
 *
 * The reason is structural rather than an oversight. Middleware runs BEFORE the route, and
 * an ingest request is only attributable AFTER authenticateIngest() has matched the key to
 * a workspace. Nothing upstream of that can know whose call it is.
 *
 * USAGE-1 made this visible by scoping the usage queries to the caller's tenant: a tenant
 * opening Settings → API Usage now sees nothing at all from their website integration,
 * because none of it is filed under their id. The one integration they would most want to
 * watch — is my form working? how many leads came in? — is the one that is invisible.
 *
 * So the route records its own usage once it knows who is calling. Middleware's entry for
 * the same request still exists under 'unknown'; that is platform-level traffic data and
 * is left alone. This adds the attributable record that the tenant-facing screens read.
 */

export type IngestUsageEvent = {
  tenantId: string;
  endpoint: string;
  method: string;
};

/**
 * Records one authenticated ingest call, at the moment the caller becomes attributable.
 *
 * Deliberately recorded at authentication rather than at the response. Attribution is the
 * defect: a call the tenant made was filed under someone else's name. Capturing the
 * response STATUS as well would mean wrapping each route body so every return path and
 * thrown error flowed through one exit — a whole-function re-indent across three routes,
 * for a refinement rather than the fix. A per-status breakdown is worth having and is
 * better done deliberately, on its own, than smuggled in here.
 *
 * Never throws and is never awaited on the caller's critical path. A lead that was
 * accepted must not fail because a usage row could not be written — the business fact is
 * already committed, and losing a metric is a far smaller loss than losing the lead.
 */
export async function recordIngestUsage(event: IngestUsageEvent): Promise<void> {
  const tenantId = String(event.tenantId || '').trim();

  // An unattributable call is not worth recording: it would land in the same 'unknown'
  // bucket this exists to escape, and double-count against middleware's own entry.
  if (!tenantId) return;

  try {
    await adminDb.collection('api_usage_logs').add({
      endpoint: event.endpoint,
      tenantId,
      // The API key identifies a workspace, not a person. Recording a synthetic user id
      // rather than a real one keeps the distinction visible on the usage screen.
      userId: 'api_key',
      userEmail: '',
      ip: '',
      method: event.method,
      // 200 is the authentication outcome, not the response code: reaching this point
      // means the key resolved to this workspace. See the note above on why the response
      // status is not captured here.
      status: 200,
      responseTimeMs: 0,
      rateLimitRuleId: '',
      quotaExceeded: false,
      apiVersion: 'unversioned',
      isDeprecatedApiAlias: false,
      // Matches the field middleware writes, so both records sort together and the
      // existing (tenantId, createdAt) index serves this without a second one.
      createdAt: new Date().toISOString(),
      source: 'ingest',
    });
  } catch {
    // Logged without the tenant id or the endpoint: this runs on paths carrying customer
    // data, and a metrics failure is not worth leaking context over.
    console.error('[USAGE] failed to record ingest usage');
  }
}
