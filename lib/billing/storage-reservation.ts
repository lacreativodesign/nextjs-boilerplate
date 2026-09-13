import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizePlan } from '@/lib/tenant/plan-access';
import {
  normalizeBytes,
  storageLimitForPlan,
  tenantStorageSources,
  totalStorageBytes,
  type StorageLimitCheck,
} from '@/lib/billing/storage-limit';

/**
 * Atomic tenant storage reservation.
 *
 * checkStorageLimit() answers "is there room right now?". Every upload path then went on
 * to write bytes to the bucket and a metadata record to Firestore. Between the read and
 * the write there is a window in which a second request reads the same free space, and
 * both pass. A Starter tenant at 19.9GB of 20GB receiving two concurrent 500MB uploads
 * had both observe 19.9GB, both pass, and finish at 20.9GB. An in-memory mutex cannot
 * fix this: serverless instances are distributed and share no memory. Sleep/retry only
 * narrows the window.
 *
 * This is the same defect class already fixed for staff seats, and the fix is the same
 * shape, deliberately: a serialization point in Firestore itself. Every reservation runs
 * in one transaction that READS and WRITES a single per-tenant ledger document. Firestore
 * transactions are serializable over their read set, so two concurrent reservations for
 * the same tenant cannot both commit: the second is retried against the state the first
 * committed, re-counts, and is denied. The ledger document is the only contention point,
 * so tenants never block each other and no reservation can ever observe another tenant's.
 *
 * Counting rules are NOT duplicated here. The transaction reads the same aggregate byte
 * sources as lib/billing/storage-limit.ts through tenantStorageSources(), then adds the
 * bytes other in-flight requests are holding:
 *
 *   used = live bytes in files + employeeDocuments + erp_file_versions + documents
 *        + bytes reserved by in-flight uploads
 *
 * A reservation is short-lived and self-healing. The caller releases it once the metadata
 * record has landed (at which point the record itself is counted) or the upload has
 * failed, and it expires on its own if the instance holding it dies mid-request, so an
 * abandoned upload can never park quota permanently.
 *
 * Idempotency. A caller that passes `idempotencyKey` gets one reservation per key: a
 * retry of the same upload finds the live reservation and reuses it instead of charging
 * the tenant a second time for bytes it is already holding.
 */

/**
 * One ledger document per tenant; its reservations live in a subcollection.
 *
 * The call sites below spell both names as string literals rather than using these
 * constants, because the Firestore inventory generator (scripts/generate-firestore-schema.mjs)
 * only resolves statically-written collection ids. Routing them through a constant would
 * keep a real collection out of docs/database/collections.generated.md.
 */
export const STORAGE_LEDGER_COLLECTION = 'tenant_storage_ledgers';
export const STORAGE_RESERVATION_SUBCOLLECTION = 'reservations';

/**
 * How long a reservation holds bytes before it is treated as abandoned. Long enough to
 * cover a cold start plus a large multipart save to Cloud Storage and the metadata write,
 * short enough that a crashed instance cannot keep a tenant at its ceiling for long.
 */
export const STORAGE_RESERVATION_TTL_MS = 300_000;

export type StorageReservationKind =
  | 'document_upload'
  | 'document_version'
  | 'managed_file_upload'
  | 'project_file_register'
  | 'client_file_register'
  | 'hr_document_register'
  | 'bulk_import_upload';

export interface TenantStorageReservation extends StorageLimitCheck {
  tenantId: string;
  /** null when nothing was reserved (zero bytes, or an unlimited plan). */
  reservationId: string | null;
  /**
   * This caller's own claim on the reservation above.
   *
   * Duplicate in-flight requests for one object SHARE a reservation — that is what makes
   * retries idempotent — but they are not interchangeable owners of it. Each holds its
   * own claim, and the reservation survives until every claim is gone. Releasing quotes
   * this id so one claimant can only ever drop its own hold.
   */
  claimId: string | null;
  /** Authoritative byte count this reservation is holding. */
  bytes: number;
}

/** Thrown by service-layer callers that cannot return an HTTP response themselves. */
export class StorageLimitExceededError extends Error {
  readonly check: StorageLimitCheck;

  constructor(check: StorageLimitCheck) {
    super(
      `This workspace has reached its plan storage limit (${check.used}/${check.limit} bytes on ${check.plan}).`,
    );
    this.name = 'StorageLimitExceededError';
    this.check = check;
  }
}

/** Reservation ids double as Firestore document ids, so they must be opaque tokens. */
const SAFE_RESERVATION_ID = /^[A-Za-z0-9_-]{8,128}$/;

function reservationDocRef(tenantId: string, reservationId: string) {
  return adminDb
    .collection('tenant_storage_ledgers')
    .doc(tenantId)
    .collection('reservations')
    .doc(reservationId);
}

/**
 * Derives a stable, filesystem- and Firestore-safe reservation id from a caller key.
 * Hashing keeps an arbitrary caller string from becoming a document path segment.
 */
function reservationIdFor(idempotencyKey: string | undefined): string {
  const key = String(idempotencyKey ?? '').trim();
  if (!key) return crypto.randomBytes(16).toString('hex');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/**
 * Reserves `bytes` of tenant storage, or reports that the plan has no room for them.
 * The returned reservation MUST be released by the caller — in a `finally` block — once
 * the metadata record has either landed or the upload has failed.
 *
 * Zero-byte uploads and unlimited plans reserve nothing and return `reservationId: null`;
 * releasing such a reservation is a no-op.
 */
export async function reserveTenantStorage(params: {
  tenantId: string;
  bytes: number;
  kind: StorageReservationKind;
  idempotencyKey?: string;
}): Promise<TenantStorageReservation> {
  const id = String(params.tenantId ?? '').trim();
  if (!id) {
    throw new Error('Tenant context is required to reserve storage.');
  }

  const incoming = normalizeBytes(params.bytes);
  const ledgerRef = adminDb.collection('tenant_storage_ledgers').doc(id);
  const reservationsRef = ledgerRef.collection('reservations');
  const { tenantRef, byteSources } = tenantStorageSources(id);
  const reservationId = reservationIdFor(params.idempotencyKey);

  if (!SAFE_RESERVATION_ID.test(reservationId)) {
    throw new Error('Invalid storage reservation id.');
  }

  return adminDb.runTransaction(async (tx) => {
    const now = Date.now();

    // Firestore requires every read before any write in a transaction.
    const tenantSnap = await tx.get(tenantRef);
    const plan = normalizePlan(tenantSnap.data()?.plan);
    const limit = storageLimitForPlan(plan);

    // Nothing to serialize: no bytes are being added, or the plan has no ceiling to
    // race against. No plan currently sells unlimited storage, but the branch keeps the
    // primitive honest if one ever does.
    if (incoming === 0 || limit < 0) {
      return {
        ok: true,
        limit,
        used: 0,
        incoming,
        plan,
        tenantId: id,
        reservationId: null,
        claimId: null,
        bytes: 0,
      };
    }

    const ledgerSnap = await tx.get(ledgerRef);
    const reservationsSnap = await tx.get(reservationsRef);
    const aggregateSnaps = await Promise.all(byteSources.map((query) => tx.get(query)));

    const committed = totalStorageBytes(aggregateSnaps);

    // The ledger document is the serialization anchor. It is read above and written on
    // every successful reservation — whether that creates one or joins an existing one —
    // so a concurrent transaction that read the same ledger state conflicts, retries,
    // and re-counts against what actually committed.
    const writeLedgerAnchor = () => {
      const ledgerData = (ledgerSnap.data() || {}) as Record<string, unknown>;
      const seq = Number(ledgerData.reservationSeq);
      tx.set(
        ledgerRef,
        {
          tenantId: id,
          reservationSeq: Number.isFinite(seq) ? seq + 1 : 1,
          lastReservedAt: now,
        },
        { merge: true },
      );
    };

    const expired: Array<FirebaseFirestore.QueryDocumentSnapshot> = [];
    let held = 0;
    let alreadyHeld: number | null = null;
    let alreadyHeldClaimants: string[] = [];

    for (const doc of reservationsSnap.docs) {
      const data = doc.data() || {};
      const expiresAt = Number(data.expiresAt);
      const live = Number.isFinite(expiresAt) && expiresAt > now;

      if (!live) {
        // Abandoned by a request that never completed. It stops holding bytes here,
        // which is what keeps a crashed instance from parking quota forever.
        expired.push(doc);
        continue;
      }

      if (doc.id === reservationId) {
        // A retry of this exact upload. Its bytes are already reserved; charging them
        // again would deny a request the tenant has in fact already been charged for.
        alreadyHeld = normalizeBytes(data.bytes);
        alreadyHeldClaimants = Array.isArray(data.claimants)
          ? (data.claimants as unknown[]).map((claim) => String(claim))
          : [];
        continue;
      }

      held += normalizeBytes(data.bytes);
    }

    // Idempotent retry: hand back the reservation this key already holds — but ONLY if
    // it is holding the same number of bytes.
    //
    // Reuse is safe exactly when the retry is for the same bytes. A key whose live
    // reservation holds a DIFFERENT byte count is not a retry of the same upload: it is
    // a second set of bytes wearing the first one's name, and honouring it would admit
    // the larger upload against the smaller reservation and overshoot the plan. Callers
    // key on path + Cloud Storage generation, so this should be unreachable; it is
    // enforced here anyway, because a key collision that silently under-charges is
    // precisely the failure the reservation exists to prevent.
    if (alreadyHeld !== null) {
      if (alreadyHeld !== incoming) {
        return {
          ok: false,
          limit,
          used: committed + held + alreadyHeld,
          incoming,
          plan,
          tenantId: id,
          reservationId: null,
          claimId: null,
          bytes: 0,
        };
      }

      // Join the existing reservation as an ADDITIONAL claimant rather than inheriting
      // it. Both callers now depend on the same held bytes, and neither can release them
      // out from under the other: the reservation survives until the last claim is gone.
      const claimId = crypto.randomBytes(16).toString('hex');
      tx.set(
        reservationsRef.doc(reservationId),
        { claimants: [...alreadyHeldClaimants, claimId] },
        { merge: true },
      );
      writeLedgerAnchor();

      return {
        ok: true,
        limit,
        used: committed + held + alreadyHeld,
        incoming,
        plan,
        tenantId: id,
        reservationId,
        claimId,
        bytes: alreadyHeld,
      };
    }

    const used = committed + held;
    if (used + incoming > limit) {
      // No write on the denial path: nothing to serialize, and a denial must never
      // contend with the reservation that legitimately won the space.
      return {
        ok: false,
        limit,
        used,
        incoming,
        plan,
        tenantId: id,
        reservationId: null,
        claimId: null,
        bytes: 0,
      };
    }

    for (const doc of expired) {
      tx.delete(doc.ref);
    }

    const claimId = crypto.randomBytes(16).toString('hex');
    tx.set(reservationsRef.doc(reservationId), {
      tenantId: id,
      bytes: incoming,
      kind: params.kind,
      claimants: [claimId],
      createdAt: now,
      expiresAt: now + STORAGE_RESERVATION_TTL_MS,
    });

    writeLedgerAnchor();

    return {
      ok: true,
      limit,
      used: used + incoming,
      incoming,
      plan,
      tenantId: id,
      reservationId,
      claimId,
      bytes: incoming,
    };
  });
}

/**
 * Drops THIS caller's claim on a reservation, and deletes the reservation only when no
 * claim is left.
 *
 * Release used to delete the document outright. Duplicate in-flight requests for one
 * object share a reservation, so whichever duplicate finished first — including by
 * FAILING before it committed anything — handed back capacity the other was still
 * relying on. A third request could take the freed space and commit, the surviving
 * duplicate could then commit too, and the tenant ended up over its plan ceiling with no
 * reservation left anywhere to explain it.
 *
 * The invariant this restores: capacity held for an object stays held until that
 * object's metadata is committed usage, or until EVERY in-flight claimant has abandoned
 * it. One request can never free capacity another live request still depends on.
 *
 * The whole thing runs in a transaction so two claimants releasing at once cannot both
 * read "one claim left" and both delete. Removing a claim id that is no longer there is
 * a no-op, so a double release is harmless.
 *
 * A reservation carrying no claimants at all is one written before this change; deleting
 * it outright preserves exactly the old behaviour for anything in flight across a deploy.
 *
 * Never throws. A release that cannot be written costs at most those bytes for the
 * remainder of the TTL, which is strictly better than failing an otherwise successful
 * upload.
 */
export async function releaseTenantStorage(
  reservation:
    { tenantId: string; reservationId: string | null; claimId?: string | null } | null | undefined,
): Promise<void> {
  if (!reservation?.reservationId || !reservation.tenantId) return;

  const ref = reservationDocRef(reservation.tenantId, reservation.reservationId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const data = snap.data() || {};
      const claimants = Array.isArray(data.claimants)
        ? (data.claimants as unknown[]).map((claim) => String(claim))
        : [];

      const remaining = reservation.claimId
        ? claimants.filter((claim) => claim !== reservation.claimId)
        : claimants;

      if (remaining.length === 0) {
        tx.delete(ref);
        return;
      }

      tx.set(ref, { claimants: remaining }, { merge: true });
    });
  } catch (error) {
    console.error('[STORAGE] Failed to release storage reservation', error);
  }
}

/**
 * Service-layer form of reserveTenantStorage: throws StorageLimitExceededError instead of
 * returning a denial, for callers that are not HTTP routes.
 */
export async function reserveTenantStorageOrThrow(params: {
  tenantId: string;
  bytes: number;
  kind: StorageReservationKind;
  idempotencyKey?: string;
}): Promise<TenantStorageReservation> {
  const reservation = await reserveTenantStorage(params);
  if (!reservation.ok) {
    throw new StorageLimitExceededError(reservation);
  }
  return reservation;
}
