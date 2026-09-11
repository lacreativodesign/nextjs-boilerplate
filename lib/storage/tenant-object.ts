import { adminStorage } from '@/lib/firebaseAdmin';
import { getStorageBucketName } from '@/lib/storage/bucket';
import { isTenantStoragePath } from '@/lib/storage/paths';

/**
 * Server-authoritative facts about an object a browser uploaded directly.
 *
 * Six upload surfaces (project/AM/production files, client files, and both HR document
 * routes) do not stream their bytes through the server at all. The browser writes the
 * object to Cloud Storage with the Firebase client SDK and then POSTs a JSON body that
 * merely DESCRIBES it — including its `size`. Those routes then charged the tenant's
 * quota using that caller-supplied number.
 *
 * A caller who declares `size: 0` therefore stored a real object for free, and could
 * repeat it without bound. Storage rules cap a single object at 50MB, which bounds one
 * upload but not the total: 50MB at a time, forever, on a 20GB plan. The declared size
 * is a claim about the caller's own bytes and can never be the basis for metering them.
 *
 * getVerifiedTenantObjectSize() replaces the claim with the fact: it reads the object's
 * metadata through the Admin SDK and returns the size Cloud Storage actually recorded —
 * the same number Bizosto is billed for. It also proves the object exists, so a record
 * can no longer be written for bytes that were never uploaded.
 *
 * The tenant prefix is re-checked here as well as at the route. It is cheap, and it means
 * no caller-supplied path can ever address another tenant's object through this helper
 * even if a future route forgets its own check.
 */

function tenantBucket() {
  const bucketName = getStorageBucketName();
  return bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
}

export interface VerifiedTenantObject {
  ok: boolean;
  /** Authoritative byte size recorded by Cloud Storage. 0 when `ok` is false. */
  size: number;
  /** Populated when `ok` is false, safe to return to the caller. */
  error?: string;
}

/**
 * Reads the true byte size of a tenant-owned Storage object.
 *
 * Fails closed: a path outside the caller's tenant prefix, a missing object, or metadata
 * that carries no usable size is a rejection, never a zero-cost upload.
 */
export async function getVerifiedTenantObjectSize(
  storagePath: string,
  tenantId: string,
): Promise<VerifiedTenantObject> {
  if (!isTenantStoragePath(storagePath, tenantId)) {
    return { ok: false, size: 0, error: 'Invalid storage path.' };
  }

  try {
    const [metadata] = await tenantBucket().file(storagePath).getMetadata();
    const size = Number(metadata?.size);

    if (!Number.isFinite(size) || size < 0) {
      return { ok: false, size: 0, error: 'Uploaded file could not be measured.' };
    }

    return { ok: true, size: Math.floor(size) };
  } catch {
    // Includes the 404 a caller gets for describing an object it never uploaded.
    return { ok: false, size: 0, error: 'Uploaded file was not found in storage.' };
  }
}

/** Outcome of an attempted object removal. */
export interface TenantObjectRemoval {
  /** False when the path is not one this tenant owns, so nothing was attempted. */
  addressable: boolean;
  /** True when the object is gone, including when it was already absent. */
  removed: boolean;
}

/**
 * Removes a tenant-owned object from the bucket.
 *
 * Used on the quota-denial path: when a browser-direct upload is refused, the bytes are
 * already sitting in the bucket. Leaving them there would bill Bizosto for an object no
 * record points at — an orphan the tenant cannot see or delete. Removing it makes the
 * refusal actually free the space it refused.
 *
 * Also used by the delete routes, which may only recover quota once the bytes have
 * actually gone. The three outcomes are deliberately distinct:
 *
 *   addressable: false  the stored path is not under this tenant's prefix. Every route
 *                       has validated the prefix at write time since S5, so this is
 *                       legacy data written against a flat path. The object cannot be
 *                       proven to belong to this tenant, so it is not touched — and the
 *                       caller must not be left unable to delete its own record either.
 *   removed: false      a real failure. The caller must keep the record so usage keeps
 *                       counting bytes that still exist.
 *   removed: true       the bytes are gone and the quota may be recovered.
 *
 * Never throws: a failed cleanup must not turn a correct 403 into a 500.
 */
export async function deleteTenantObject(
  storagePath: string,
  tenantId: string,
): Promise<TenantObjectRemoval> {
  if (!isTenantStoragePath(storagePath, tenantId)) {
    return { addressable: false, removed: false };
  }
  try {
    await tenantBucket().file(storagePath).delete({ ignoreNotFound: true });
    return { addressable: true, removed: true };
  } catch (error) {
    console.error('[STORAGE] Failed to remove tenant storage object', error);
    return { addressable: true, removed: false };
  }
}
