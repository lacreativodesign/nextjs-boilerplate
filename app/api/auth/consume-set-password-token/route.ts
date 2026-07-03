import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getTokenCollection, hashSetPasswordToken } from '@/lib/passwordSetup';
import { invalidateAllSessions } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    const password = String(body?.password || '');

    if (!token || !password) {
      return NextResponse.json({ ok: false, error: 'Missing token or password' }, { status: 400 });
    }

    const tokenRef = adminDb.collection(getTokenCollection()).doc(hashSetPasswordToken(token));
    const tokenSnap = await tokenRef.get();

    if (!tokenSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 404 });
    }

    const data = tokenSnap.data() || {};
    if (data.usedAt) {
      return NextResponse.json({ ok: false, error: 'Token already used' }, { status: 409 });
    }

    const expiresAt = data.expiresAt ? Date.parse(String(data.expiresAt)) : 0;
    if (expiresAt && Date.now() > expiresAt) {
      return NextResponse.json({ ok: false, error: 'Token expired' }, { status: 410 });
    }

    const uid = String(data.uid || '').trim();
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'Token missing user' }, { status: 400 });
    }

    await adminAuth.updateUser(uid, { password });

    // Kill every existing session the moment the password changes: internal session
    // ledger (covers staff paths and client portal) plus Firebase refresh tokens.
    // A stolen session must never survive a password reset. Ordering is deliberate:
    // if either call throws, usedAt is not yet written, so the user can safely retry.
    await invalidateAllSessions(uid);
    await adminAuth.revokeRefreshTokens(uid);

    await tokenRef.update({
      usedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('CONSUME SET PASSWORD TOKEN ERROR:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
