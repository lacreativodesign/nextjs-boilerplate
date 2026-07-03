import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { checkRateLimit } from '@/lib/security';
import { invalidateAllSessions } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      throw new AppError({ message: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 });
    }

    await checkRateLimit(req, 'standard', current.uid);

    const token = cookies().get('lac_session')?.value;
    await invalidateAllSessions(current.uid, token || undefined);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('invalidate all sessions error', error);
    const { status, body } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to invalidate sessions.',
      fallbackCode: 'INTERNAL_SERVER_ERROR',
      requestId: req.headers.get('x-request-id') || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
