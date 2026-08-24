import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireCrmUser, toIso } from '@/lib/crm';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }

    const { searchParams } = new URL(req.url);
    const dealId = searchParams.get('dealId');

    const snap = await adminDb
      .collection('discountRequests')
      .where('tenantId', '==', auth.tenantId)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const rows = snap.docs
      .filter((doc) => (!dealId ? true : doc.data().dealId === dealId))
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          dealId: String(data.dealId || ''),
          requestedBy: String(data.requestedBy || ''),
          discountPercent: Number(data.discountPercent || 0),
          reason: String(data.reason || ''),
          status: String(data.status || 'pending'),
          reviewedBy: String(data.reviewedBy || ''),
          reviewedAt: toIso(data.reviewedAt),
          createdAt: toIso(data.createdAt),
        };
      });

    return NextResponse.json({ ok: true, requests: rows });
  } catch (error) {
    logError(error, { route: 'GET /api/crm/discount-requests' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to load discount requests.',
      context: { module: 'crm', operation: 'list-discount-requests' },
    });
    return NextResponse.json(body, { status, headers });
  }
}
