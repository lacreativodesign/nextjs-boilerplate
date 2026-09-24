import { isTenantStoragePath } from '@/lib/storage/paths';
import { productStorageBucket } from '@/lib/storage/product-bucket';

/**
 * P0-07 — Firebase download tokens on protected tenant objects.
 *
 * `firebaseStorageDownloadTokens` is ordinary Cloud Storage custom metadata that the
 * Firebase Storage API treats as a bearer credential: any request carrying
 * `?token=<value>` for that object is served without consulting Security Rules, a
 * session, a tenant or a role, for as long as the value stays in the metadata.
 *
 * The Firebase browser SDK gets one on EVERY upload, whether or not the caller asks —
 * __tests__/rules/storage-download-token.rules.test.ts executes that against the pinned
 * emulator. So the six browser-direct upload surfaces create a permanent bearer URL for
 * every protected file even with getDownloadURL() deleted from the client. The server
 * therefore strips it during registration, after measuring the object and before the
 * record that makes the file visible to anyone else is written.
 *
 * Token VALUES are never returned, logged or compared by anything in this module. Only
 * their presence is observed.
 */

export const FIREBASE_DOWNLOAD_TOKEN_KEY = 'firebaseStorageDownloadTokens';

/** True when a Cloud Storage object's metadata carries a Firebase download token. */
export function hasFirebaseDownloadToken(metadata: unknown): boolean {
  const custom = (metadata as { metadata?: Record<string, unknown> } | null)?.metadata;
  const value = custom ? custom[FIREBASE_DOWNLOAD_TOKEN_KEY] : undefined;
  return typeof value === 'string' && value.trim().length > 0;
}

export type TokenStripOutcome =
  | { ok: true; stripped: boolean }
  | {
      ok: false;
      reason:
        | 'invalid_path'
        | 'missing_generation'
        | 'generation_changed'
        | 'not_found'
        | 'strip_unverified'
        | 'storage_error';
    };

/**
 * Removes the Firebase download token from ONE SPECIFIC GENERATION of a tenant object.
 *
 * Race and safety properties, each load-bearing:
 *
 *  - Generation-bound. The caller passes the generation it measured and charged for. If
 *    the object at the path is now a different generation, nothing is touched and the
 *    outcome is a failure: those bytes are not this request's to modify.
 *  - Metageneration-bound. The PATCH carries both `ifGenerationMatch` and
 *    `ifMetagenerationMatch`, so a concurrent metadata change — including a token being
 *    minted between our read and our write — fails the precondition instead of being
 *    overwritten by, or overwriting, a stale view.
 *  - Metadata only. A PATCH of custom metadata never rewrites bytes and never changes the
 *    generation, so the quota reservation keyed on `path#generation` and the record's
 *    `storageGeneration` stay exactly as measured.
 *  - Proven, not assumed. Success requires the metadata Cloud Storage returns AFTER the
 *    PATCH to still be the same generation and to carry no token. Anything else — an
 *    unexpected response shape included — is `strip_unverified`, and the caller refuses
 *    the registration.
 *  - Idempotent. A retry of a registration whose token is already gone is a no-op success.
 */
export async function stripFirebaseDownloadTokens(params: {
  storagePath: string;
  tenantId: string;
  generation: string;
}): Promise<TokenStripOutcome> {
  const storagePath = String(params.storagePath ?? '').trim();
  const tenantId = String(params.tenantId ?? '').trim();
  const generation = String(params.generation ?? '').trim();

  if (!isTenantStoragePath(storagePath, tenantId)) return { ok: false, reason: 'invalid_path' };
  if (!generation) return { ok: false, reason: 'missing_generation' };

  try {
    const file = productStorageBucket().file(storagePath);
    const [current] = await file.getMetadata();

    if (String(current?.generation ?? '') !== generation) {
      return { ok: false, reason: 'generation_changed' };
    }
    if (!hasFirebaseDownloadToken(current)) return { ok: true, stripped: false };

    const metageneration = String(current?.metageneration ?? '').trim();
    if (!metageneration) return { ok: false, reason: 'strip_unverified' };

    // Setting a custom-metadata key to null deletes it in the Cloud Storage JSON API.
    const [updated] = await file.setMetadata(
      { metadata: { [FIREBASE_DOWNLOAD_TOKEN_KEY]: null } },
      { ifGenerationMatch: generation, ifMetagenerationMatch: metageneration },
    );

    if (String(updated?.generation ?? '') !== generation || hasFirebaseDownloadToken(updated)) {
      return { ok: false, reason: 'strip_unverified' };
    }
    return { ok: true, stripped: true };
  } catch (error) {
    const code = (error as { code?: number } | null)?.code;
    if (code === 404) return { ok: false, reason: 'not_found' };
    // 412 is a failed precondition: the object or its metadata moved underneath us.
    if (code === 412) return { ok: false, reason: 'generation_changed' };
    // Deliberately not the error object: a Cloud Storage error body can echo metadata.
    console.error('[STORAGE] Download-token strip failed', { storagePath, code: code ?? null });
    return { ok: false, reason: 'storage_error' };
  }
}
