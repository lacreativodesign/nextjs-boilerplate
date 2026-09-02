import { NextResponse } from 'next/server';
import { updatePaymentMethod } from '@/lib/billing/stripe-subscription';
import { AuditLogger } from '@/lib/audit/audit-logger';
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

    // SOC2 F-05 / CC6.1: changing the card a workspace is charged on is a financial
    // control event, and this route reaches Stripe directly rather than through the
    // canonical billing service, so nothing else could record it. Written after the
    // update resolves — a failed attach throws and leaves no false record.
    //
    // The paymentMethodId is deliberately NOT logged. It is a Stripe reference rather
    // than card data, but the trail is readable by every tenant admin and the actor,
    // tenant and time already answer who changed the instrument and when; which card
    // it became is a question for Stripe.
    await AuditLogger.log({
      tenantId: auth.user.tenantId,
      userId: auth.user.uid,
      userEmail: String(auth.user.email || ''),
      userName: String(auth.user.name || auth.user.email || auth.user.uid),
      action: 'update',
      resource: 'payment',
      resourceId: auth.user.tenantId,
      changes: [{ field: 'paymentMethod', oldValue: null, newValue: 'replaced' }],
      status: 'success',
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to update payment method' },
      { status: 500 },
    );
  }
}
