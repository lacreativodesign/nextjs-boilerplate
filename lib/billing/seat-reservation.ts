import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  countBillableSeats,
  getSeatLimitForPlan,
  resolveSeatEnforcementPlan,
  staffSeatSources,
  type UserLimitCheck,
} from '@/lib/billing/user-limit';

/**
 * Atomic staff-seat reservation.
 *
 * checkUserLimit() answers "is there a free seat right now?". Every seat-consuming
 * path then went on to create a Firebase Auth user and a Firestore identity. Between
 * the read and the write there is a window in which a second request reads the same
 * free seat, and both pass. Two Vercel instances handling two concurrent invitations
 * against a Starter tenant at 9/10 both observed 9, both passed, and the tenant landed
 * on 11 billable seats. An in-memory mutex cannot fix this: serverless instances are
 * distributed and share no memory. Sleep/retry only narrows the window.
 *
 * The fix is a serialization point in Firestore itself. Every reservation runs in one
 * transaction that READS and WRITES a single per-tenant ledger document. Firestore
 * transactions are serializable over their read set, so two concurrent reservations
 * for the same tenant cannot both commit: the second one is retried against the state
 * the first committed, re-counts, and is denied. The ledger document is the only
 * contention point, so tenants never block each other.
 *
 * Counting rules are NOT duplicated here. The transaction reads the same tenant plan,
 * users and pending-invitation sources as lib/billing/user-limit.ts and applies
 * countBillableSeats() to them, then adds the reservations other requests are holding.
 *
 *   used = active staff users
 *        + pending (unexpired) staff invitations
 *        + live seat reservations held by in-flight requests
 *
 * A reservation is short-lived and self-healing. It is released as soon as the caller's
 * identity write lands (at which point the identity itself is counted) or the attempt
 * fails, and it expires on its own if the instance holding it dies mid-request, so an
 * abandoned provisioning attempt can never leak a seat permanently.
 *
 * Invitation ACCEPTANCE deliberately takes no reservation: the pending invitation is
 * already counted as a reserved seat, and acceptance converts it into an active user in
 * the same batch that marks the invitation accepted. Reserving there would double-count
 * the one seat the invitation already holds.
 */

/**
 * One ledger document per tenant; its reservations live in a subcollection.
 *
 * The call sites below spell both names as string literals rather than using these
 * constants, because the Firestore inventory generator (scripts/generate-firestore-schema.mjs)
 * only resolves statically-written collection ids. Routing them through a constant would
 * keep a real collection out of docs/database/collections.generated.md.
 */
export const SEAT_LEDGER_COLLECTION = 'tenant_seat_ledgers';
export const SEAT_RESERVATION_SUBCOLLECTION = 'reservations';

/**
 * How long a reservation holds a seat before it is treated as abandoned. Long enough
 * to cover a cold-start Auth create plus the Firestore identity write, short enough
 * that a crashed instance cannot keep a tenant at its ceiling for long.
 */
export const SEAT_RESERVATION_TTL_MS = 120_000;

export type SeatReservationKind =
  | 'admin_create'
  | 'legacy_create'
  | 'hr_create'
  | 'super_admin_create'
  | 'invitation'
  | 'sso_auto_provision'
  | 'reactivation'
  | 'role_conversion';

export interface StaffSeatReservation extends UserLimitCheck {
  tenantId: string;
  /** null when no seat was needed (client role, or an unlimited plan). */
  reservationId: string | null;
}

/** Thrown by service-layer callers that cannot return an HTTP response themselves. */
export class SeatLimitExceededError extends Error {
  readonly check: UserLimitCheck;

  constructor(check: UserLimitCheck) {
    super(
      `This workspace has reached its plan limit for team members (${check.used}/${check.limit} on ${check.plan}).`,
    );
    this.name = 'SeatLimitExceededError';
    this.check = check;
  }
}

function reservationDocRef(tenantId: string, reservationId: string) {
  return adminDb
    .collection('tenant_seat_ledgers')
    .doc(tenantId)
    .collection('reservations')
    .doc(reservationId);
}

/**
 * Reserves one billable staff seat for `targetRole`, or reports that the tenant has
 * none free. The returned reservation MUST be released by the caller — in a `finally`
 * block — once the identity write has either landed or failed.
 *
 * Client-portal identities and unlimited (Enterprise) plans consume no seat and return
 * `reservationId: null`; releasing such a reservation is a no-op.
 */
export async function reserveStaffSeat(
  tenantId: string,
  targetRole: string,
  kind: SeatReservationKind,
): Promise<StaffSeatReservation> {
  const id = String(tenantId || '').trim();
  const role = String(targetRole || '')
    .trim()
    .toLowerCase();

  if (!id) {
    throw new Error('Tenant context is required to reserve a staff seat.');
  }

  const ledgerRef = adminDb.collection('tenant_seat_ledgers').doc(id);
  const reservationsRef = ledgerRef.collection('reservations');
  const { tenantRef, usersQuery, invitationsQuery } = staffSeatSources(id);

  return adminDb.runTransaction(async (tx) => {
    const now = Date.now();

    // Firestore requires every read before any write in a transaction.
    const tenantSnap = await tx.get(tenantRef);
    const plan = resolveSeatEnforcementPlan((tenantSnap.data() || {}) as Record<string, unknown>);
    const limit = getSeatLimitForPlan(plan);

    // Client portal identities are not staff seats, and an unlimited plan has no
    // ceiling to race against. Neither needs a serialization point.
    if (role === 'client' || limit < 0) {
      return { ok: true, limit, used: 0, plan, tenantId: id, reservationId: null };
    }

    const ledgerSnap = await tx.get(ledgerRef);
    const usersSnap = await tx.get(usersQuery);
    const invitesSnap = await tx.get(invitationsQuery);
    const reservationsSnap = await tx.get(reservationsRef);

    const committed = countBillableSeats(usersSnap, invitesSnap, now);

    const expired: Array<{ ref: any }> = [];
    let held = 0;
    for (const doc of reservationsSnap.docs) {
      const data = doc.data() || {};
      const expiresAt = Number(data.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        // Abandoned by a request that never completed. It stops holding a seat here,
        // which is what keeps a crashed instance from parking capacity forever.
        expired.push(doc as unknown as { ref: any });
        continue;
      }
      held += 1;
    }

    const used = committed + held;
    if (used >= limit) {
      // No write on the denial path: nothing to serialize, and a denial must never
      // contend with the reservation that legitimately won the seat.
      return { ok: false, limit, used, plan, tenantId: id, reservationId: null };
    }

    const reservationId = crypto.randomBytes(16).toString('hex');

    for (const doc of expired) {
      tx.delete(doc.ref);
    }

    tx.set(reservationsRef.doc(reservationId), {
      tenantId: id,
      role,
      kind,
      createdAt: now,
      expiresAt: now + SEAT_RESERVATION_TTL_MS,
    });

    // The ledger document is the serialization anchor. It is read above and written
    // here on every successful reservation, so a concurrent transaction that read the
    // same ledger state conflicts, retries, and re-counts against the committed seat.
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

    return { ok: true, limit, used: used + 1, plan, tenantId: id, reservationId };
  });
}

/**
 * Releases a reservation. Call this in a `finally` block: on success the identity now
 * counts as a committed seat, and on failure the seat must go straight back.
 *
 * Never throws. A release that cannot be written costs at most one seat for the
 * remainder of the TTL, which is strictly better than failing an otherwise successful
 * provisioning request.
 */
export async function releaseStaffSeat(
  reservation: { tenantId: string; reservationId: string | null } | null | undefined,
): Promise<void> {
  if (!reservation?.reservationId || !reservation.tenantId) return;
  try {
    await reservationDocRef(reservation.tenantId, reservation.reservationId).delete();
  } catch (error) {
    console.error('[SEATS] Failed to release staff seat reservation', error);
  }
}

/**
 * Service-layer form of reserveStaffSeat: throws SeatLimitExceededError instead of
 * returning a denial, for callers that are not HTTP routes.
 */
export async function reserveStaffSeatOrThrow(
  tenantId: string,
  targetRole: string,
  kind: SeatReservationKind,
): Promise<StaffSeatReservation> {
  const reservation = await reserveStaffSeat(tenantId, targetRole, kind);
  if (!reservation.ok) {
    throw new SeatLimitExceededError(reservation);
  }
  return reservation;
}
