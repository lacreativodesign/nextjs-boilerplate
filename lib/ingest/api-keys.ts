import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';

/**
 * Tenant API keys (KEY-2).
 *
 * A tenant had exactly one key, stored as a single `apiKeyHash` field on the tenant
 * document. Generating a new one overwrote that field, which meant rotation could not be
 * done without an outage: the moment an admin clicks Rotate, every request from their
 * website starts failing, and stays failing until somebody pastes the new key into the
 * other system and redeploys it. Nobody rotates a key under those terms — which is the
 * real cost. A credential that cannot be rotated safely does not get rotated at all, and
 * a leaked one stays live.
 *
 * Keys now live at `tenants/{tenantId}/api_keys/{keyId}`, and a workspace may hold several
 * active at once. Rotation becomes: create the new key, deploy it, revoke the old one —
 * with no window where neither works.
 *
 * Each record carries the metadata needed to manage a key you can no longer read: a name,
 * so an admin knows which system holds it; a prefix, so the one shown in a log can be
 * matched to the one in the list; and a last-used timestamp, so a key nothing is calling
 * with can be revoked with confidence rather than hope.
 *
 * The legacy root `apiKeyHash` is still honoured on lookup. Every existing tenant has one,
 * and breaking live integrations to tidy a schema would be the wrong trade. It is migrated
 * on the next rotation and never written again.
 */

export const API_KEYS_SUBCOLLECTION = 'api_keys';

/** Characters of the key shown in the UI and in logs. Enough to disambiguate, useless alone. */
const PREFIX_LENGTH = 8;

export type TenantApiKeyRecord = {
  keyHash: string;
  /** Human label — "WDD website", "staging". The only way to tell keys apart. */
  name: string;
  /** First few characters of the plaintext, for matching a key to its record. */
  prefix: string;
  tenantId: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
};

export function hashApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Mirrors lib/ingest/auth.ts. `===` short-circuits on the first differing byte and leaks
 * the digest prefix through response timing; the length check comes first because
 * timingSafeEqual throws on a mismatch and that throw is itself an oracle.
 */
export function hashesMatch(a: unknown, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export type NewApiKey = {
  keyId: string;
  plaintext: string;
  prefix: string;
};

/**
 * Issues a key without touching any existing one.
 *
 * Returns the plaintext exactly once — only its hash is stored, so it cannot be recovered
 * afterwards even by a Super Admin.
 */
export async function createTenantApiKey(input: {
  tenantId: string;
  name: string;
  createdBy: string;
}): Promise<NewApiKey> {
  const plaintext = crypto.randomBytes(32).toString('hex');
  const prefix = plaintext.slice(0, PREFIX_LENGTH);

  const ref = adminDb
    .collection('tenants')
    .doc(input.tenantId)
    .collection(API_KEYS_SUBCOLLECTION)
    .doc();

  const record: TenantApiKeyRecord = {
    keyHash: hashApiKey(plaintext),
    name: input.name.trim().slice(0, 80) || 'Untitled key',
    prefix,
    // Denormalised so a collection-group lookup knows the workspace without a second read.
    tenantId: input.tenantId,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    lastUsedAt: null,
    revokedAt: null,
    revokedBy: null,
  };

  await ref.set(record);
  return { keyId: ref.id, plaintext, prefix };
}

export type ApiKeyLookup = {
  tenantId: string;
  keyId: string;
  record: TenantApiKeyRecord;
};

/**
 * Finds the active key matching a presented secret, across every workspace.
 *
 * A collection-group query, because the caller has only the key — the whole point of the
 * key-only path is that no tenant id need be supplied. Revoked keys are filtered AFTER the
 * query rather than in it: `where('revokedAt', '==', null)` would need a composite index
 * and would silently exclude any record written before that field existed.
 */
export async function findActiveApiKey(keyHash: string): Promise<ApiKeyLookup | null> {
  const snap = await adminDb
    .collectionGroup(API_KEYS_SUBCOLLECTION)
    .where('keyHash', '==', keyHash)
    .limit(5)
    .get();

  for (const doc of snap.docs) {
    const record = doc.data() as TenantApiKeyRecord;
    if (record.revokedAt) continue;
    // The parent of `tenants/{id}/api_keys/{keyId}` is the api_keys collection, whose own
    // parent is the tenant document.
    const tenantId = record.tenantId || doc.ref.parent.parent?.id || '';
    if (!tenantId) continue;
    return { tenantId, keyId: doc.id, record };
  }

  return null;
}

/** Finds a key belonging to one named workspace. Used when x-tenant-id is supplied. */
export async function findActiveApiKeyForTenant(
  tenantId: string,
  keyHash: string,
): Promise<ApiKeyLookup | null> {
  const snap = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection(API_KEYS_SUBCOLLECTION)
    .where('keyHash', '==', keyHash)
    .limit(5)
    .get();

  for (const doc of snap.docs) {
    const record = doc.data() as TenantApiKeyRecord;
    if (record.revokedAt) continue;
    return { tenantId, keyId: doc.id, record };
  }

  return null;
}

/**
 * Stamps when a key was last used.
 *
 * Never awaited by the request that triggered it and never throws: a lead must not fail
 * because a bookkeeping write did. Written on every authenticated call rather than
 * throttled — the extra write is cheap next to knowing, with certainty, that a key is
 * genuinely idle before revoking it.
 */
export async function touchApiKey(tenantId: string, keyId: string): Promise<void> {
  try {
    await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection(API_KEYS_SUBCOLLECTION)
      .doc(keyId)
      .update({ lastUsedAt: new Date().toISOString() });
  } catch {
    console.error('[API_KEY] failed to stamp last used');
  }
}
