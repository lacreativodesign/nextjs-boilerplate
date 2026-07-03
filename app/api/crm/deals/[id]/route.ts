import admin from 'firebase-admin';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { canManageOwnDeals, requireCrmUser, toIso } from '@/lib/crm';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }

    const payload = await req.json();
    const nextStage = String(payload.stage || '').trim();

    const dealRef = adminDb.collection('deals').doc(params.id);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(dealRef);
      if (!snap.exists)
        throw new AppError({ message: 'Deal not found.', code: 'NOT_FOUND', status: 404 });
      const deal = snap.data() || {};

      const roleRestricted = canManageOwnDeals(auth.user.role);
      const isOwner = String(deal.ownerId || deal.assignedSalesId || '') === auth.user.uid;
      if (deal.tenantId !== auth.tenantId || (roleRestricted && !isOwner)) {
        throw new AppError({ message: 'Forbidden', code: 'FORBIDDEN', status: 403 });
      }

      tx.set(
        dealRef,
        {
          ...payload,
          stage: nextStage || deal.stage,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, { route: 'PATCH /api/crm/deals/[id]' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to update deal.',
      context: { module: 'crm', operation: 'update-deal' },
    });
    return NextResponse.json(body, { status, headers });
  }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }

    const doc = await adminDb.collection('deals').doc(params.id).get();
    if (!doc.exists) {
      throw new AppError({ message: 'Deal not found.', code: 'NOT_FOUND', status: 404 });
    }

    const data = doc.data() || {};
    if (data.tenantId !== auth.tenantId) {
      throw new AppError({ message: 'Forbidden', code: 'FORBIDDEN', status: 403 });
    }

    return NextResponse.json({
      ok: true,
      deal: {
        id: doc.id,
        ...data,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/crm/deals/[id]' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to load deal details.',
      context: { module: 'crm', operation: 'get-deal' },
    });
    return NextResponse.json(body, { status, headers });
  }
}
