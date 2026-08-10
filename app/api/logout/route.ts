import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/security';
import { invalidateSession } from '@/lib/auth/session';
import { resolveErrorResponse } from '@/lib/errors';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { recordAttendanceEvent } from '@/lib/attendance/record';

const COOKIE_NAME = 'lac_session';
function getCookieDomain(hostname: string): string | undefined {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return undefined;
  const parts = hostname.split('.');
  if (parts.length >= 2) return `.${parts.slice(-2).join('.')}`;
  return undefined;
}

export async function POST(request: Request) {
  try {
    await checkRateLimit(request, 'strict');
    const sessionCookie = cookies().get(COOKIE_NAME)?.value;

    // S11: closes the day's attendance record. Read BEFORE the session is invalidated —
    // afterwards the cookie no longer resolves to anyone and there is nothing to stamp.
    // getCurrentUser() already returns null rather than throwing on a bad cookie, and
    // recordAttendanceEvent never throws, so signing out cannot fail because of this.
    if (sessionCookie) {
      const me = await getCurrentUser();
      if (me) {
        await recordAttendanceEvent({
          tenantId: me.tenantId,
          userId: me.uid,
          type: 'logout',
        });
      }
    }

    if (sessionCookie) {
      await invalidateSession(sessionCookie);
    }

    const res = NextResponse.json({ success: true });
    const hostname = new URL(request.url).hostname;
    const cookieDomain = getCookieDomain(hostname);

    // Clear lac_session cookie
    res.cookies.set({
      name: COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain,
      maxAge: 0,
    });

    // Clear tenant_id and user_role cookies (set without domain in session-login)
    res.cookies.set({
      name: 'tenant_id',
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    res.cookies.set({
      name: 'user_role',
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return res;
  } catch (e) {
    console.error('Logout error', e);
    const { status, body } = resolveErrorResponse(e, {
      fallbackMessage: 'Unable to log out.',
      fallbackCode: 'INTERNAL_SERVER_ERROR',
      requestId: request.headers.get('x-request-id') || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
