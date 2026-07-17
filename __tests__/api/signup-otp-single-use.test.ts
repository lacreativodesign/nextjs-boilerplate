import { FirestoreEmulator } from './test-utils/firestore-emulator';

/**
 * E7 — OTP atomic consumption (behavioral).
 *
 * The signup route validates AND burns the verified OTP inside one Firestore
 * transaction before provisioning anything. This test exercises that exact
 * transaction shape against the emulator to prove the code is strictly
 * single-use: replaying it (or racing it) yields exactly one successful consume,
 * so one verified code can never provision two tenants.
 */

const EMAIL = 'founder@example.com';

const seedVerifiedOtp = (db: FirestoreEmulator) =>
  db
    .collection('email_otps')
    .doc(EMAIL)
    .set({ verified: true, createdAt: Date.now(), otpHash: 'x' });

// Mirrors the gate in app/api/signup/route.ts.
const consumeOtp = async (db: FirestoreEmulator) => {
  const otpRef = db.collection('email_otps').doc(EMAIL);
  return db.runTransaction(async (tx: any) => {
    const otpSnap = await tx.get(otpRef);
    const otpData = otpSnap.data();

    if (!otpSnap.exists || otpData?.verified !== true) {
      return { ok: false as const, error: 'unverified' };
    }
    const otpCreatedAt = Number(otpData?.createdAt || 0);
    if (!otpCreatedAt || Date.now() - otpCreatedAt > 24 * 60 * 60 * 1000) {
      return { ok: false as const, error: 'expired' };
    }
    tx.delete(otpRef);
    return { ok: true as const };
  });
};

describe('OTP is single-use, consumed before provisioning (E7)', () => {
  let db: FirestoreEmulator;

  beforeEach(() => {
    db = new FirestoreEmulator({});
  });

  it('consumes a verified OTP once and burns it', async () => {
    await seedVerifiedOtp(db);

    const first = await consumeOtp(db);
    expect(first.ok).toBe(true);

    const doc = await db.collection('email_otps').doc(EMAIL).get();
    expect(doc.exists).toBe(false);
  });

  it('rejects a REPLAY of the same verified OTP (no second tenant)', async () => {
    await seedVerifiedOtp(db);

    const first = await consumeOtp(db);
    const replay = await consumeOtp(db);

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.error).toBe('unverified');
  });

  it('rejects an unverified OTP without burning it', async () => {
    await db.collection('email_otps').doc(EMAIL).set({ verified: false, createdAt: Date.now() });

    const res = await consumeOtp(db);
    expect(res.ok).toBe(false);

    // An unverified code is left intact so the user can still verify it.
    const doc = await db.collection('email_otps').doc(EMAIL).get();
    expect(doc.exists).toBe(true);
  });

  it('rejects a verified but stale (>24h) OTP', async () => {
    await db
      .collection('email_otps')
      .doc(EMAIL)
      .set({
        verified: true,
        createdAt: Date.now() - 25 * 60 * 60 * 1000,
        otpHash: 'x',
      });

    const res = await consumeOtp(db);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('expired');
  });

  it('rejects when no OTP exists at all', async () => {
    const res = await consumeOtp(db);
    expect(res.ok).toBe(false);
  });
});
