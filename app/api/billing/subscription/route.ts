import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { requireBillingAccess } from '../_utils';
import { getCurrentSubscription } from '@/lib/billing/stripe-subscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.user.tenantId;
    const [subscription, tenantSnap] = await Promise.all([
      getCurrentSubscription(tenantId),
      adminDb.collection('tenants').doc(tenantId).get(),
    ]);

    const tenantData = tenantSnap.data() || {};
    const stripeCustomerId = String(
      tenantData.stripeCustomerId || subscription?.stripeCustomerId || '',
    ).trim();

    let hasPaymentMethod = Boolean(tenantData.stripeDefaultPaymentMethodId);

    if (!hasPaymentMethod && stripeCustomerId) {
      try {
        const stripe = getStripeClient();
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        if (!customer.deleted) {
          hasPaymentMethod = Boolean(customer.invoice_settings?.default_payment_method);
        }
      } catch (error) {
        console.error('[BILLING] Failed to resolve default payment method', {
          tenantId,
          stripeCustomerId,
          error,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      subscription: {
        ...(subscription || {}),
        plan: String(tenantData.plan || subscription?.plan || 'starter'),
        status: String(tenantData.billingStatus || subscription?.status || 'Not subscribed'),
        currentPeriodEnd: tenantData.currentPeriodEnd || subscription?.currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(tenantData.cancelAtPeriodEnd ?? subscription?.cancelAtPeriodEnd),
        trialEndsAt: tenantData.trialEndsAt || null,
        hasPaymentMethod,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to load subscription' },
      { status: 500 },
    );
  }
}
