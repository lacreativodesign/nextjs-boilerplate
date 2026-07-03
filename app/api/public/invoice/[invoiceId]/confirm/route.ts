import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { calculatePlatformFee } from '@/lib/stripe/connect';
import { getInvoiceWithValidation, getTenantRecord } from '../../shared';

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
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      stripeAccount: connectAccountId,
    });

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
