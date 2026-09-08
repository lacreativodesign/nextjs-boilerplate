/**
 * @jest-environment node
 */

// Runs against the real Firestore emulator through the Firebase Admin SDK. The
// project-wide `jest-fixed-jsdom` environment has no `setImmediate`, which the gRPC
// transport requires, so this suite pins the Node environment exactly like the payment
// engine invariants do.
//
// WHAT THIS PROVES
//
// checkUserLimit() is a read. Every seat-consuming path used to read it and then write
// a Firebase Auth user and a Firestore identity. Two requests landing on two Vercel
// instances could both read the same last free seat and both pass, so a Starter tenant
// at 9/10 could finish at 11 billable seats. No in-memory lock can fix that — the
// instances share no memory — and no sleep/retry closes the window, it only narrows it.
//
// reserveStaffSeat() moves the decision into a Firestore transaction that reads AND
// writes one per-tenant ledger document, which is a real serialization point. These
// tests run genuinely concurrent reservations against the real transaction machinery
// and assert that the tenant's ceiling holds exactly.

import { adminDb } from '@/lib/firebaseAdmin';
import {
  releaseStaffSeat,
  reserveStaffSeat,
  SEAT_RESERVATION_TTL_MS,
  type SeatReservationKind,
  type StaffSeatReservation,
} from '@/lib/billing/seat-reservation';
import { getBillableSeatUsage } from '@/lib/billing/user-limit';

const EMULATOR_TIMEOUT_MS = 60_000;
jest.setTimeout(EMULATOR_TIMEOUT_MS);

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const STARTER = 'seat-starter';
const PRO = 'seat-pro';
const ENTERPRISE = 'seat-enterprise';
const DOWNGRADING = 'seat-downgrading';

async function clearCollection(name: string) {
  for (;;) {
    const snap = await adminDb.collection(name).limit(400).get();
    if (snap.empty) return;
    const batch = adminDb.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function clearLedgers() {
  const ledgers = await adminDb.collection('tenant_seat_ledgers').get();
  for (const ledger of ledgers.docs) {
    const reservations = await ledger.ref.collection('reservations').get();
    const batch = adminDb.batch();
    reservations.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(ledger.ref);
    await batch.commit();
  }
}

async function resetDb() {
  await Promise.all([clearCollection('users'), clearCollection('user_invitations')]);
  await clearLedgers();

  await Promise.all([
    adminDb.collection('tenants').doc(STARTER).set({ name: 'Starter Co', plan: 'starter' }),
    adminDb.collection('tenants').doc(PRO).set({ name: 'Pro Co', plan: 'pro' }),
    adminDb.collection('tenants').doc(ENTERPRISE).set({ name: 'Ent Co', plan: 'enterprise' }),
    adminDb
      .collection('tenants')
      .doc(DOWNGRADING)
      // Pro today, Starter at period end. New reservations must already respect Starter.
      .set({ name: 'Downgrading Co', plan: 'pro', pendingDowngradePlan: 'starter' }),
  ]);
}

async function seedStaff(tenantId: string, count: number, overrides: Record<string, unknown> = {}) {
  const batch = adminDb.batch();
  for (let i = 0; i < count; i += 1) {
    const id = `${tenantId}_seed_${String(overrides.role || 'sales')}_${String(
      overrides.status || 'active',
    )}_${i}`;
    batch.set(adminDb.collection('users').doc(id), {
      uid: id,
      tenantId,
      role: 'sales',
      status: 'active',
      isActive: true,
      ...overrides,
    });
  }
  await batch.commit();
}

/**
 * The emulator has two vocabularies for one condition, and the SDK only retries one.
 *
 * A read-write transaction that loses a contention race is closed by the Firestore
 * emulator while the loser is still reading. reserveStaffSeat() issues five sequential
 * reads before it writes, so that window is wide, and depending on where the close
 * lands the emulator answers the next read either
 *
 *   10 ABORTED: Transaction lock timeout.
 *   3 INVALID_ARGUMENT: Transaction is invalid or closed.
 *
 * Both mean "you lost the race, read again". The SDK retries the first. It accepts
 * INVALID_ARGUMENT only when the message matches /transaction has expired/ — the
 * wording the production Firestore backend uses for the same condition — so the
 * emulator's wording falls through to `break` and runTransaction() rejects instead of
 * re-reading and re-deciding (@google-cloud/firestore 7.11.6,
 * build/src/transaction.js, isRetryableTransactionError).
 *
 * That is the emulator's wording, not a hole in the reservation. No seat is granted on
 * this path, so the ceiling still holds fail-closed; what is lost is the retry, and
 * with it the suite's ability to observe the decision the tenant would really get.
 *
 * This restores that retry and nothing else. There is no sleep, no serialization and no
 * relaxed assertion: every attempt is a full reserveStaffSeat() call, still racing
 * whatever else is in flight, that re-reads committed state and grants or denies on its
 * own. Any other failure — and this one after five attempts — still fails the suite.
 */
const EMULATOR_CLOSED_TRANSACTION = /Transaction is invalid or closed/;

function isEmulatorClosedTransaction(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  return (
    candidate?.code === 3 && EMULATOR_CLOSED_TRANSACTION.test(String(candidate?.message ?? ''))
  );
}

/** reserveStaffSeat() with the retry the production backend performs for us. */
async function reserveSeat(
  tenantId: string,
  role: string,
  kind: SeatReservationKind,
): Promise<StaffSeatReservation> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await reserveStaffSeat(tenantId, role, kind);
    } catch (error) {
      if (!isEmulatorClosedTransaction(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/** Counts how many of a set of concurrent reservation attempts were granted. */
function granted(results: StaffSeatReservation[]) {
  return results.filter((r) => r.ok).length;
}

describeWithEmulator('PR4 — staff seats are atomic under concurrency', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
  });

  it('grants exactly one of two concurrent requests for a Starter tenant last seat', async () => {
    await seedStaff(STARTER, 9);

    const results = await Promise.all([
      reserveSeat(STARTER, 'sales', 'admin_create'),
      reserveSeat(STARTER, 'finance', 'hr_create'),
    ]);

    expect(granted(results)).toBe(1);
    const denied = results.find((r) => !r.ok)!;
    expect(denied.limit).toBe(10);
    expect(denied.used).toBe(10);
    expect(denied.plan).toBe('starter');
    expect(denied.reservationId).toBeNull();
  });

  it('grants exactly one of two concurrent requests for a Pro tenant last seat', async () => {
    await seedStaff(PRO, 19);

    const results = await Promise.all([
      reserveSeat(PRO, 'sales', 'invitation'),
      reserveSeat(PRO, 'production', 'sso_auto_provision'),
    ]);

    expect(granted(results)).toBe(1);
    expect(results.find((r) => !r.ok)!.limit).toBe(20);
  });

  it('grants exactly the remaining capacity when many requests arrive at once', async () => {
    // Six concurrent requests against three free Starter seats. A check-then-act gate
    // fails this outright: every request reads 7 and every request passes.
    await seedStaff(STARTER, 7);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => reserveSeat(STARTER, 'sales', 'admin_create')),
    );

    expect(granted(results)).toBe(3);
  });

  it('never limits an Enterprise tenant, so concurrent requests all succeed', async () => {
    await seedStaff(ENTERPRISE, 500);

    const results = await Promise.all([
      reserveSeat(ENTERPRISE, 'sales', 'admin_create'),
      reserveSeat(ENTERPRISE, 'sales', 'admin_create'),
      reserveSeat(ENTERPRISE, 'sales', 'admin_create'),
    ]);

    expect(granted(results)).toBe(3);
    // Unlimited plans need no serialization point and so hold no reservation.
    expect(results.every((r) => r.reservationId === null)).toBe(true);
  });

  it('does not consume staff capacity for client portal identities', async () => {
    await seedStaff(STARTER, 10);

    const clientSeat = await reserveSeat(STARTER, 'client', 'admin_create');
    expect(clientSeat.ok).toBe(true);
    expect(clientSeat.reservationId).toBeNull();

    // Existing client users do not count either.
    await seedStaff(STARTER, 25, { role: 'client' });
    expect(await getBillableSeatUsage(STARTER)).toBe(10);
  });

  it('counts a pending staff invitation as exactly one reserved seat', async () => {
    await seedStaff(STARTER, 8);
    await adminDb
      .collection('user_invitations')
      .doc('inv_pending')
      .set({
        tenantId: STARTER,
        email: 'invitee@example.com',
        role: 'finance',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86_400_000),
      });

    expect(await getBillableSeatUsage(STARTER)).toBe(9);

    const seat = await reserveSeat(STARTER, 'sales', 'admin_create');
    expect(seat.ok).toBe(true);
    expect(seat.used).toBe(10);

    // The invitation holds its seat and the reservation holds the last one, so the
    // tenant is now full.
    const overflow = await reserveSeat(STARTER, 'sales', 'admin_create');
    expect(overflow.ok).toBe(false);
    await releaseStaffSeat(seat);
  });

  it('does not double-count an invitation when it is accepted', async () => {
    await seedStaff(STARTER, 9);
    const inviteRef = adminDb.collection('user_invitations').doc('inv_accepting');
    await inviteRef.set({
      tenantId: STARTER,
      email: 'accepting@example.com',
      role: 'finance',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    expect(await getBillableSeatUsage(STARTER)).toBe(10);

    // Acceptance is the one seat-consuming-looking path that takes NO reservation: the
    // invitation already holds the seat, and this batch converts it in place.
    const batch = adminDb.batch();
    batch.set(adminDb.collection('users').doc('accepted_uid'), {
      uid: 'accepted_uid',
      tenantId: STARTER,
      role: 'finance',
      status: 'active',
      isActive: true,
    });
    batch.update(inviteRef, { status: 'accepted' });
    await batch.commit();

    // Still ten: one person, one seat, before and after.
    expect(await getBillableSeatUsage(STARTER)).toBe(10);
    const seat = await reserveSeat(STARTER, 'sales', 'admin_create');
    expect(seat.ok).toBe(false);
    expect(seat.used).toBe(10);
  });

  it('returns the seat when provisioning fails, rather than leaking it', async () => {
    await seedStaff(STARTER, 9);

    const seat = await reserveSeat(STARTER, 'sales', 'admin_create');
    expect(seat.ok).toBe(true);
    expect((await reserveSeat(STARTER, 'sales', 'admin_create')).ok).toBe(false);

    // Simulates the `finally` block every seat-consuming route runs after a failed
    // Firebase Auth or Firestore write.
    await releaseStaffSeat(seat);

    const retry = await reserveSeat(STARTER, 'sales', 'admin_create');
    expect(retry.ok).toBe(true);
    await releaseStaffSeat(retry);
  });

  it('expires an abandoned reservation instead of parking the seat forever', async () => {
    await seedStaff(STARTER, 9);

    // An instance that died mid-request: the reservation exists and was never released.
    await adminDb
      .collection('tenant_seat_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .doc('abandoned')
      .set({
        tenantId: STARTER,
        role: 'sales',
        kind: 'admin_create',
        createdAt: Date.now() - SEAT_RESERVATION_TTL_MS * 2,
        expiresAt: Date.now() - SEAT_RESERVATION_TTL_MS,
      });

    const seat = await reserveSeat(STARTER, 'sales', 'admin_create');
    expect(seat.ok).toBe(true);

    // The expired entry is pruned by the same transaction, so it cannot come back.
    const remaining = await adminDb
      .collection('tenant_seat_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .doc('abandoned')
      .get();
    expect(remaining.exists).toBe(false);
    await releaseStaffSeat(seat);
  });

  it('applies the stricter future ceiling once a downgrade is scheduled', async () => {
    // Pro today (20), Starter scheduled (10). Eleven staff would fit Pro and must not
    // be reachable while a Starter downgrade is pending.
    await seedStaff(DOWNGRADING, 10);

    const seat = await reserveSeat(DOWNGRADING, 'sales', 'admin_create');
    expect(seat.ok).toBe(false);
    expect(seat.limit).toBe(10);
    expect(seat.plan).toBe('starter');
  });

  it('consumes capacity when a disabled identity is reactivated', async () => {
    await seedStaff(STARTER, 9);
    await seedStaff(STARTER, 1, { status: 'inactive', isActive: false });

    // The inactive identity holds no seat, so nine are used and one is free.
    expect(await getBillableSeatUsage(STARTER)).toBe(9);

    const results = await Promise.all([
      reserveSeat(STARTER, 'sales', 'reactivation'),
      reserveSeat(STARTER, 'sales', 'reactivation'),
    ]);
    expect(granted(results)).toBe(1);
  });

  it('consumes capacity atomically when a client is converted to staff', async () => {
    await seedStaff(STARTER, 9);
    await seedStaff(STARTER, 2, { role: 'client' });

    // Two client identities being promoted at the same moment, one free seat.
    const results = await Promise.all([
      reserveSeat(STARTER, 'sales', 'role_conversion'),
      reserveSeat(STARTER, 'am', 'role_conversion'),
    ]);

    expect(granted(results)).toBe(1);
  });

  it('keeps one tenant reservation from blocking another tenant', async () => {
    await seedStaff(STARTER, 9);
    await seedStaff(PRO, 9);

    const [starterSeat, proSeat] = await Promise.all([
      reserveSeat(STARTER, 'sales', 'admin_create'),
      reserveSeat(PRO, 'sales', 'admin_create'),
    ]);

    expect(starterSeat.ok).toBe(true);
    expect(proSeat.ok).toBe(true);
    await Promise.all([releaseStaffSeat(starterSeat), releaseStaffSeat(proSeat)]);
  });
});
