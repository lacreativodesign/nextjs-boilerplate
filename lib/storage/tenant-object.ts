import { NextResponse } from 'next/server';
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
  /**
   * Cloud Storage's generation for the object: a new value every time the object at a
   * path is replaced. Path alone does not identify bytes — an overwrite keeps the path
   * and changes everything about what is stored there — so this is what makes a
   * reservation or a registration refer to one specific set of bytes.
   */
  generation: string;
  /** True when Cloud Storage reports no object at this path at all. */
  missing: boolean;
  /** Populated when `ok` is false, safe to return to the caller. */
  error?: string;
}

/** Identifies one specific set of bytes: the path plus the generation stored there. */
export function tenantObjectKey(storagePath: string, generation: string): string {
  return `${storagePath}#${generation}`;
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
    return { ok: false, size: 0, generation: '', missing: false, error: 'Invalid storage path.' };
  }

  try {
    const [metadata] = await tenantBucket().file(storagePath).getMetadata();
    const size = Number(metadata?.size);
    const generation = String(metadata?.generation ?? '').trim();

    if (!Number.isFinite(size) || size < 0) {
      return {
        ok: false,
        size: 0,
        generation: '',
        missing: false,
        error: 'Uploaded file could not be measured.',
      };
    }

    // Without a generation the bytes at this path cannot be identified, and reusing a
    // reservation or a registration for them would be a guess. Fail closed instead.
    if (!generation) {
      return {
        ok: false,
        size: 0,
        generation: '',
        missing: false,
        error: 'Uploaded file could not be identified.',
      };
    }

    return { ok: true, size: Math.floor(size), generation, missing: false };
  } catch (error) {
    // A 404 means there is genuinely nothing stored here, which a delete path may act on;
    // anything else is unreadable and must be treated as "still there, unknown".
    const missing = (error as { code?: number } | null)?.code === 404;
    return {
      ok: false,
      size: 0,
      generation: '',
      missing,
      error: missing
        ? 'Uploaded file was not found in storage.'
        : 'Uploaded file could not be read from storage.',
    };
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
 * Removes ONE SPECIFIC GENERATION of a tenant-owned object.
 *
 * Deleting by path alone is a time-of-check/time-of-use bug. A request measures the
 * object at path P as generation G1, decides to refuse it, and by the time it deletes,
 * the browser has replaced P with G2. A delete by path removes G2 — bytes this request
 * never measured, never charged for, and does not own. The victim is whoever uploaded
 * G2, and they lose a file they were told was stored.
 *
 * `ifGenerationMatch` makes the delete conditional on the object still being the exact
 * one that was measured. A mismatch fails the precondition, nothing is deleted, and the
 * caller is told the removal did not happen — which every caller already treats as
 * "keep counting these bytes". Fail-closed in the direction that never destroys data.
 *
 * A caller with no generation cannot name what it wants removed, so nothing is removed.
 *
 * Never throws: a failed cleanup must not turn a correct 403 into a 500.
 */
export async function deleteTenantObject(
  storagePath: string,
  tenantId: string,
  generation: string,
): Promise<TenantObjectRemoval> {
  if (!isTenantStoragePath(storagePath, tenantId)) {
    return { addressable: false, removed: false };
  }

  const target = String(generation ?? '').trim();
  if (!target) {
    // Refusing here is what stops a path-only delete from reaching an unmeasured object.
    console.error('[STORAGE] Refusing to delete without a generation', { storagePath });
    return { addressable: true, removed: false };
  }

  try {
    await tenantBucket()
      .file(storagePath)
      .delete({ ignoreNotFound: true, ifGenerationMatch: target });
    return { addressable: true, removed: true };
  } catch (error) {
    // Includes 412 Precondition Failed: the object is no longer the one we measured, so
    // it is emphatically not ours to remove.
    console.error('[STORAGE] Failed to remove tenant storage object', error);
    return { addressable: true, removed: false };
  }
}

/** Machine-readable code for a record whose object predates tenant-scoped paths. */
export const LEGACY_STORAGE_PATH = 'legacy_storage_path';

/**
 * Frees a record's bytes before its quota is freed, for the delete routes.
 *
 * Returns a response when the delete must NOT proceed, and null when it may.
 *
 * Both failure outcomes block the delete, and for the same reason: usage excludes
 * soft-deleted records, so clearing a record whose object is still in the bucket
 * recovers quota for bytes Bizosto is still being billed for. That is the quota bypass
 * this PR exists to close, and it does not stop being one because the path is old.
 *
 * An earlier revision let an unaddressable legacy path through, on the reasoning that a
 * tenant must not be trapped with an undeletable record. That traded a monetization
 * invariant for a usability one, and it was the wrong trade: it let pre-S5 records
 * manufacture free quota while their bytes stayed billable and invisible. The record now
 * stays live and counted, and the refusal says exactly what has to happen instead —
 * a privileged cleanup that can establish ownership of a flat path, which no
 * tenant-scoped request can do safely.
 */
export async function purgeRecordStorageObject(
  record: Record<string, unknown> | undefined,
): Promise<NextResponse | null> {
  const storagePath = String(record?.storagePath || '');
  // A record that never had an object has no bytes to free and nothing to count.
  if (!storagePath) return null;

  const tenantId = String(record?.tenantId || '');
  const measured = await getVerifiedTenantObjectSize(storagePath, tenantId);

  // Nothing stored: the bytes are already gone, so clearing the record is honest.
  if (measured.missing) return null;

  if (!measured.ok) {
    // Either a path this tenant cannot be proven to own, or an object that could not be
    // read. Both leave bytes possibly still billable, so the record stays and keeps
    // counting. Only the legacy case gets its own code, because it needs a human.
    if (!isTenantStoragePath(storagePath, tenantId)) {
      return NextResponse.json(
        {
          ok: false,
          error: LEGACY_STORAGE_PATH,
          message:
            'This file is stored under a legacy path that cannot be verified as belonging ' +
            'to your workspace, so it cannot be removed automatically. It still counts ' +
            'towards your storage until support removes it. Contact support to have it ' +
            'cleared.',
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: 'Could not read the stored file. Nothing was deleted.' },
      { status: 502 },
    );
  }

  // Delete exactly the generation just measured, so a replacement that landed in between
  // is never destroyed by this request.
  const purge = await deleteTenantObject(storagePath, tenantId, measured.generation);
  if (!purge.removed) {
    return NextResponse.json(
      { ok: false, error: 'Could not remove the stored file. Nothing was deleted.' },
      { status: 502 },
    );
  }

  return null;
}
