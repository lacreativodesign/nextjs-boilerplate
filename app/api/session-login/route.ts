import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { idToken, rememberMe } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    // Verify the ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    // Create session cookie (5 days if rememberMe, 1 day otherwise)
    const expiresIn = rememberMe ? 60 * 60 * 24 * 5 * 1000 : 60 * 60 * 24 * 1000;
    
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    const response = NextResponse.json({ success: true });

    // Set session cookie
    response.cookies.set('lac_session', sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    // Set tenant_id cookie from custom claims so middleware can scope data per tenant
    const tenantId = (decodedToken as any).tenantId || (decodedToken as any).tenant_id || '';
    if (tenantId) {
      response.cookies.set('tenant_id', tenantId, {
        maxAge: expiresIn / 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    }

    return response;

  } catch (error: any) {
    console.error('Session login error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to create session',
      details: error.code || 'unknown'
    }, { status: 500 });
  }
}
