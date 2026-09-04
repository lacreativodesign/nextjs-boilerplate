import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { verifyOtp } from '@/lib/auth/otp';

export const runtime = 'nodejs';

const MAX_ATTEMPTS = 5;

type VerifyResult =
  | { kind: 'verified' }
  | { kind: 'missing' }
  | { kind: 'expired' }
  | { kind: 'locked' }
  | { kind: 'incorrect'; remaining: number };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const otp = String(body?.otp || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { ok: false, error: 'A valid email and 6-digit code are required.' },
        { status: 400 },
      );
    }

    const ref = adminDb.collection('email_otps').doc(email);
    const result = await adminDb.runTransaction<VerifyResult>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { kind: 'missing' };

      const data = snap.data() || {};
      const now = Date.now();
      const expiresAt = Number(data.expiresAt || 0);
      if (!expiresAt || now > expiresAt) {
        tx.delete(ref);
        return { kind: 'expired' };
      }

      const attempts = Number(data.attempts || 0);
      if (attempts >= MAX_ATTEMPTS) {
        tx.delete(ref);
        return { kind: 'locked' };
      }

      if (!verifyOtp(otp, data.otpHash)) {
        const nextAttempts = attempts + 1;
        if (nextAttempts >= MAX_ATTEMPTS) {
          tx.delete(ref);
          return { kind: 'locked' };
        }

        tx.set(
          ref,
          {
            attempts: nextAttempts,
            lastAttemptAt: now,
          },
          { merge: true },
        );
        return { kind: 'incorrect', remaining: MAX_ATTEMPTS - nextAttempts };
      }

      tx.set(
        ref,
        {
          verified: true,
          verifiedAt: now,
        },
        { merge: true },
      );
      return { kind: 'verified' };
    });

    if (result.kind === 'missing') {
      return NextResponse.json(
        { ok: false, error: 'No verification code found. Please request a new one.' },
        { status: 404 },
      );
    }

    if (result.kind === 'expired') {
      return NextResponse.json(
        { ok: false, error: 'Code has expired. Please request a new one.' },
        { status: 410 },
      );
    }

    if (result.kind === 'locked') {
      return NextResponse.json(
        { ok: false, error: 'Too many incorrect attempts. Please request a new code.' },
        { status: 429 },
      );
    }

    if (result.kind === 'incorrect') {
      return NextResponse.json(
        {
          ok: false,
          error: `Incorrect code. ${result.remaining} attempt${result.remaining === 1 ? '' : 's'} remaining.`,
        },
        { status: 400 },
      );
    }

    try {
      const firebaseUser = await adminAuth.getUserByEmail(email);
      await adminAuth.updateUser(firebaseUser.uid, { emailVerified: true });
    } catch (verifyErr) {
      // During normal signup the Auth user does not exist yet; the signup route creates it
      // emailVerified only after consuming this verified OTP. Existing users are updated here.
      console.info('verify-otp: Firebase Auth user not updated:', verifyErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('verify-otp error:', err);
    return NextResponse.json({ ok: false, error: 'Verification failed.' }, { status: 500 });
  }
}
