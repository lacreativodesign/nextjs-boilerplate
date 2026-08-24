import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  arrayUnion,
  createSalesEvent,
  parseNumber,
  parseString,
  queueSalesEmail,
  queueSalesNotification,
  requireAdmin,
  serverTimestamp,
} from '../../_utils';
import { createClientFromClosedWonDeal } from '@/lib/crm';
import { isTenantOwned } from '@/lib/tenant/ownership';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, '');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing deal id.' }, { status: 400 });
    }

    const dealRef = adminDb.collection('deals').doc(id);
    const preSnap = await dealRef.get();
    if (!preSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const preData = preSnap.data() || {};
    if (
      !isTenantOwned({
        data: preData,
        callerTenantId: auth.user.tenantId,
        callerRole: auth.user.role,
      })
    ) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const targetTenantId = String(preData.tenantId || '').trim();
    if (!targetTenantId) {
      return NextResponse.json({ ok: false, error: 'Deal tenant is missing.' }, { status: 409 });
    }
    let closedWonTriggered = false;
    let finalStage = parseString(preData.stage, 'New');

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(dealRef);
      if (!snap.exists) {
        throw new Error('Deal not found');
      }
      const data = snap.data() || {};
      const prevStage = parseString(data.stage, 'New');
      const nextStage =
        payload.stage !== undefined ? parseString(payload.stage, prevStage) : prevStage;
      finalStage = nextStage;
      const updates: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      if (payload.dealName !== undefined) updates.dealName = parseString(payload.dealName, '');
      if (payload.clientName !== undefined)
        updates.clientName = parseString(payload.clientName, '');
      if (payload.valueUsd !== undefined) updates.valueUsd = parseNumber(payload.valueUsd, 0);
      if (payload.probability !== undefined)
        updates.probability = parseNumber(payload.probability, 0);
      if (payload.ownerId !== undefined) updates.ownerId = parseString(payload.ownerId, '') || null;
      if (payload.ownerName !== undefined)
        updates.ownerName = parseString(payload.ownerName, '') || null;
      if (payload.expectedCloseDate !== undefined) {
        updates.expectedCloseDate = payload.expectedCloseDate
          ? new Date(payload.expectedCloseDate)
          : null;
      }

      if (nextStage !== prevStage) {
        updates.stage = nextStage;
        updates.stageHistory = arrayUnion({
          from: prevStage,
          to: nextStage,
          changedAt: serverTimestamp(),
          changedByUid: auth.user.uid,
          changedByName: auth.user.name || auth.user.fullName || '',
        });
      }

      tx.set(dealRef, updates, { merge: true });
    });

    if (finalStage === 'Closed Won') {
      const activation = await createClientFromClosedWonDeal({
        dealId: id,
        actor: {
          uid: auth.user.uid,
          name: auth.user.name || auth.user.fullName || '',
          tenantId: targetTenantId,
        },
      });
      closedWonTriggered = activation.created;
    }

    await createSalesEvent({
      type: closedWonTriggered ? 'deal_closed_won' : 'deal_updated',
      title: closedWonTriggered ? 'Deal closed won' : 'Deal updated',
      description: closedWonTriggered ? `Deal ${id} marked Closed Won` : `Deal ${id} updated`,
      entityType: 'deal',
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || '',
      tenantId: targetTenantId,
    });

    if (closedWonTriggered) {
      await queueSalesNotification({
        title: 'Deal Closed Won',
        body: `Deal ${id} closed won. Project and finance flow created.`,
        userId: auth.user.uid,
        metadata: { dealId: id },
        tenantId: targetTenantId,
      });

      await queueSalesEmail({
        to: auth.user.email || '',
        template: 'deal_closed_won',
        subject: 'Deal Closed Won',
        data: { dealId: id },
        tenantId: targetTenantId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('sales deals update error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to update deal.' }, { status: 500 });
  }
}
