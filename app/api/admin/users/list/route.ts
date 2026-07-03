import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminRole } from '../../_utils';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { checkRateLimit } from '@/lib/security';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const current = await getCurrentUser();
    if (!current || (!isAdminRole(current.role) && current.role !== 'super_admin')) {
      throw new AppError({ message: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 });
    }

    await checkRateLimit(req, 'relaxed', current.uid);

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '500'), 500);

    // Single-field where() needs no composite index — orderBy is done in JS below
    const snap = await adminDb
      .collection('users')
      .where('tenantId', '==', current.tenantId)
      .limit(limit)
      .get();

    const list = snap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .sort((a: any, b: any) => {
        const aTime =
          typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt?.toMillis?.() ?? 0);
        const bTime =
          typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt?.toMillis?.() ?? 0);
        return bTime - aTime;
      });

    const identifiers = list
      .map((user: any) => ({ uid: user.uid }))
      .filter((item: any) => Boolean(item.uid));
    const mfaMap = new Map<string, boolean>();

    if (identifiers.length) {
      try {
        const chunks: { uid: string }[][] = [];
        for (let i = 0; i < identifiers.length; i += 100) {
          chunks.push(identifiers.slice(i, i + 100));
        }
        for (const chunk of chunks) {
          const authResult = await adminAuth.getUsers(chunk);
          authResult.users.forEach((user) => {
            const enrolled = user.multiFactor?.enrolledFactors || [];
            mfaMap.set(user.uid, enrolled.length > 0);
          });
        }
      } catch (mfaError) {
        console.warn('MFA lookup failed, returning users without MFA data:', mfaError);
      }
    }

    const enriched = list.map((user: any) => ({
      ...user,
      mfaEnabled: mfaMap.get(user.uid) || false,
    }));

    return NextResponse.json({
      users: enriched,
      pagination: { hasMore: false, nextCursor: null },
    });
  } catch (e) {
    console.error('Error list users:', e);
    const { status, body } = resolveErrorResponse(e, {
      fallbackMessage: 'Unable to list users.',
      fallbackCode: 'INTERNAL_SERVER_ERROR',
      requestId: req.headers.get('x-request-id') || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
