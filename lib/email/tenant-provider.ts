import { adminDb } from '@/lib/firebaseAdmin';
import { encryptApiKey, decryptApiKey, isEncryptedApiKey } from '@/lib/ai/byok-crypto';

/**
 * Tenant email provider — bring your own key (MAIL-6).
 *
 * Every message Bizosto sends leaves through Bizosto's own Resend account, including mail
 * a tenant sends to its own customers. MAIL-1 through MAIL-4 made that as honest as it can
 * be — a verified tenant domain in `from`, the tenant's name when it is not verified,
 * replies routed to the tenant — but the account doing the sending is still Bizosto's, and
 * that has consequences a tenant cannot fix from inside the product:
 *
 *   - Reputation is shared. One tenant sending badly damages deliverability for everyone
 *     on the account, and a well-behaved tenant cannot build a sending reputation of their
 *     own.
 *   - Bounces, complaints and open data live in Bizosto's dashboard, not the tenant's, so
 *     a tenant cannot see why their invoice did not arrive.
 *   - Sending volume counts against Bizosto's quota rather than theirs.
 *
 * With their own provider key, a tenant's customer-facing mail leaves through their own
 * account entirely. Bizosto is no longer in the path.
 *
 * The credential is encrypted at rest with the same AES-256-GCM helper the AI BYOK keys
 * use, so operators manage one style of encryption key across the platform. It is never
 * returned to a browser, never logged, and never included in an audit record — only a
 * masked hint, which is enough to tell two keys apart and useless to anyone who steals it.
 *
 * Storage is `tenants/{tenantId}/integrations/email`, matching the existing integration
 * convention. Firestore rules already deny the client SDK every tenant subcollection
 * except activity_feed, so the ciphertext is unreachable from a browser by default rather
 * than by a rule somebody remembered to add.
 */

export const EMAIL_INTEGRATION_DOC = 'email';

export type TenantEmailProviderName = 'resend' | 'sendgrid' | 'ses';

export const TENANT_EMAIL_PROVIDERS: readonly TenantEmailProviderName[] = [
  'resend',
  'sendgrid',
  'ses',
] as const;

export type TenantEmailProviderConfig = {
  provider: TenantEmailProviderName;
  /** AES-256-GCM ciphertext. Never leaves the server. */
  apiKeyEnc: string;
  /** Last four characters, for telling two keys apart in the UI. */
  maskedKey: string;
  /** SES only. Meaningless for the others and stored empty. */
  region: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** What a browser is allowed to know about a stored provider. */
export type TenantEmailProviderStatus = {
  configured: boolean;
  provider: TenantEmailProviderName | null;
  maskedKey: string;
  region: string;
  updatedAt: string | null;
};

function providerRef(tenantId: string) {
  return adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('integrations')
    .doc(EMAIL_INTEGRATION_DOC);
}

/** Keeps only enough of a key to distinguish it. Never enough to use it. */
export function maskApiKey(plaintext: string): string {
  const trimmed = String(plaintext || '').trim();
  return trimmed.length <= 4 ? '••••' : `••••${trimmed.slice(-4)}`;
}

export function isSupportedProvider(value: unknown): value is TenantEmailProviderName {
  return TENANT_EMAIL_PROVIDERS.includes(String(value || '') as TenantEmailProviderName);
}

/**
 * Stores a tenant's provider credential.
 *
 * Encrypts before writing. The plaintext is never persisted and cannot be read back
 * afterwards by anyone, including a Super Admin — the same rule the ingest API keys follow.
 */
export async function saveTenantEmailProvider(input: {
  tenantId: string;
  provider: TenantEmailProviderName;
  apiKey: string;
  region?: string;
  actorUid: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const existing = await providerRef(input.tenantId).get();

  const config: TenantEmailProviderConfig = {
    provider: input.provider,
    apiKeyEnc: encryptApiKey(input.apiKey.trim()),
    maskedKey: maskApiKey(input.apiKey),
    region: input.provider === 'ses' ? String(input.region || '').trim() : '',
    createdBy: existing.exists
      ? (existing.data() as TenantEmailProviderConfig).createdBy
      : input.actorUid,
    createdAt: existing.exists ? (existing.data() as TenantEmailProviderConfig).createdAt : now,
    updatedAt: now,
  };

  await providerRef(input.tenantId).set(config);
}

/** What the settings screen may see. Never the credential. */
export async function getTenantEmailProviderStatus(
  tenantId: string,
): Promise<TenantEmailProviderStatus> {
  const snap = await providerRef(tenantId).get();
  if (!snap.exists) {
    return { configured: false, provider: null, maskedKey: '', region: '', updatedAt: null };
  }

  const config = snap.data() as TenantEmailProviderConfig;
  return {
    configured: true,
    provider: config.provider,
    maskedKey: config.maskedKey || '',
    region: config.region || '',
    updatedAt: config.updatedAt || null,
  };
}

export async function deleteTenantEmailProvider(tenantId: string): Promise<void> {
  await providerRef(tenantId).delete();
}

export type ResolvedTenantProvider = {
  provider: TenantEmailProviderName;
  apiKey: string;
  region: string;
};

/**
 * Loads and decrypts a tenant's provider for an actual send.
 *
 * Returns null rather than throwing when nothing is configured, when the document is
 * malformed, or when decryption fails — a rotated or mis-set encryption key must not stop
 * a tenant's invoices going out. The caller falls back to the platform provider, which is
 * a worse envelope but a delivered message, and the failure is logged for an operator.
 *
 * Logged without the tenant id: this runs on paths carrying customer data.
 */
export async function resolveTenantEmailProvider(
  tenantId: string | null | undefined,
): Promise<ResolvedTenantProvider | null> {
  const id = String(tenantId || '').trim();
  if (!id) return null;

  try {
    const snap = await providerRef(id).get();
    if (!snap.exists) return null;

    const config = snap.data() as TenantEmailProviderConfig;
    if (!isSupportedProvider(config.provider) || !config.apiKeyEnc) return null;

    // A value written before encryption existed would round-trip as plaintext. Refuse it
    // rather than send with something that was never meant to be a credential.
    if (!isEncryptedApiKey(config.apiKeyEnc)) return null;

    const apiKey = decryptApiKey(config.apiKeyEnc);
    if (!apiKey) return null;

    return { provider: config.provider, apiKey, region: config.region || '' };
  } catch {
    console.error('[EMAIL] failed to resolve tenant email provider');
    return null;
  }
}
