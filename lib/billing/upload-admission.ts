import { NextResponse } from 'next/server';
import { storageLimitResponseBody, type StorageLimitCheck } from '@/lib/billing/storage-limit';
import {
  releaseTenantStorage,
  reserveTenantStorage,
  type StorageReservationKind,
  type TenantStorageReservation,
} from '@/lib/billing/storage-reservation';
import { deleteTenantObject, getVerifiedTenantObjectSize } from '@/lib/storage/tenant-object';
import { MAX_FILE_SIZE } from '@/lib/files/validation';

/**
 * Admission control for the browser-direct upload surfaces.
 *
 * These six routes (project/AM/production files, client files, and both HR document
 * routes) register a record for an object the BROWSER has already written to Cloud
 * Storage. By the time the route runs, the bytes exist and Bizosto is already paying for
 * them, so admission has to do three things that a bare checkStorageLimit() call did not:
 *
 *   1. Measure the object for real. The `size` in the request body is the caller's claim
 *      about its own upload; the bucket knows the truth. See lib/storage/tenant-object.ts.
 *
 *   2. Reserve the space atomically, so two concurrent registrations cannot both pass
 *      against the same remaining quota. See lib/billing/storage-reservation.ts.
 *
 *   3. Remove the object when it is refused. Otherwise a rejected upload leaves an orphan
 *      in the bucket: billable, unreferenced, and invisible to the tenant.
 *
 * The route keeps the reservation until its metadata write lands, then releases it — at
 * which point the record itself is what counts. Callers MUST release in a `finally`.
 */

export interface UploadAdmission {
  ok: boolean;
  /** Authoritative byte size from Cloud Storage; use this, never the declared size. */
  bytes: number;
  /** Present when admission succeeded; pass to releaseUploadAdmission() when done. */
  reservation: TenantStorageReservation | null;
  /** Present when refused for quota — render with storageLimitResponseBody(). */
  check: StorageLimitCheck | null;
  /** Present when refused for any other reason (missing/unmeasurable object). */
  error?: string;
  /** HTTP status the route should return when `ok` is false. */
  status: number;
}

/**
 * Verifies, reserves and admits one browser-direct upload.
 *
 * `tenantId` must come from the authenticated session — never from the request body —
 * so a caller can only ever spend its own tenant's quota.
 */
export async function admitTenantUpload(params: {
  tenantId: string;
  storagePath: string;
  kind: StorageReservationKind;
}): Promise<UploadAdmission> {
  const tenantId = String(params.tenantId ?? '').trim();
  if (!tenantId) {
    return { ok: false, bytes: 0, reservation: null, check: null, error: 'Forbidden', status: 403 };
  }

  const measured = await getVerifiedTenantObjectSize(params.storagePath, tenantId);
  if (!measured.ok) {
    return {
      ok: false,
      bytes: 0,
      reservation: null,
      check: null,
      error: measured.error || 'Uploaded file could not be measured.',
      status: 400,
    };
  }

  // validateFile() ran against the DECLARED size, and the app ceiling (25MB) is stricter
  // than the Storage-rules ceiling (50MB). A caller that declared 1MB and wrote 45MB
  // passed both gates, so the real length has to be re-checked here — and the object
  // removed, because it is already costing money.
  if (measured.size > MAX_FILE_SIZE) {
    await deleteTenantObject(params.storagePath, tenantId);
    return {
      ok: false,
      bytes: measured.size,
      reservation: null,
      check: null,
      error: 'File exceeds the maximum upload size.',
      status: 400,
    };
  }

  const reservation = await reserveTenantStorage({
    tenantId,
    bytes: measured.size,
    kind: params.kind,
    // One storagePath is one physical object, so it is the natural idempotency key: a
    // retried registration reuses its reservation instead of being charged twice.
    idempotencyKey: params.storagePath,
  });

  if (!reservation.ok) {
    // The bytes are already in the bucket and this upload is refused, so they must go.
    await deleteTenantObject(params.storagePath, tenantId);
    return {
      ok: false,
      bytes: measured.size,
      reservation: null,
      check: reservation,
      status: 403,
    };
  }

  return { ok: true, bytes: measured.size, reservation, check: null, status: 200 };
}

/** Releases an admission's reservation. Safe to call with a refused admission. */
export async function releaseUploadAdmission(admission: UploadAdmission | null): Promise<void> {
  await releaseTenantStorage(admission?.reservation);
}

/** Builds the response body for a refused admission, quota or otherwise. */
export function uploadAdmissionResponseBody(admission: UploadAdmission) {
  if (admission.check) {
    return storageLimitResponseBody(admission.check);
  }
  return { ok: false, error: admission.error || 'Upload rejected.' };
}

/**
 * The response a route returns for a refused admission — a quota 403 carrying the
 * machine-readable contract, or a 400 for an object that could not be measured.
 *
 * Returned from here rather than rebuilt at each call site: the six routes that register
 * a browser-direct upload were otherwise carrying the same eight lines of wiring each,
 * which is both duplication and eight lines of untested branch per route.
 */
export function uploadAdmissionRefusal(admission: UploadAdmission): NextResponse {
  return NextResponse.json(uploadAdmissionResponseBody(admission), { status: admission.status });
}
