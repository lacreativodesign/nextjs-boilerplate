import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_TENANT_ID } from '@/lib/tenant/constants';
import { getSalesSettings, requireSalesManager, toISO } from '../../_utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.user.tenantId;
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing.' }, { status: 403 });
    }
    const snap = await adminDb.collection('deals').where('isDeleted', '==', false).limit(500).get();

    const deals = snap.docs
      .map((doc) => {
        const data = doc.data() || {};
        const listPriceUsd = Number(data.listPriceUsd || data.valueUsd || data.amountUsd || 0);
        const discountPct = Number(data.discountPct || 0);
        const discountUsd = Number(data.discountUsd || (listPriceUsd * discountPct) / 100 || 0);
        const finalPriceUsd = Number(data.finalPriceUsd || listPriceUsd - discountUsd || 0);
        const discountApproved = Boolean(data.discountApproved);
        const discountStatus = String(
          data.discountStatus ||
            (discountPct > 0 ? (discountApproved ? 'approved' : 'pending') : 'none'),
        );
        return {
          id: doc.id,
          tenantId: data.tenantId || DEFAULT_TENANT_ID,
          dealName: String(data.dealName || ''),
          clientName: String(data.clientName || ''),
          stage: String(data.stage || 'New Lead'),
          valueUsd: Number(data.finalPriceUsd || data.valueUsd || 0),
          listPriceUsd,
          discountPct,
          discountUsd,
          finalPriceUsd,
          discountReason: data.discountReason || null,
          discountStatus,
          probability: Number(data.probability || 0),
          ownerId: data.ownerId || null,
          ownerName: data.ownerName || null,
          expectedCloseDate: toISO(data.expectedCloseDate),
          notes: String(data.notes || ''),
          discountApproved,
          discountRequestedAt: toISO(data.discountRequestedAt),
          discountApprovedAt: toISO(data.discountApprovedAt),
          discountRequestedByUid: data.discountRequestedByUid || null,
          discountApprovedByUid: data.discountApprovedByUid || null,
          discountApprovedByName: data.discountApprovedByName || null,
          clientId: data.clientId || null,
          projectId: data.projectId || null,
          paymentStatus: data.paymentStatus || null,
          createdAt: toISO(data.createdAt),
          updatedAt: toISO(data.updatedAt),
        };
      })
      .filter(
        (deal) => String((deal as Record<string, any>).tenantId || DEFAULT_TENANT_ID) === tenantId,
      );

    const { discountApprovalThresholdPct } = await getSalesSettings();

    return NextResponse.json({ ok: true, deals, discountApprovalThresholdPct });
  } catch (err: any) {
    console.error('sales manager deals list error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to load deals.' }, { status: 500 });
  }
}
