import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { idToken, rememberMe, extendedSession } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // 14 days if remember me checked, 5 days otherwise, 1 day if not logged in
    const expiresIn = extendedSession
      ? 60 * 60 * 24 * 14 * 1000
      : rememberMe
      ? 60 * 60 * 24 * 5 * 1000
      : 60 * 60 * 24 * 1 * 1000;

    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    const response = NextResponse.json({ success: true });

    response.cookies.set('lac_session', sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    // Get tenantId from claims first, fallback to Firestore users collection
    // This handles the case where custom claims haven't propagated yet
    let tenantId = (decodedToken as any).tenantId || (decodedToken as any).tenant_id || '';

    if (!tenantId) {
      try {
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        if (userDoc.exists) {
          tenantId = (userDoc.data() as any)?.tenantId || '';
        }
      } catch (fallbackError) {
        console.error('session-login: tenantId fallback failed', fallbackError);
      }
    }

    if (tenantId) {
      response.cookies.set('tenant_id', tenantId, {
        maxAge: expiresIn / 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    }

    // Also set role cookie for client-side role caching
    const role = (decodedToken as any).role || '';
    if (role) {
      response.cookies.set('user_role', role, {
        maxAge: expiresIn / 1000,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    }

    return response;
  } catch (error: any) {
    console.error('Session login error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to create session',
        details: error.code || 'unknown',
      },
      { status: 500 }
    );
  }
}
