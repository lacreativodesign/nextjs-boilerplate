import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/payments/stripe';
import { calculatePlatformFee } from '@/lib/stripe/connect';
import { getInvoiceWithValidation, getTenantRecord } from '../../shared';
import { recordSuccessfulClientPayment } from '@/lib/finance/clientPaymentActivation';
import { validateRequest } from '@/lib/validations/validate';
import { publicInvoicePaySchema } from '@/lib/validations/commercial-activation';
import { resolveErrorResponse } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    const invoiceId = String(params.invoiceId || '').trim();
    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: 'Invoice id is required.' }, { status: 400 });
    }

    const body = validateRequest(publicInvoicePaySchema, await req.json().catch(() => ({})));
    const paymentMethodId = body.paymentMethodId;
    const email = body.email || '';
    const token = body.token || new URL(req.url).searchParams.get('token') || undefined;

    const validation = await getInvoiceWithValidation(invoiceId, token);
    if ('error' in validation) {
      return NextResponse.json(
        { ok: false, error: validation.error },
        { status: validation.status },
      );
    }

    if (String(validation.payload.status).toLowerCase() === 'paid') {
      return NextResponse.json(
        { ok: false, error: 'This invoice has already been paid' },
        { status: 400 },
      );
    }

    const tenant = await getTenantRecord(validation.payload.tenantId);
    if (!tenant) {
      return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 });
    }

    const tenantName = String(
      (tenant.brand as { name?: string } | undefined)?.name || tenant.name || 'this business',
    );
    const connectAccountId = String(tenant.stripeConnectAccountId || '').trim();
    if (!connectAccountId || tenant.stripeConnectChargesEnabled !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: `Online payments are not available for this invoice. Please contact ${tenantName} directly.`,
        },
        { status: 400 },
      );
    }

    // 100% invoices charge the outstanding balance. 50/50 invoices charge only the first
    // 50% until that deposit is posted; the second visit charges the remaining balance.
    const amountCents = Math.round(validation.payload.payableNow * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Invoice amount due is invalid.' },
        { status: 400 },
      );
    }

    const platformFee = calculatePlatformFee(amountCents);
    const stripe = getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: validation.payload.currency.toLowerCase(),
        payment_method: paymentMethodId,
        confirmation_method: 'manual',
        confirm: true,
        receipt_email: email || undefined,
        description: `Invoice ${validation.payload.orderId}`,
        metadata: {
          invoiceId,
          tenantId: validation.payload.tenantId,
          clientId: validation.payload.clientId || '',
          orderId: validation.payload.orderId,
          source: 'client_payment_page',
          paymentPlan: validation.payload.paymentPlan,
          installmentSequence: String(validation.payload.installmentSequence),
          expectedAmountCents: String(amountCents),
        },
        application_fee_amount: platformFee,
      },
      {
        // Connect DIRECT charge: the PaymentIntent lives on the tenant's connected account.
        stripeAccount: connectAccountId,
        // Sequence is part of the key so the second 50% can use the same saved/card payment
        // method without Stripe returning the already-completed deposit PaymentIntent.
        idempotencyKey: `inv_pay_${invoiceId}_${validation.payload.installmentSequence}_${paymentMethodId}`,
      },
    );

    if (paymentIntent.status === 'succeeded') {
      const applied = await recordSuccessfulClientPayment({
        invoiceId,
        tenantId: validation.payload.tenantId,
        paymentId: paymentIntent.id,
        amount: (paymentIntent.amount_received || paymentIntent.amount || amountCents) / 100,
        platformFee: platformFee / 100,
        currency: paymentIntent.currency || validation.payload.currency,
        method: 'stripe_checkout',
        source: 'client_payment_page',
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
        receiptUrl: null,
      });
    }

    if (paymentIntent.status === 'requires_action') {
      return NextResponse.json({
        ok: true,
        status: 'requires_action',
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Payment failed. Please check your card details and try again.' },
      { status: 400 },
    );
  } catch (err: unknown) {
    const stripeError = err as { type?: string; message?: string };
    if (stripeError?.type === 'card_error') {
      return NextResponse.json(
        { ok: false, error: stripeError.message || 'Card was declined.' },
        { status: 400 },
      );
    }

    console.error('public invoice pay error:', err);
    const resolved = resolveErrorResponse(err, {
      fallbackMessage: 'Unable to process payment. Please try again.',
    });
    return NextResponse.json(resolved.body, { status: resolved.status, headers: resolved.headers });
  }
}
