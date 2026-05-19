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
    let defaultPaymentMethod: {
      brand: string | null;
      last4: string | null;
      expMonth: number | null;
      expYear: number | null;
    } | null = null;

    const savedPaymentMethodSnap = await adminDb
      .collection('billing_payment_methods')
      .doc(tenantId)
      .get();
    const savedPaymentMethod = savedPaymentMethodSnap.data() || {};
    if (savedPaymentMethod.last4) {
      defaultPaymentMethod = {
        brand: typeof savedPaymentMethod.brand === 'string' ? savedPaymentMethod.brand : null,
        last4: typeof savedPaymentMethod.last4 === 'string' ? savedPaymentMethod.last4 : null,
        expMonth: Number.isFinite(Number(savedPaymentMethod.expMonth))
          ? Number(savedPaymentMethod.expMonth)
          : null,
        expYear: Number.isFinite(Number(savedPaymentMethod.expYear))
          ? Number(savedPaymentMethod.expYear)
          : null,
      };
      hasPaymentMethod = true;
    }

    if ((!hasPaymentMethod || !defaultPaymentMethod) && stripeCustomerId) {
      try {
        const stripe = getStripeClient();
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        if (!customer.deleted) {
          const paymentMethodId = customer.invoice_settings?.default_payment_method;
          hasPaymentMethod = Boolean(paymentMethodId);

          if (paymentMethodId && typeof paymentMethodId === 'string') {
            const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
            defaultPaymentMethod = {
              brand: paymentMethod.card?.brand || null,
              last4: paymentMethod.card?.last4 || null,
              expMonth: paymentMethod.card?.exp_month || null,
              expYear: paymentMethod.card?.exp_year || null,
            };
          }
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
        defaultPaymentMethod,
        taxAmount: Number(tenantData.lastInvoiceTax || 0),
        subtotalAmount: Number(tenantData.lastInvoiceSubtotal || 0),
        totalAmount: Number(tenantData.lastInvoiceTotal || 0),
        billingAddress: {
          country: String(tenantData.settings?.country || 'US'),
          state: String(tenantData.settings?.state || ''),
          city: String(tenantData.settings?.city || ''),
          postalCode: String(tenantData.settings?.postalCode || ''),
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to load subscription' },
      { status: 500 },
    );
  }
}
