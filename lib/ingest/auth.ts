import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';

export type IngestAuthSuccess = {
  ok: true;
  tenantId: string;
  tenantData: FirebaseFirestore.DocumentData;
  via: 'tenant-header' | 'key-lookup';
};
export type IngestAuthFailure = { ok: false; status: number; error: string };
export type IngestAuthResult = IngestAuthSuccess | IngestAuthFailure;

const hashKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `===` on a secret comparison short-circuits at the first differing byte, so response
 * timing leaks the digest prefix. Both sides are fixed-length SHA-256 hex here, but the
 * length is still checked first because timingSafeEqual throws on a mismatch and that
 * throw would itself be an oracle.
 */
function hashesMatch(a: unknown, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Single source of truth for inbound ingest authentication. Every request is
 * bound to exactly one tenant by a per-tenant hashed API key — there is no
 * global shared-key fallback (removed in E6: it let any holder of ERP_INGEST_KEY
 * write into any tenant by naming it in the body).
 *
 * KEY-1 removed three ways a credential could arrive or be checked unsafely:
 *
 *  - The key is accepted ONLY from the `x-api-key` header. It used to be read from the
 *    `apiKey` query parameter and from the JSON body as well. A key in a URL is written
 *    to access logs, proxy logs, browser history and Referer headers; a key in a body is
 *    written to any request-body logging or error capture. Neither is a place a live
 *    credential can be allowed to land.
 *  - The stored hash is compared in constant time rather than with `===`.
 *  - The plaintext `apiKey` field is no longer accepted as a legacy fallback. It let a
 *    tenant document authenticate against an unhashed secret at rest, which is exactly
 *    what apiKeyHash exists to prevent. /api/admin/settings/api-key has only ever
 *    written apiKeyHash, so nothing in the product issues such a key.
 *
 * Models supported:
 *  1) x-tenant-id header present -> validate x-api-key against that tenant's apiKeyHash.
 *  2) no tenant header -> resolve tenant by apiKeyHash lookup (key bound to one workspace).
 */
export async function authenticateIngest(req: Request): Promise<IngestAuthResult> {
  const headerTenantId = normalizeOptionalString(req.headers.get('x-tenant-id'));

  const apiKey = normalizeOptionalString(req.headers.get('x-api-key'));

  if (!apiKey) {
    return { ok: false, status: 401, error: 'missing_auth' };
  }

  const keyHash = hashKey(apiKey);

  // 1) Explicit tenant header -> validate key against that tenant doc.
  if (headerTenantId) {
    const tenantSnap = await adminDb.doc(`tenants/${headerTenantId}`).get();
    if (!tenantSnap.exists) {
      return { ok: false, status: 401, error: 'invalid_tenant' };
    }
    const tenantData = tenantSnap.data() || {};
    if (!hashesMatch(tenantData.apiKeyHash, keyHash)) {
      return { ok: false, status: 401, error: 'invalid_api_key' };
    }
    return { ok: true, tenantId: headerTenantId, tenantData, via: 'tenant-header' };
  }

  // 2) Resolve tenant by apiKeyHash (key bound to one workspace).
  const byHash = await adminDb
    .collection('tenants')
    .where('apiKeyHash', '==', keyHash)
    .limit(1)
    .get();
  if (!byHash.empty) {
    const doc = byHash.docs[0];
    return { ok: true, tenantId: doc.id, tenantData: doc.data() || {}, via: 'key-lookup' };
  }

  return { ok: false, status: 401, error: 'invalid_credentials' };
}
