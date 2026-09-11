import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { NextResponse } from 'next/server';
import { storageLimitResponseBody, type StorageLimitCheck } from '@/lib/billing/storage-limit';
import {
  releaseTenantStorage,
  reserveTenantStorage,
  type StorageReservationKind,
  type TenantStorageReservation,
} from '@/lib/billing/storage-reservation';
import {
  deleteTenantObject,
  getVerifiedTenantObjectSize,
  tenantObjectKey,
} from '@/lib/storage/tenant-object';
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
  /** Cloud Storage's generation for the measured object. */
  generation: string;
  /**
   * Deterministic Firestore document id for this object's metadata record.
   *
   * Derived from the storage path, so one path is one record no matter how many times
   * the registration is retried. See registrationIdForPath().
   */
  registrationId: string;
  /** Present when admission succeeded; pass to releaseUploadAdmission() when done. */
  reservation: TenantStorageReservation | null;
  /** Present when refused for quota — render with storageLimitResponseBody(). */
  check: StorageLimitCheck | null;
  /** Present when refused for any other reason (missing/unmeasurable object). */
  error?: string;
  /** HTTP status the route should return when `ok` is false. */
  status: number;
  /**
   * True when this exact physical object is ALREADY a live metadata record, so its bytes
   * are already in canonical usage and nothing further may be charged for them.
   */
  alreadyRegistered: boolean;
}

/**
 * The Firestore document id that a storage path's metadata record must use.
 *
 * Registration used to mint a random id per POST, so a request that committed its
 * record and then failed on a later step — a notification, an audit write — returned a
 * failure the caller would retry, and the retry wrote a SECOND live record for the same
 * physical object. Canonical usage then counted one object's bytes twice, and nothing
 * in the reservation could prevent it: by then the reservation had already been
 * released, exactly as it should have been.
 *
 * Deriving the id from the storage path makes registration an upsert. A retry lands on
 * the record it already wrote, and so does a concurrent duplicate. Cloud Storage keeps
 * one set of bytes per path, so one path is one object is one record; replacing the
 * object at a path updates that record in place with the new size and generation rather
 * than adding a second one that would charge for bytes no longer stored.
 *
 * The path is hashed rather than used directly because a Firestore document id may not
 * contain '/' and is length-bounded.
 */
export function registrationIdForPath(storagePath: string): string {
  return crypto
    .createHash('sha256')
    .update(String(storagePath ?? ''))
    .digest('hex')
    .slice(0, 40);
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
  /** Where this surface keeps its metadata: 'files' or 'employeeDocuments'. */
  collection: string;
}): Promise<UploadAdmission> {
  const tenantId = String(params.tenantId ?? '').trim();
  if (!tenantId) {
    return {
      ok: false,
      bytes: 0,
      generation: '',
      registrationId: '',
      reservation: null,
      check: null,
      error: 'Forbidden',
      status: 403,
      alreadyRegistered: false,
    };
  }

  const measured = await getVerifiedTenantObjectSize(params.storagePath, tenantId);
  if (!measured.ok) {
    return {
      ok: false,
      bytes: 0,
      generation: '',
      registrationId: '',
      reservation: null,
      check: null,
      error: measured.error || 'Uploaded file could not be measured.',
      status: 400,
      alreadyRegistered: false,
    };
  }

  // validateFile() ran against the DECLARED size, and the app ceiling (25MB) is stricter
  // than the Storage-rules ceiling (50MB). A caller that declared 1MB and wrote 45MB
  // passed both gates, so the real length has to be re-checked here — and the object
  // removed, because it is already costing money.
  if (measured.size > MAX_FILE_SIZE) {
    await deleteTenantObject(params.storagePath, tenantId, measured.generation);
    return {
      ok: false,
      bytes: measured.size,
      generation: measured.generation,
      registrationId: '',
      reservation: null,
      check: null,
      error: 'File exceeds the maximum upload size.',
      status: 400,
      alreadyRegistered: false,
    };
  }

  const registrationId = registrationIdForPath(params.storagePath);

  // PR4 remediation: is this exact physical object ALREADY a live record?
  //
  // Admission reserves the full measured size, but the record is only written
  // afterwards, so once a registration has committed its bytes are already in canonical
  // usage. Charging them again on retry is double-counting the same object — and at
  // exact quota the retry is refused, whereupon the refusal path deletes the object. A
  // successful upload destroyed by retrying it. The deterministic record id stops the
  // DUPLICATE; only this stops the second CHARGE, because by retry time the first
  // reservation has been released exactly as it should have been.
  const existing = await adminDb.collection(params.collection).doc(registrationId).get();
  const existingData = existing.exists ? existing.data() || {} : null;
  const existingIsLive = existingData ? existingData.isDeleted !== true : false;
  const existingGeneration = String(existingData?.storageGeneration ?? '');

  if (existingData && existingIsLive && existingGeneration === measured.generation) {
    // Already counted, once. Nothing to reserve, and emphatically nothing to delete.
    return {
      ok: true,
      bytes: measured.size,
      generation: measured.generation,
      registrationId,
      reservation: null,
      check: null,
      status: 200,
      alreadyRegistered: true,
    };
  }

  if (
    existingData &&
    existingIsLive &&
    existingGeneration &&
    existingGeneration !== measured.generation
  ) {
    // The path holds different bytes than the record that owns it. Browser uploads mint
    // a unique path per upload and Storage rules allow create-only on these prefixes
    // (see storage.rules), so this cannot arise from an approved flow. Refuse, and do
    // NOT delete: the newer generation belongs to whoever wrote it, not to this request.
    return {
      ok: false,
      bytes: measured.size,
      generation: measured.generation,
      registrationId: '',
      reservation: null,
      check: null,
      error: 'This storage path already holds a different file.',
      status: 409,
      alreadyRegistered: false,
    };
  }

  const reservation = await reserveTenantStorage({
    tenantId,
    bytes: measured.size,
    kind: params.kind,
    // Path AND generation. The path alone is not the object: replacing the bytes at a
    // path keeps the path and changes the size, so a path-only key would let a retry
    // for a larger object reuse the smaller object's reservation and overshoot.
    idempotencyKey: tenantObjectKey(params.storagePath, measured.generation),
  });

  if (!reservation.ok) {
    // The bytes are already in the bucket and this upload is refused, so they must go —
    // but only if they are still the exact generation this request measured.
    await deleteTenantObject(params.storagePath, tenantId, measured.generation);
    return {
      ok: false,
      bytes: measured.size,
      generation: measured.generation,
      registrationId: '',
      reservation: null,
      check: reservation,
      status: 403,
      alreadyRegistered: false,
    };
  }

  return {
    ok: true,
    bytes: measured.size,
    generation: measured.generation,
    registrationId,
    reservation,
    check: null,
    status: 200,
    alreadyRegistered: false,
  };
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

/**
 * Commits a browser-direct upload's metadata record, refusing to go backwards.
 *
 * Two requests can be in flight for one path, and they do not necessarily finish in the
 * order they started: request A measures generation G1, the object is replaced, request
 * B measures G2 and commits, and then A finally lands. A plain `set(..., {merge:true})`
 * lets A overwrite the record back to G1's size — so canonical usage would describe
 * bytes that are no longer stored, and the record would name an object that no longer
 * exists at that path.
 *
 * The write therefore runs in a transaction that reads the record first and drops the
 * update when the stored generation is NEWER than this one. Cloud Storage generations
 * are monotonically increasing for a path, so "newer" is a numeric comparison. The
 * record always ends up describing whichever object actually owns the path.
 *
 * Returns whether this request's data was written. `false` means a newer generation won,
 * which is a success for the caller: the record is already correct.
 */
export async function commitUploadRegistration(params: {
  collection: string;
  registrationId: string;
  generation: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const ref = adminDb.collection(params.collection).doc(params.registrationId);
  const incoming = Number(params.generation);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = Number(snap.exists ? (snap.data() || {}).storageGeneration : Number.NaN);

    // A newer generation already owns this path; this request is stale and must not win.
    if (Number.isFinite(stored) && Number.isFinite(incoming) && stored > incoming) {
      return false;
    }

    tx.set(ref, { ...params.payload, storageGeneration: params.generation }, { merge: true });
    return true;
  });
}
