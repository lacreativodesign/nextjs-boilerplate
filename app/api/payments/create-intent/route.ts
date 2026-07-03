import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireClient } from '../../client/_utils';
import {
  createInvoiceCheckoutSession,
  getStripeClient,
  resolveAppOrigin,
} from '@/lib/payments/stripe';
import { normalizeInvoiceStatus } from '@/lib/finance/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoiceId || '').trim();
    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: 'Invoice is required.' }, { status: 400 });
    }

    const invoiceSnap = await adminDb.collection('invoices').doc(invoiceId).get();
    if (!invoiceSnap.exists || invoiceSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Invoice not found.' }, { status: 404 });
    }

    const invoice = invoiceSnap.data() || {};
    const tenantId = String(auth.tenantId || '');
    if (
      String(invoice.tenantId || '') !== tenantId ||
      String(invoice.clientId || '') !== auth.clientId
    ) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const status = normalizeInvoiceStatus(invoice.status);
    if (status === 'paid' || status === 'void') {
      return NextResponse.json({ ok: false, error: 'Invoice is not payable.' }, { status: 400 });
    }

    const amountUsd = Math.max(0, Number(invoice.balanceDue ?? invoice.amountTotalUsd ?? 0));
    if (amountUsd <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Invoice has no outstanding balance.' },
        { status: 400 },
      );
    }

    const origin = resolveAppOrigin(req);
    const stripe = getStripeClient();
    const successUrl = `${origin}/client/billing/payment-success?invoiceId=${encodeURIComponent(invoiceId)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/client/billing/payment-failure?invoiceId=${encodeURIComponent(invoiceId)}`;

    const session = await createInvoiceCheckoutSession({
      stripe,
      amountUsd,
      orderId: String(invoice.orderId || invoiceId),
      tenantId,
      invoiceId,
      clientId: auth.clientId,
      customerEmail: String(auth.user.email || '').trim() || undefined,
      successUrl,
      cancelUrl,
    });

    const paymentIntentId = String(session.payment_intent || '');
    if (!paymentIntentId || !session.url) {
      return NextResponse.json(
        { ok: false, error: 'Unable to initialize Stripe checkout.' },
        { status: 500 },
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const paymentId = `stripe_pi_${paymentIntentId}`;

    const batch = adminDb.batch();

    batch.set(
      adminDb.collection('payments').doc(paymentId),
      {
        id: paymentId,
        tenantId,
        clientId: auth.clientId,
        invoiceId,
        orderId: String(invoice.orderId || ''),
        amountUsd,
        currency: 'USD',
        status: 'pending',
        method: 'stripe_checkout',
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: session.id,
        stripeCustomerId: session.customer ? String(session.customer) : null,
        receiptUrl: null,
        refundedAmountUsd: 0,
        createdByUid: auth.user.uid,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    batch.set(
      adminDb.collection('payment_intents').doc(`pi_${paymentIntentId}`),
      {
        id: `pi_${paymentIntentId}`,
        tenantId,
        clientId: auth.clientId,
        invoiceId,
        paymentId,
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: session.id,
        amountUsd,
        currency: 'USD',
        status: 'requires_payment_method',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    await batch.commit();

    return NextResponse.json({
      ok: true,
      paymentId,
      checkoutUrl: session.url,
      stripePaymentIntentId: paymentIntentId,
    });
  } catch (err: any) {
    console.error('payments/create-intent error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unable to create payment intent.' },
      { status: 500 },
    );
  }
}
