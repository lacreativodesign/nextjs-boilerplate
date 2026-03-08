import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripePriceId } from '@/lib/billing/plans';
import { getStripeClient } from '@/lib/payments/stripe';
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubscribeBody = {
  plan?: string;
  paymentMethodId?: string;
};

const VALID_PLANS = new Set(['starter', 'pro', 'enterprise']);

export async function POST(req: Request) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await req.json().catch(() => ({}))) as SubscribeBody;
    const plan = String(body.plan || '')
      .trim()
      .toLowerCase();
    const paymentMethodId = String(body.paymentMethodId || '').trim();

    if (!VALID_PLANS.has(plan)) {
      return NextResponse.json({ ok: false, error: 'Invalid plan' }, { status: 400 });
    }

    if (!paymentMethodId) {
      return NextResponse.json(
        { ok: false, error: 'paymentMethodId is required' },
        { status: 400 },
      );
    }

    const tenantId = String(auth.user.tenantId || '').trim();
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing' }, { status: 400 });
    }

    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();
    const tenantData = tenantSnap.data() || {};

    const email = String(tenantData.email || auth.user.email || '').trim();
    const name = String(
      tenantData.name || auth.user.displayName || auth.user.name || tenantId,
    ).trim();
    const tenantSettings =
      tenantData.settings && typeof tenantData.settings === 'object' ? tenantData.settings : {};
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Tenant email is required' }, { status: 400 });
    }

    const customerId = await getOrCreateStripeCustomer(tenantId, email, name, {
      country: String(tenantSettings.country || 'US'),
      state: String(tenantSettings.state || '').trim() || undefined,
    });
    const stripe = getStripeClient();

    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const priceId = getStripePriceId(plan as 'starter' | 'pro' | 'enterprise');
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId, tax_rates: [] }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { tenantId, plan },
      automatic_tax: { enabled: true },
    });

    await tenantRef.set(
      {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeDefaultPaymentMethodId: paymentMethodId,
        plan,
        subscriptionState: 'active',
        billingStatus: 'active',
        currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: false,
        failedPaymentCount: 0,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    const latestInvoice = subscription.latest_invoice;
    const paymentIntent =
      latestInvoice && typeof latestInvoice !== 'string' && 'payment_intent' in latestInvoice
        ? latestInvoice.payment_intent
        : null;

    const clientSecret =
      paymentIntent && typeof paymentIntent !== 'string' && 'client_secret' in paymentIntent
        ? paymentIntent.client_secret
        : null;

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      clientSecret: clientSecret || null,
    });
  } catch (error) {
    console.error('[BILLING] Subscribe failed', error);
    return NextResponse.json(
      { ok: false, error: 'Unable to create subscription' },
      { status: 500 },
    );
  }
}
