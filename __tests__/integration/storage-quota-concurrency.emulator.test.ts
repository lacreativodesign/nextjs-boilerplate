/**
 * @jest-environment node
 */

// Runs against the real Firestore emulator through the Firebase Admin SDK. The
// project-wide `jest-fixed-jsdom` environment has no `setImmediate`, which the gRPC
// transport requires, so this suite pins the Node environment exactly like the payment
// engine and staff-seat invariants do.
//
// WHAT THIS PROVES
//
// checkStorageLimit() is a read. Every upload path used to read it and then write bytes
// to Cloud Storage and a metadata record to Firestore. Two requests landing on two
// Vercel instances could both read the same remaining space and both pass, so a Starter
// tenant at 19.9GB of 20GB could accept two 500MB uploads and finish at 20.9GB. No
// in-memory lock can fix that — the instances share no memory — and no sleep/retry
// closes the window, it only narrows it.
//
// reserveTenantStorage() moves the decision into a Firestore transaction that reads AND
// writes one per-tenant ledger document, which is a real serialization point. These
// tests run genuinely concurrent reservations against the real transaction machinery and
// assert that the tenant's ceiling holds exactly.
//
// They also prove the accounting PR4 completed: bytes stored through the `documents`
// library and through every `erp_file_versions` row count against the plan, and one
// tenant's usage is invisible to another's.

import { adminDb } from '@/lib/firebaseAdmin';
import { getTenantStorageUsage } from '@/lib/billing/storage-limit';
import {
  releaseTenantStorage,
  reserveTenantStorage,
  STORAGE_RESERVATION_TTL_MS,
  type TenantStorageReservation,
} from '@/lib/billing/storage-reservation';

const EMULATOR_TIMEOUT_MS = 60_000;
jest.setTimeout(EMULATOR_TIMEOUT_MS);

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const GB = 1024 ** 3;
const STARTER_LIMIT = 20 * GB;
const PRO_LIMIT = 75 * GB;
const ENTERPRISE_LIMIT = 250 * GB;

const STARTER = 'storage-starter';
const PRO = 'storage-pro';
const ENTERPRISE = 'storage-enterprise';
const DOWNGRADED = 'storage-downgraded';
const OTHER = 'storage-other-tenant';

const BYTE_COLLECTIONS = ['files', 'employeeDocuments', 'erp_file_versions', 'documents'];

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
  const ledgers = await adminDb.collection('tenant_storage_ledgers').get();
  for (const ledger of ledgers.docs) {
    const reservations = await ledger.ref.collection('reservations').get();
    const batch = adminDb.batch();
    reservations.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(ledger.ref);
    await batch.commit();
  }
}

async function resetDb() {
  await Promise.all(BYTE_COLLECTIONS.map((name) => clearCollection(name)));
  await clearLedgers();

  await Promise.all([
    adminDb.collection('tenants').doc(STARTER).set({ name: 'Starter Co', plan: 'starter' }),
    adminDb.collection('tenants').doc(PRO).set({ name: 'Pro Co', plan: 'pro' }),
    adminDb.collection('tenants').doc(ENTERPRISE).set({ name: 'Ent Co', plan: 'enterprise' }),
    // Was on Pro and stored 30GB; now on Starter, which entitles 20GB. The data stays,
    // but the tenant may not add to it until it is back under the new allowance.
    adminDb.collection('tenants').doc(DOWNGRADED).set({ name: 'Downgraded Co', plan: 'starter' }),
    adminDb.collection('tenants').doc(OTHER).set({ name: 'Other Co', plan: 'starter' }),
  ]);
}

/** Seeds a live `files` record of `bytes` for a tenant. */
async function seedFileBytes(tenantId: string, bytes: number, tag = 'f') {
  await adminDb.collection('files').add({
    tenantId,
    fileName: `${tag}.pdf`,
    size: bytes,
    isDeleted: false,
    isLatest: true,
  });
}

/** Seeds a live `documents` record — the surface PR4 found unmetered. */
async function seedDocumentBytes(tenantId: string, bytes: number, tag = 'd') {
  await adminDb.collection('documents').add({
    tenantId,
    fileName: `${tag}.pdf`,
    fileSize: bytes,
    deletedAt: null,
    isLatestVersion: true,
  });
}

/** Seeds one managed-file version row — one physical object in the bucket. */
async function seedVersionBytes(tenantId: string, bytes: number, fileId = 'file-1', version = 1) {
  await adminDb.collection('erp_file_versions').add({
    tenantId,
    fileId,
    versionNumber: version,
    size: bytes,
    isCurrent: version === 1,
  });
}

/**
 * The emulator has two vocabularies for one condition, and the SDK only retries one.
 *
 * A read-write transaction that loses a contention race is closed by the Firestore
 * emulator while the loser is still reading. reserveTenantStorage() issues several
 * sequential reads before it writes, so that window is wide, and depending on where the
 * close lands the emulator answers the next read either
 *
 *   10 ABORTED: Transaction lock timeout.
 *   3 INVALID_ARGUMENT: Transaction is invalid or closed.
 *
 * Both mean "you lost the race, read again". The SDK retries the first and accepts
 * INVALID_ARGUMENT only when the message matches /transaction has expired/ — the wording
 * the production backend uses — so the emulator's wording falls through and
 * runTransaction() rejects instead of re-reading and re-deciding.
 *
 * That is the emulator's wording, not a hole in the reservation: no bytes are granted on
 * this path, so the ceiling still holds fail-closed. What is lost is the retry, and with
 * it the suite's ability to observe the decision the tenant would really get.
 *
 * This restores that retry and nothing else. There is no sleep, no serialization and no
 * relaxed assertion: every attempt is a full reserveTenantStorage() call, still racing
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

/** reserveTenantStorage() with the retry the production backend performs for us. */
async function reserve(
  tenantId: string,
  bytes: number,
  idempotencyKey?: string,
): Promise<TenantStorageReservation> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await reserveTenantStorage({
        tenantId,
        bytes,
        kind: 'document_upload',
        idempotencyKey,
      });
    } catch (error) {
      if (!isEmulatorClosedTransaction(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function granted(results: TenantStorageReservation[]) {
  return results.filter((r) => r.ok).length;
}

describeWithEmulator('PR4 — tenant storage is metered and atomic under concurrency', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
  });

  // ---- accounting: the two surfaces PR4 found unmetered ----

  it('counts bytes stored through the documents library', async () => {
    await seedDocumentBytes(STARTER, 3 * GB);
    expect(await getTenantStorageUsage(STARTER)).toBe(3 * GB);
  });

  it('counts every managed-file version, not just the current one', async () => {
    // storeVersion() writes a NEW object per version and keeps the old ones, so three
    // versions of a 2GB file is 6GB in the bucket.
    await seedVersionBytes(STARTER, 2 * GB, 'file-1', 1);
    await seedVersionBytes(STARTER, 2 * GB, 'file-1', 2);
    await seedVersionBytes(STARTER, 2 * GB, 'file-1', 3);
    expect(await getTenantStorageUsage(STARTER)).toBe(6 * GB);
  });

  it('sums every byte-bearing surface into one figure', async () => {
    await seedFileBytes(STARTER, 1 * GB);
    await seedDocumentBytes(STARTER, 2 * GB);
    await seedVersionBytes(STARTER, 3 * GB);
    await adminDb
      .collection('employeeDocuments')
      .add({ tenantId: STARTER, size: 4 * GB, isDeleted: false });

    expect(await getTenantStorageUsage(STARTER)).toBe(10 * GB);
  });

  it('excludes soft-deleted records, whichever convention the collection uses', async () => {
    await seedFileBytes(STARTER, 5 * GB);
    await adminDb.collection('files').add({ tenantId: STARTER, size: 9 * GB, isDeleted: true });
    await adminDb
      .collection('documents')
      .add({ tenantId: STARTER, fileSize: 7 * GB, deletedAt: new Date() });

    expect(await getTenantStorageUsage(STARTER)).toBe(5 * GB);
  });

  // ---- tenant isolation ----

  it('never counts another tenant’s bytes', async () => {
    await seedFileBytes(OTHER, 18 * GB);
    await seedDocumentBytes(OTHER, 1 * GB);

    expect(await getTenantStorageUsage(STARTER)).toBe(0);

    // A full-size upload for STARTER is unaffected by OTHER sitting near its own ceiling.
    const reservation = await reserve(STARTER, 19 * GB);
    expect(reservation.ok).toBe(true);
    expect(reservation.used).toBe(19 * GB);
  });

  it('a reservation held by one tenant never blocks another', async () => {
    const held = await reserve(STARTER, 19 * GB);
    expect(held.ok).toBe(true);

    const other = await reserve(OTHER, 19 * GB);
    expect(other.ok).toBe(true);
    expect(other.used).toBe(19 * GB);

    await releaseTenantStorage(held);
    await releaseTenantStorage(other);
  });

  // ---- plan ceilings and boundaries ----

  it('an upload landing exactly on the Starter ceiling succeeds', async () => {
    await seedDocumentBytes(STARTER, STARTER_LIMIT - 1024);

    const reservation = await reserve(STARTER, 1024);
    expect(reservation.ok).toBe(true);
    expect(reservation.limit).toBe(STARTER_LIMIT);
    expect(reservation.used).toBe(STARTER_LIMIT);
  });

  it('one byte over the Starter ceiling fails', async () => {
    await seedDocumentBytes(STARTER, STARTER_LIMIT - 1024);

    const reservation = await reserve(STARTER, 1025);
    expect(reservation.ok).toBe(false);
    expect(reservation.limit).toBe(STARTER_LIMIT);
    expect(reservation.plan).toBe('starter');
    expect(reservation.reservationId).toBeNull();
  });

  it('enforces the Pro ceiling at 75GB', async () => {
    await seedDocumentBytes(PRO, PRO_LIMIT - 1024);

    expect((await reserve(PRO, 1024)).ok).toBe(true);
    await clearCollection('tenant_storage_ledgers');
    expect((await reserve(PRO, 2048)).ok).toBe(false);
    expect((await reserve(PRO, 2048)).limit).toBe(PRO_LIMIT);
  });

  it('enforces the Enterprise ceiling at 250GB — it is not unlimited', async () => {
    await seedDocumentBytes(ENTERPRISE, ENTERPRISE_LIMIT - 1024);

    const overshoot = await reserve(ENTERPRISE, 4096);
    expect(overshoot.ok).toBe(false);
    expect(overshoot.limit).toBe(ENTERPRISE_LIMIT);
    expect(overshoot.plan).toBe('enterprise');
  });

  // ---- concurrency ----

  it('grants exactly one of two concurrent uploads for the last of the quota', async () => {
    // 19.5GB used on Starter; two concurrent 400MB uploads fit individually, not together.
    await seedDocumentBytes(STARTER, STARTER_LIMIT - 512 * 1024 * 1024);
    const upload = 400 * 1024 * 1024;

    const results = await Promise.all([reserve(STARTER, upload), reserve(STARTER, upload)]);

    expect(granted(results)).toBe(1);
    const denied = results.find((r) => !r.ok)!;
    expect(denied.limit).toBe(STARTER_LIMIT);
    expect(denied.reservationId).toBeNull();
  });

  it('admits only what fits when many uploads arrive at once', async () => {
    // 16GB free, six concurrent 1GB uploads: a check-then-act gate admits all six,
    // because every one of them reads the same 4GB used.
    await seedDocumentBytes(STARTER, STARTER_LIMIT - 4 * GB);

    const results = await Promise.all(Array.from({ length: 6 }, () => reserve(STARTER, 1 * GB)));

    expect(granted(results)).toBe(4);
    expect(results.filter((r) => !r.ok)).toHaveLength(2);

    // Held reservations are real: the ledger accounts for every granted byte.
    const ledger = await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .get();
    const heldBytes = ledger.docs.reduce((sum, doc) => sum + Number(doc.data().bytes || 0), 0);
    expect(heldBytes).toBe(4 * GB);
  });

  it('concurrent uploads can never collectively exceed the plan limit', async () => {
    await seedDocumentBytes(STARTER, STARTER_LIMIT - 3 * GB);

    const results = await Promise.all(Array.from({ length: 8 }, () => reserve(STARTER, 1 * GB)));

    const committed = await getTenantStorageUsage(STARTER);
    const heldSnap = await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .get();
    const held = heldSnap.docs.reduce((sum, doc) => sum + Number(doc.data().bytes || 0), 0);

    expect(granted(results)).toBe(3);
    expect(committed + held).toBeLessThanOrEqual(STARTER_LIMIT);
  });

  // ---- reservation lifecycle ----

  it('a released reservation hands the space straight back', async () => {
    await seedDocumentBytes(STARTER, STARTER_LIMIT - 1 * GB);

    const first = await reserve(STARTER, 1 * GB);
    expect(first.ok).toBe(true);

    // While it is held, nothing more fits.
    expect((await reserve(STARTER, 1 * GB)).ok).toBe(false);

    // A failed upload releases it, and the next request fits again.
    await releaseTenantStorage(first);
    expect((await reserve(STARTER, 1 * GB)).ok).toBe(true);
  });

  it('an abandoned reservation expires instead of parking quota forever', async () => {
    await seedDocumentBytes(STARTER, STARTER_LIMIT - 1 * GB);

    // An instance that died mid-upload: the reservation exists but its TTL has passed.
    const stale = Date.now() - STORAGE_RESERVATION_TTL_MS - 1000;
    await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .doc('abandoned-by-a-dead-instance')
      .set({
        tenantId: STARTER,
        bytes: 1 * GB,
        kind: 'document_upload',
        createdAt: stale,
        expiresAt: stale,
      });

    const reservation = await reserve(STARTER, 1 * GB);
    expect(reservation.ok).toBe(true);

    // The expired row is swept, not merely ignored.
    const remaining = await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .doc('abandoned-by-a-dead-instance')
      .get();
    expect(remaining.exists).toBe(false);
  });

  it('a retried upload reuses its reservation instead of being charged twice', async () => {
    await seedDocumentBytes(STARTER, STARTER_LIMIT - 2 * GB);
    const key = 'upload-session:storage-starter:retry-me';

    const first = await reserve(STARTER, 2 * GB, key);
    expect(first.ok).toBe(true);

    // The same upload retried: without idempotency this would ask for another 2GB and
    // be denied, failing an upload the tenant has already been charged for.
    const retry = await reserve(STARTER, 2 * GB, key);
    expect(retry.ok).toBe(true);
    expect(retry.reservationId).toBe(first.reservationId);

    const heldSnap = await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .get();
    expect(heldSnap.size).toBe(1);
    expect(Number(heldSnap.docs[0].data().bytes)).toBe(2 * GB);
  });

  it('concurrent retries of the same upload reserve the bytes only once', async () => {
    await seedDocumentBytes(STARTER, STARTER_LIMIT - 2 * GB);
    const key = 'upload-session:storage-starter:double-submit';

    const results = await Promise.all([
      reserve(STARTER, 2 * GB, key),
      reserve(STARTER, 2 * GB, key),
    ]);

    expect(granted(results)).toBe(2);
    const heldSnap = await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .get();
    expect(heldSnap.size).toBe(1);
  });

  // ---- downgrade ----

  it('a tenant over its new allowance keeps its data but cannot add more', async () => {
    // 30GB stored while on Pro; the plan is now Starter (20GB).
    await seedDocumentBytes(DOWNGRADED, 20 * GB, 'was-pro-a');
    await seedFileBytes(DOWNGRADED, 10 * GB, 'was-pro-b');

    const usage = await getTenantStorageUsage(DOWNGRADED);
    expect(usage).toBe(30 * GB);

    const reservation = await reserve(DOWNGRADED, 1);
    expect(reservation.ok).toBe(false);
    expect(reservation.limit).toBe(STARTER_LIMIT);
    expect(reservation.used).toBe(30 * GB);

    // Nothing was destroyed to make room.
    expect(await getTenantStorageUsage(DOWNGRADED)).toBe(30 * GB);
  });

  it('an over-limit tenant can upload again once it is back under the allowance', async () => {
    await seedDocumentBytes(DOWNGRADED, 25 * GB, 'bulky');
    expect((await reserve(DOWNGRADED, 1)).ok).toBe(false);

    // Deleting the oversized document brings the tenant back under 20GB.
    const snap = await adminDb.collection('documents').where('tenantId', '==', DOWNGRADED).get();
    await Promise.all(snap.docs.map((doc) => doc.ref.update({ deletedAt: new Date() })));

    expect(await getTenantStorageUsage(DOWNGRADED)).toBe(0);
    expect((await reserve(DOWNGRADED, 1 * GB)).ok).toBe(true);
  });

  // ---- input hygiene ----

  it('reserves nothing for a zero-byte upload and refuses a tenantless caller', async () => {
    const zero = await reserve(STARTER, 0);
    expect(zero.ok).toBe(true);
    expect(zero.reservationId).toBeNull();

    await expect(
      reserveTenantStorage({ tenantId: '', bytes: 1, kind: 'document_upload' }),
    ).rejects.toThrow(/Tenant context is required/);
  });
});

/**
 * PR4 remediation — a reservation must outlive any one of its claimants.
 *
 * Two simultaneous duplicate requests for the SAME object share one reservation: that is
 * what makes retries idempotent. But release deleted that reservation document outright,
 * so whichever duplicate finished first — including by FAILING — handed back capacity
 * the other one was still relying on. A third request could then take the freed space
 * and commit, and when the surviving duplicate committed too, the tenant was over its
 * plan ceiling with no reservation anywhere to blame.
 *
 * This is distinct from every retry case already covered. Those are sequential: the
 * first claimant has finished before the second begins. This is two claimants ALIVE AT
 * ONCE, one of them failing BEFORE its metadata commit.
 *
 * The invariant: capacity held for an object stays held until that object's metadata is
 * committed usage, or until every in-flight claimant has abandoned it.
 */
describeWithEmulator('PR4 — a reservation outlives any single claimant', () => {
  const KEY = 'tenants/storage-starter/client-files/p/f.pdf#1700000000000001';
  const OTHER_KEY = 'tenants/storage-starter/client-files/p/other.pdf#1700000000000002';

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
  });

  /** Leaves exactly `free` bytes of headroom on the Starter tenant. */
  async function headroom(free: number) {
    await seedDocumentBytes(STARTER, STARTER_LIMIT - free);
  }

  /** Commits metadata for an object, turning held capacity into committed usage. */
  async function commitObject(tenantId: string, bytes: number, id: string) {
    await adminDb
      .collection('documents')
      .doc(id)
      .set({ tenantId, fileSize: bytes, deletedAt: null });
  }

  it('a failed duplicate cannot free capacity the surviving duplicate still needs', async () => {
    const X = 2 * GB;
    await headroom(X);

    // A and B are duplicates of the same upload, both in flight, neither committed.
    const a = await reserve(STARTER, X, KEY);
    const b = await reserve(STARTER, X, KEY);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    // A fails BEFORE committing its metadata and runs its release.
    await releaseTenantStorage(a);

    // C is a different object asking for the same headroom. B is still alive and still
    // depends on that capacity, so C must be refused.
    const c = await reserve(STARTER, X, OTHER_KEY);
    expect(c.ok).toBe(false);

    // B now finishes and its bytes become committed usage.
    await commitObject(STARTER, X, 'object-b');
    await releaseTenantStorage(b);

    // The ceiling held.
    expect(await getTenantStorageUsage(STARTER)).toBeLessThanOrEqual(STARTER_LIMIT);
    expect(await getTenantStorageUsage(STARTER)).toBe(STARTER_LIMIT);
  });

  it('committed plus still-held bytes never exceed the plan through the whole interleaving', async () => {
    const X = 2 * GB;
    await headroom(X);

    const a = await reserve(STARTER, X, KEY);
    const b = await reserve(STARTER, X, KEY);
    await releaseTenantStorage(a);

    const c = await reserve(STARTER, X, OTHER_KEY);
    if (c.ok) await commitObject(STARTER, X, 'object-c');
    await commitObject(STARTER, X, 'object-b');
    await releaseTenantStorage(b);
    await releaseTenantStorage(c);

    const committed = await getTenantStorageUsage(STARTER);
    const heldSnap = await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .get();
    const held = heldSnap.docs.reduce((sum, doc) => sum + Number(doc.data().bytes || 0), 0);

    expect(committed + held).toBeLessThanOrEqual(STARTER_LIMIT);
  });

  it('both duplicates succeeding leaves exactly one charge', async () => {
    await headroom(4 * GB);

    const a = await reserve(STARTER, 2 * GB, KEY);
    const b = await reserve(STARTER, 2 * GB, KEY);
    expect(a.ok && b.ok).toBe(true);
    expect(a.reservationId).toBe(b.reservationId);

    const heldSnap = await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .get();
    expect(heldSnap.size).toBe(1);
    expect(Number(heldSnap.docs[0].data().bytes)).toBe(2 * GB);
  });

  it('the first duplicate failing leaves the second able to finish', async () => {
    const X = 2 * GB;
    await headroom(X);

    const a = await reserve(STARTER, X, KEY);
    const b = await reserve(STARTER, X, KEY);
    await releaseTenantStorage(a);

    await commitObject(STARTER, X, 'object-b');
    await releaseTenantStorage(b);
    expect(await getTenantStorageUsage(STARTER)).toBe(STARTER_LIMIT);
  });

  it('the second duplicate failing leaves the first able to finish', async () => {
    const X = 2 * GB;
    await headroom(X);

    const a = await reserve(STARTER, X, KEY);
    const b = await reserve(STARTER, X, KEY);
    await releaseTenantStorage(b);

    await commitObject(STARTER, X, 'object-a');
    await releaseTenantStorage(a);
    expect(await getTenantStorageUsage(STARTER)).toBe(STARTER_LIMIT);
  });

  it('both duplicates failing returns the capacity in full', async () => {
    const X = 2 * GB;
    await headroom(X);

    const a = await reserve(STARTER, X, KEY);
    const b = await reserve(STARTER, X, KEY);
    await releaseTenantStorage(a);
    await releaseTenantStorage(b);

    // Nothing committed, nothing held: the space is genuinely back.
    const heldSnap = await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .get();
    expect(heldSnap.size).toBe(0);
    expect((await reserve(STARTER, X, OTHER_KEY)).ok).toBe(true);
  });

  it('a duplicate arriving after the metadata commit reserves nothing new', async () => {
    const X = 2 * GB;
    await headroom(X);

    const a = await reserve(STARTER, X, KEY);
    await commitObject(STARTER, X, 'object-a');
    await releaseTenantStorage(a);

    // The bytes are committed usage now, so there is no headroom left at all.
    expect(await getTenantStorageUsage(STARTER)).toBe(STARTER_LIMIT);
    expect((await reserve(STARTER, X, OTHER_KEY)).ok).toBe(false);
  });

  it('one tenant’s claims never reach another', async () => {
    const X = 2 * GB;
    await headroom(X);

    const a = await reserve(STARTER, X, KEY);
    await reserve(STARTER, X, KEY);
    await releaseTenantStorage(a);

    // OTHER is a different tenant entirely; STARTER's held capacity is invisible to it.
    expect((await reserve(OTHER, X, KEY)).ok).toBe(true);
  });

  it('an abandoned claim still expires, so quota is never stranded', async () => {
    const X = 2 * GB;
    await headroom(X);

    await reserve(STARTER, X, KEY);
    await reserve(STARTER, X, KEY);

    // Both claimants die without releasing. The lease is what returns the capacity.
    const stale = Date.now() - STORAGE_RESERVATION_TTL_MS - 1000;
    const snap = await adminDb
      .collection('tenant_storage_ledgers')
      .doc(STARTER)
      .collection('reservations')
      .get();
    await Promise.all(snap.docs.map((doc) => doc.ref.update({ expiresAt: stale })));

    expect((await reserve(STARTER, X, OTHER_KEY)).ok).toBe(true);
  });
});
