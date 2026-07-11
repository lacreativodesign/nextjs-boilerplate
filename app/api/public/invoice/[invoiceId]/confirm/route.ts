import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { calculatePlatformFee } from '@/lib/stripe/connect';
import { getInvoiceWithValidation, getTenantRecord } from '../../shared';
import { buildFinanceLedgerEntry } from '@/lib/finance/ledger';

export const runtime = 'nodejs';

type Body = { paymentIntentId?: string; token?: string };

export async function POST(req: Request, { params }: { params: { invoiceId: string } }) {
  try {
    const invoiceId = String(params.invoiceId || '').trim();
    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: 'Invoice id is required.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const paymentIntentId = String(body.paymentIntentId || '').trim();
    const token =
      String(body.token || '').trim() || new URL(req.url).searchParams.get('token') || undefined;
    if (!paymentIntentId) {
      return NextResponse.json(
        { ok: false, error: 'paymentIntentId is required.' },
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

    // The PaymentIntent id is client-supplied: bind it to THIS invoice before
    // recording anything, so a succeeded intent belonging to another invoice
    // cannot be replayed to mark this one paid.
    if (String(paymentIntent.metadata?.invoiceId || '') !== invoiceId) {
      return NextResponse.json(
        { ok: false, error: 'Payment could not be confirmed' },
        { status: 400 },
      );
    }

    // Manual confirmation flow (pay route uses confirmation_method: 'manual'):
    // after the customer completes 3DS via handleCardAction, the intent sits at
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
      const nowIso = new Date().toISOString();
      const invoiceAmount = validation.payload.amount;
      const platformFee = calculatePlatformFee(Math.round(invoiceAmount * 100));

      // Deterministic id = PaymentIntent id, identical shape to the pay route, so a
      // 3DS/SCA confirmation records a ledger entry exactly once and converges with
      // the pay route / webhook backstop instead of creating duplicates.
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

      // Same deterministic ledger ids as the pay route so 3DS/SCA confirmations
      // converge on exactly one payment.succeeded and one invoice.mark_paid entry.
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

      return NextResponse.json({ ok: true, status: 'succeeded' });
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
  } catch (err) {
    console.error('public invoice confirm error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to confirm payment.' }, { status: 500 });
  }
}
