import { NextResponse } from 'next/server';
import { updatePaymentMethod } from '@/lib/billing/stripe-subscription';
import { requireBillingAccess } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const paymentMethodId = String(body?.paymentMethodId || '').trim();
    if (!paymentMethodId) {
      return NextResponse.json(
        { ok: false, error: 'paymentMethodId is required' },
        { status: 400 },
      );
    }

    await updatePaymentMethod({ tenantId: auth.user.tenantId, paymentMethodId });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to update payment method' },
      { status: 500 },
    );
  }
}
