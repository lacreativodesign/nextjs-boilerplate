import admin from 'firebase-admin';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { canApproveDiscount, requireCrmUser } from '@/lib/crm';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }
    if (!canApproveDiscount(auth.user.role)) {
      throw new AppError({
        message: 'Only sales manager can review requests.',
        code: 'FORBIDDEN',
        status: 403,
      });
    }

    const payload = await req.json();
    const decision = String(payload.decision || '');
    if (!['approved', 'rejected'].includes(decision)) {
      throw new AppError({
        message: 'decision must be approved or rejected.',
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    const reqRef = adminDb.collection('discountRequests').doc(params.id);
    await adminDb.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists)
        throw new AppError({ message: 'Request not found.', code: 'NOT_FOUND', status: 404 });

      const discountRequest = reqSnap.data() || {};
      if (discountRequest.tenantId !== auth.tenantId) {
        throw new AppError({ message: 'Forbidden', code: 'FORBIDDEN', status: 403 });
      }

      tx.set(
        reqRef,
        {
          status: decision,
          reviewedBy: auth.user.uid,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (discountRequest.dealId) {
        tx.set(
          adminDb.collection('deals').doc(String(discountRequest.dealId)),
          {
            discountApproved: decision === 'approved',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, { route: 'POST /api/crm/discount-requests/[id]/review' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to review discount request.',
      context: { module: 'crm', operation: 'review-discount-request' },
    });
    return NextResponse.json(body, { status, headers });
  }
}
