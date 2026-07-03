import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireClient, toISO } from '../../client/_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb
      .collection('payments')
      .where('tenantId', '==', auth.tenantId)
      .where('clientId', '==', auth.clientId)
      .where('isDeleted', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const payments = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        invoiceId: String(data.invoiceId || ''),
        orderId: String(data.orderId || ''),
        status: String(data.status || 'pending'),
        method: String(data.method || 'stripe_checkout'),
        amountUsd: Number(data.amountUsd || 0),
        refundedAmountUsd: Number(data.refundedAmountUsd || 0),
        receiptUrl: data.receiptUrl ? String(data.receiptUrl) : null,
        paidAt: toISO(data.paidAt),
        createdAt: toISO(data.createdAt),
      };
    });

    return NextResponse.json({ ok: true, payments });
  } catch (err: any) {
    console.error('payments/history error:', err);
    return NextResponse.json(
      { ok: false, error: 'Unable to load payment history.' },
      { status: 500 },
    );
  }
}
