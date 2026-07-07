import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { calculatePlatformFee } from '@/lib/stripe/connect';
import { getInvoiceWithValidation, getTenantRecord } from '../../shared';
import { buildFinanceLedgerEntry } from '@/lib/finance/ledger';

export const runtime = 'nodejs';

type Body = { paymentMethodId?: string; email?: string; token?: string };

export async function POST(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    const invoiceId = String(params.invoiceId || '').trim();
    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: 'Invoice id is required.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const paymentMethodId = String(body.paymentMethodId || '').trim();
    const email = String(body.email || '').trim();
    const token =
      String(body.token || '').trim() || new URL(req.url).searchParams.get('token') || undefined;

    if (!paymentMethodId) {
      return NextResponse.json(
        { ok: false, error: 'paymentMethodId is required.' },
        { status: 400 },
      );
    }

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

    const amountCents = Math.round(validation.payload.amount * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: 'Invoice amount is invalid.' }, { status: 400 });
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
        },
        application_fee_amount: platformFee,
        transfer_data: {
          destination: connectAccountId,
        },
      },
      {
        stripeAccount: connectAccountId,
        idempotencyKey: `inv_pay_${invoiceId}_${paymentMethodId}`,
      },
    );

    if (paymentIntent.status === 'succeeded') {
      const nowIso = new Date().toISOString();
      const invoiceAmount = validation.payload.amount;
      // Deterministic id = PaymentIntent id makes the ledger write idempotent, so
      // retries (and the confirm route / webhook backstop added later) converge on
      // a single payment record instead of creating duplicates.
      const paymentRef = adminDb.collection('payments').doc(paymentIntent.id);

      const batch = adminDb.batch();
      batch.update(adminDb.collection('invoices').doc(invoiceId), {
        status: 'paid',
        paidAt: nowIso,
        paidAmount: invoiceAmount,
        paymentMethod: 'stripe',
        stripePaymentIntentId: paymentIntent.id,
        updatedAt: nowIso,
      });

      batch.set(paymentRef, {
        tenantId: validation.payload.tenantId,
        clientId: validation.payload.clientId || null,
        invoiceId,
        orderId: validation.payload.orderId,
        amountUsd: invoiceAmount,
        platformFeeUsd: platformFee / 100,
        currency: validation.payload.currency,
        status: 'succeeded',
        method: 'stripe_checkout',
        stripePaymentIntentId: paymentIntent.id,
        paidAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        isDeleted: false,
      });

      // Append-only finance ledger: deterministic ids keyed to the PaymentIntent so
      // the pay route and the confirm route converge on exactly one entry each.
      batch.set(
        adminDb.collection('finance_ledger').doc(`payment_succeeded_${paymentIntent.id}`),
        buildFinanceLedgerEntry({
          tenantId: validation.payload.tenantId,
          type: 'payment.succeeded',
          paymentId: paymentIntent.id,
          invoiceId,
          orderId: validation.payload.orderId,
          clientId: validation.payload.clientId || '',
          amountUsd: invoiceAmount,
          previousStatus: String(validation.payload.status || ''),
          newStatus: 'succeeded',
          method: 'stripe_checkout',
          actor: { uid: 'system', name: 'Client payment (Stripe)' },
        }),
      );
      batch.set(
        adminDb.collection('finance_ledger').doc(`invoice_paid_${paymentIntent.id}`),
        buildFinanceLedgerEntry({
          tenantId: validation.payload.tenantId,
          type: 'invoice.mark_paid',
          invoiceId,
          orderId: validation.payload.orderId,
          clientId: validation.payload.clientId || '',
          amountUsd: invoiceAmount,
          previousStatus: String(validation.payload.status || ''),
          newStatus: 'paid',
          method: 'stripe',
          reason: 'Paid online via client payment page',
          actor: { uid: 'system', name: 'Client payment (Stripe)' },
        }),
      );
      await batch.commit();

      return NextResponse.json({ ok: true, status: 'succeeded', receiptUrl: null });
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
    return NextResponse.json(
      { ok: false, error: 'Unable to process payment. Please try again.' },
      { status: 500 },
    );
  }
}
