import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_TENANT_ID, normalizeTenantId } from '@/lib/tenant';

export type IngestAuthSuccess = {
  ok: true;
  tenantId: string;
  tenantData: FirebaseFirestore.DocumentData;
  via: 'tenant-header' | 'key-lookup' | 'global-key';
};
export type IngestAuthFailure = { ok: false; status: number; error: string };
export type IngestAuthResult = IngestAuthSuccess | IngestAuthFailure;

const hashKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export interface AuthenticateIngestOptions {
  fallbackApiKey?: string | null;
  fallbackTenantId?: string | null;
  allowGlobalKeyFallback?: boolean;
}

/**
 * Single source of truth for inbound ingest authentication.
 * Models supported (preserved from the original routes):
 *  1) x-tenant-id header present -> validate x-api-key against that tenant's apiKeyHash (plaintext apiKey fallback).
 *  2) no tenant header -> resolve tenant by apiKeyHash lookup (key is bound to exactly one workspace).
 *  3) opt-in legacy global ERP_INGEST_KEY -> tenantId from caller body/header.
 */
export async function authenticateIngest(
  req: Request,
  options: AuthenticateIngestOptions = {},
): Promise<IngestAuthResult> {
  const headerTenantId = normalizeOptionalString(req.headers.get('x-tenant-id'));

  let queryApiKey: string | null = null;
  try {
    queryApiKey = normalizeOptionalString(new URL(req.url).searchParams.get('apiKey'));
  } catch {
    queryApiKey = null;
  }

  const apiKey =
    normalizeOptionalString(req.headers.get('x-api-key')) ||
    queryApiKey ||
    normalizeOptionalString(options.fallbackApiKey ?? null);

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
    const keyValid =
      (tenantData.apiKeyHash && tenantData.apiKeyHash === keyHash) ||
      (!tenantData.apiKeyHash && tenantData.apiKey === apiKey);
    if (!keyValid) {
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

  // 3) Legacy global key fallback (opt-in).
  if (options.allowGlobalKeyFallback && apiKey === String(process.env.ERP_INGEST_KEY || '')) {
    const resolved = normalizeTenantId(
      normalizeOptionalString(options.fallbackTenantId ?? null) ||
        headerTenantId ||
        DEFAULT_TENANT_ID,
    );
    const tenantSnap = await adminDb.doc(`tenants/${resolved}`).get();
    const tenantData = tenantSnap.exists ? tenantSnap.data() || {} : {};
    return { ok: true, tenantId: resolved, tenantData, via: 'global-key' };
  }

  return { ok: false, status: 401, error: 'invalid_credentials' };
}
