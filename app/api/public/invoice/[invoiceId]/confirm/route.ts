import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/payments/stripe';
import { calculatePlatformFee } from '@/lib/stripe/connect';
import { getInvoiceWithValidation, getTenantRecord } from '../../shared';
import { recordSuccessfulClientPayment } from '@/lib/finance/clientPaymentActivation';
import { validateRequest } from '@/lib/validations/validate';
import { publicInvoiceConfirmSchema } from '@/lib/validations/commercial-activation';
import { resolveErrorResponse } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    const invoiceId = String(params.invoiceId || '').trim();
    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: 'Invoice id is required.' }, { status: 400 });
    }

    const body = validateRequest(publicInvoiceConfirmSchema, await req.json().catch(() => ({})));
    const paymentIntentId = body.paymentIntentId;
    const token = body.token || new URL(req.url).searchParams.get('token') || undefined;

    const validation = await getInvoiceWithValidation(invoiceId, token);
    if ('error' in validation) {
      return NextResponse.json(
        { ok: false, error: validation.error },
        { status: validation.status },
      );
    }

    const tenant = await getTenantRecord(validation.payload.tenantId);
    const connectAccountId = String(tenant?.stripeConnectAccountId || '').trim();
    if (!tenant || !connectAccountId || tenant.stripeConnectChargesEnabled !== true) {
      return NextResponse.json(
        { ok: false, error: 'Online payments are not enabled for this invoice.' },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      stripeAccount: connectAccountId,
    });

    // The PaymentIntent id is client-supplied: bind it to THIS invoice and tenant before
    // recording anything, so a succeeded intent from another invoice/tenant cannot be replayed.
    if (
      String(paymentIntent.metadata?.invoiceId || '') !== invoiceId ||
      String(paymentIntent.metadata?.tenantId || '') !== validation.payload.tenantId ||
      paymentIntent.metadata?.source !== 'client_payment_page'
    ) {
      return NextResponse.json(
        { ok: false, error: 'Payment could not be confirmed' },
        { status: 400 },
      );
    }

    // Manual confirmation flow: after handleCardAction, the intent sits at
    // requires_confirmation and must be confirmed server-side to capture funds.
    if (paymentIntent.status === 'requires_confirmation') {
      paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        {},
        {
          stripeAccount: connectAccountId,
          idempotencyKey: `inv_confirm_${invoiceId}_${paymentIntentId}`,
        },
      );
    }

    if (paymentIntent.status === 'succeeded') {
      const receivedCents = paymentIntent.amount_received || paymentIntent.amount || 0;
      const platformFeeCents =
        paymentIntent.application_fee_amount ?? calculatePlatformFee(receivedCents);

      const applied = await recordSuccessfulClientPayment({
        invoiceId,
        tenantId: validation.payload.tenantId,
        paymentId: paymentIntent.id,
        amount: receivedCents / 100,
        platformFee: platformFeeCents / 100,
        currency: paymentIntent.currency || validation.payload.currency,
        method: 'stripe_checkout',
        source: 'client_payment_page_confirm',
        stripePaymentIntentId: paymentIntent.id,
        actor: { uid: 'system', name: 'Client payment (Stripe)' },
      });

      return NextResponse.json({
        ok: true,
        status: 'succeeded',
        amountPaid: applied.amountPaid,
        invoiceStatus: applied.status,
        totalPaid: applied.totalPaid,
        balanceDue: applied.balanceDue,
        projectId: applied.projectId,
      });
    }

    if (paymentIntent.status === 'requires_action') {
      return NextResponse.json({
        ok: true,
        status: 'requires_action',
        clientSecret: paymentIntent.client_secret,
      });
    }

    return NextResponse.json(
      { ok: false, status: paymentIntent.status, error: 'Payment could not be confirmed' },
      { status: 400 },
    );
  } catch (err: unknown) {
    console.error('public invoice confirm error:', err);
    const resolved = resolveErrorResponse(err, {
      fallbackMessage: 'Unable to confirm payment.',
    });
    return NextResponse.json(resolved.body, { status: resolved.status, headers: resolved.headers });
  }
}
