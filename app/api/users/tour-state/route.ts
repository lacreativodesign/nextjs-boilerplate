import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser } from '@/app/api/admin/_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * ONB-02: first-login tour completion, persisted per user.
 *
 * Completion used to live in a single device-wide localStorage flag
 * ('bizosto_tour_complete'). That flag re-triggered a completed tour on every
 * new device, and one user's completion suppressed the tour for a different
 * user on a shared device. Completion is now stored on the caller's own user
 * document, keyed by tour version, so it follows the user across devices and is
 * never shared between accounts.
 *
 * This route is caller-identity scoped: it always acts on the currently
 * authenticated user (users/{uid}) and never on a tenant collection.
 */
const TOUR_VERSION = 1;

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ completed: false, error: 'Unauthorized' }, { status: 401 });
    }

    const snap = await adminDb.collection('users').doc(me.uid).get();
    const completedVersion = snap.data()?.tourCompletedVersion;

    return NextResponse.json({
      completed: completedVersion === TOUR_VERSION,
      version: TOUR_VERSION,
    });
  } catch (error) {
    console.error('[TOUR_STATE_GET]', error);
    return NextResponse.json(
      { completed: false, error: 'Failed to read tour state' },
      {
        status: 500,
      },
    );
  }
}

export async function POST() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    await adminDb.collection('users').doc(me.uid).set(
      {
        tourCompletedVersion: TOUR_VERSION,
        tourCompletedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, completed: true, version: TOUR_VERSION });
  } catch (error) {
    console.error('[TOUR_STATE_POST]', error);
    return NextResponse.json({ ok: false, error: 'Failed to save tour state' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    await adminDb.collection('users').doc(me.uid).set(
      {
        tourCompletedVersion: FieldValue.delete(),
        tourCompletedAt: FieldValue.delete(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, completed: false });
  } catch (error) {
    console.error('[TOUR_STATE_DELETE]', error);
    return NextResponse.json({ ok: false, error: 'Failed to reset tour state' }, { status: 500 });
  }
}
