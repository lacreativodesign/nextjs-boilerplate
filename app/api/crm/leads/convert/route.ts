import admin from 'firebase-admin';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { canCreateLeads, requireCrmUser } from '@/lib/crm';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';
import { createNotifications, getUsersByRoles } from '@/lib/notifications';

export async function POST(req: Request) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }
    if (!canCreateLeads(auth.user.role)) {
      throw new AppError({
        message: 'Only sales can convert leads.',
        code: 'FORBIDDEN',
        status: 403,
      });
    }

    const payload = await req.json();
    const leadId = String(payload.leadId || '');
    const title = String(payload.title || '').trim() || 'New deal';
    const valueUSD = Number(payload.valueUSD || 0);

    if (!leadId) {
      throw new AppError({ message: 'leadId is required.', code: 'VALIDATION_ERROR', status: 400 });
    }

    const leadRef = adminDb.collection('leads').doc(leadId);
    const dealRef = adminDb.collection('deals').doc();

    await adminDb.runTransaction(async (tx) => {
      const leadSnap = await tx.get(leadRef);
      if (!leadSnap.exists)
        throw new AppError({ message: 'Lead not found.', code: 'NOT_FOUND', status: 404 });
      const lead = leadSnap.data() || {};

      if (String(lead.createdBy || '') !== auth.user.uid) {
        throw new AppError({ message: 'Forbidden', code: 'FORBIDDEN', status: 403 });
      }

      tx.set(dealRef, {
        id: dealRef.id,
        leadId,
        title,
        valueUSD,
        stage: 'new',
        discountPercent: 0,
        discountApproved: true,
        assignedSalesId: auth.user.uid,
        tenantId: auth.tenantId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(leadRef, { status: 'converted' }, { merge: true });
    });

    const convertNotifyTargets = await getUsersByRoles(
      ['admin', 'super_admin', 'sales_manager'],
      auth.tenantId,
    );
    await createNotifications({
      recipients: convertNotifyTargets,
      tenantId: auth.tenantId,
      type: 'info',
      title: 'Lead converted to deal',
      message: `${title} was created from a converted lead.`,
      entityType: 'deal',
      entityId: dealRef.id,
      deepLink: '/admin/sales/deals',
    });

    return NextResponse.json({ ok: true, dealId: dealRef.id });
  } catch (error) {
    logError(error, { route: 'POST /api/crm/leads/convert' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to convert lead.',
      context: { module: 'crm', operation: 'convert-lead' },
    });
    return NextResponse.json(body, { status, headers });
  }
}
