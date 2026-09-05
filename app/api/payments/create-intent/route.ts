import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireClient } from '../../client/_utils';
import {
  createInvoiceCheckoutSession,
  getStripeClient,
  resolveAppOrigin,
} from '@/lib/payments/stripe';
import { normalizeInvoiceStatus } from '@/lib/finance/status';
import { resolveInvoicePaymentSchedule } from '@/lib/finance/paymentSchedule';
import { calculatePlatformFee } from '@/lib/stripe/connect';
import { amountToMinorUnits } from '@/lib/finance/minorUnits';

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
    const tenantId = String(auth.tenantId || '').trim();
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

    const schedule = resolveInvoicePaymentSchedule(invoice);
    const amountUsd = schedule.payableNow;
    if (amountUsd <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Invoice has no outstanding balance.' },
        { status: 400 },
      );
    }

    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Workspace not found.' }, { status: 404 });
    }
    const tenant = tenantSnap.data() || {};
    const stripeConnectAccountId = String(tenant.stripeConnectAccountId || '').trim();
    if (!stripeConnectAccountId || tenant.stripeConnectChargesEnabled !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Online invoice payments are not enabled for this workspace.',
          code: 'stripe_connect_required',
        },
        { status: 409 },
      );
    }

    const currency = String(invoice.currency || 'USD')
      .trim()
      .toUpperCase();
    const amountMinor = amountToMinorUnits(amountUsd, currency);
    const platformFeeCents = calculatePlatformFee(amountMinor);
    const origin = resolveAppOrigin(req);
    const stripe = getStripeClient();
    const successUrl = `${origin}/client/billing/payment-success?invoiceId=${encodeURIComponent(invoiceId)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/client/billing/payment-failure?invoiceId=${encodeURIComponent(invoiceId)}`;

    const session = await createInvoiceCheckoutSession({
      stripe,
      amountUsd,
      currency,
      orderId: String(invoice.orderId || invoiceId),
      tenantId,
      invoiceId,
      clientId: auth.clientId,
      customerEmail: String(auth.user.email || '').trim() || undefined,
      successUrl,
      cancelUrl,
      stripeAccount: stripeConnectAccountId,
      platformFeeCents,
      installmentSequence: schedule.installmentSequence,
    });

    if (!session.url) {
      return NextResponse.json(
        { ok: false, error: 'Unable to initialize Stripe checkout.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
      amountDue: amountUsd,
      currency,
      installmentSequence: schedule.installmentSequence,
    });
  } catch (err: any) {
    console.error('payments/create-intent error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unable to create payment intent.' },
      { status: 500 },
    );
  }
}
