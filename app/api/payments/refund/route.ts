import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance } from '../../finance/_utils';
import { assertPermission, Permission } from '../../../lib/permissions';
import { createStripeRefund, getStripeClient } from '@/lib/payments/stripe';
import { buildFinanceLedgerEntry } from '@/lib/finance/ledger';
import { createNotifications, getUsersByRoles } from '@/lib/notifications';
import { minorUnitsToAmount } from '@/lib/finance/minorUnits';
import { computeBalanceDue, normalizeInvoiceStatus } from '@/lib/finance/status';
import { resolveAmountTotal, resolveTotalPaid } from '@/lib/finance/paymentSchedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toReason(
  input: unknown,
): 'duplicate' | 'fraudulent' | 'requested_by_customer' | undefined {
  const value = String(input || '')
    .trim()
    .toLowerCase();
  if (value === 'duplicate' || value === 'fraudulent' || value === 'requested_by_customer')
    return value;
  return undefined;
}

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    assertPermission(auth.user.role, Permission.MarkPaymentPaid);

    const body = await req.json().catch(() => ({}));
    const paymentId = String(body?.paymentId || '').trim();
    const amountUsd = body?.amountUsd == null ? undefined : Number(body.amountUsd);
    const reason = toReason(body?.reason);

    if (!paymentId) {
      return NextResponse.json({ ok: false, error: 'Payment is required.' }, { status: 400 });
    }

    const paymentRef = adminDb.collection('payments').doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists || paymentSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Payment not found.' }, { status: 404 });
    }

    const payment = paymentSnap.data() || {};
    if (String(payment.tenantId || '') !== String(auth.user.tenantId || '')) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const stripePaymentIntentId = String(payment.stripePaymentIntentId || '');
    if (!stripePaymentIntentId) {
      return NextResponse.json(
        { ok: false, error: 'Payment is not refundable through Stripe.' },
        { status: 400 },
      );
    }

    const maxAmount = Number(payment.amountUsd || 0) - Number(payment.refundedAmountUsd || 0);
    if (typeof amountUsd === 'number' && (amountUsd <= 0 || amountUsd > maxAmount)) {
      return NextResponse.json({ ok: false, error: 'Invalid refund amount.' }, { status: 400 });
    }

    const isPlatformCharge = Boolean(String(payment.stripeCheckoutSessionId || '').trim());
    let stripeAccount: string | undefined;
    let refundApplicationFee = false;
    if (!isPlatformCharge) {
      const tenantSnap = await adminDb
        .collection('tenants')
        .doc(String(payment.tenantId || ''))
        .get();
      stripeAccount = String(tenantSnap.data()?.stripeConnectAccountId || '').trim() || undefined;
      if (!stripeAccount) {
        return NextResponse.json(
          { ok: false, error: 'Connected account not found for this payment; cannot refund.' },
          { status: 400 },
        );
      }
      refundApplicationFee = true;
    }

    const paymentCurrency = String(payment.currency || 'USD')
      .trim()
      .toUpperCase();
    const stripe = getStripeClient();
    const refund = await createStripeRefund({
      stripe,
      paymentIntentId: stripePaymentIntentId,
      amountUsd,
      currency: paymentCurrency,
      reason,
      stripeAccount,
      refundApplicationFee,
    });
    const refundCurrency = String(refund.currency || paymentCurrency).toUpperCase();
    const refundAmountUsd = minorUnitsToAmount(Number(refund.amount || 0), refundCurrency);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await adminDb.runTransaction(async (tx) => {
      const freshPayment = await tx.get(paymentRef);
      if (!freshPayment.exists) throw new Error('Payment disappeared during refund reconciliation.');
      const current = freshPayment.data() || {};
      const invoiceId = String(current.invoiceId || '').trim();
      const invoiceRef = invoiceId ? adminDb.collection('invoices').doc(invoiceId) : null;
      const invoiceSnap = invoiceRef ? await tx.get(invoiceRef) : null;

      if (!invoiceRef || !invoiceSnap?.exists) {
        throw new Error('Refunded client payment is missing its invoice.');
      }
      const invoice = invoiceSnap.data() || {};
      if (String(invoice.tenantId || '') !== String(current.tenantId || '')) {
        throw new Error('Refund invoice tenant mismatch.');
      }

      const nextRefunded = Number(current.refundedAmountUsd || 0) + refundAmountUsd;
      const paymentAmount = Number(current.amountUsd || 0);
      const paymentStatus = nextRefunded >= paymentAmount ? 'refunded' : 'succeeded';

      const invoiceTotal = resolveAmountTotal(invoice);
      const invoicePaid = resolveTotalPaid(invoice);
      const nextInvoicePaid = Math.max(0, invoicePaid - refundAmountUsd);
      const nextBalanceDue = computeBalanceDue(invoiceTotal, nextInvoicePaid);
      const previousInvoiceStatus = normalizeInvoiceStatus(invoice.status);
      const nextInvoiceStatus =
        previousInvoiceStatus === 'void'
          ? 'void'
          : nextInvoicePaid >= invoiceTotal
            ? 'paid'
            : nextInvoicePaid > 0
              ? 'partially_paid'
              : 'issued';

      tx.set(
        paymentRef,
        {
          status: paymentStatus,
          refundedAmountUsd: nextRefunded,
          updatedAt: now,
        },
        { merge: true },
      );

      tx.set(
        invoiceRef,
        {
          status: nextInvoiceStatus,
          totalPaid: nextInvoicePaid,
          paidAmount: nextInvoicePaid,
          balanceDue: nextBalanceDue,
          paidAt: nextInvoiceStatus === 'paid' ? invoice.paidAt || now : null,
          updatedAt: now,
        },
        { merge: true },
      );

      tx.set(
        adminDb.collection('payment_refunds').doc(`refund_${refund.id}`),
        {
          id: `refund_${refund.id}`,
          tenantId: String(current.tenantId || ''),
          clientId: String(current.clientId || ''),
          invoiceId,
          paymentId,
          stripeRefundId: refund.id,
          stripePaymentIntentId,
          amountUsd: refundAmountUsd,
          currency: refundCurrency,
          status: String(refund.status || 'pending'),
          reason: reason || 'other',
          createdByUid: auth.user.uid,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      tx.set(
        adminDb.collection('finance_ledger').doc(`refund_created_${refund.id}`),
        buildFinanceLedgerEntry({
          tenantId: String(current.tenantId || ''),
          type: 'refund.created',
          paymentId,
          invoiceId,
          clientId: String(current.clientId || ''),
          amountUsd: -refundAmountUsd,
          reason: reason || 'other',
          actor: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || '' },
        }),
      );
      tx.set(
        adminDb.collection('finance_ledger').doc(`payment_refunded_${refund.id}`),
        buildFinanceLedgerEntry({
          tenantId: String(current.tenantId || ''),
          type: 'payment.refunded',
          paymentId,
          invoiceId,
          clientId: String(current.clientId || ''),
          amountUsd: -refundAmountUsd,
          previousStatus: String(current.status || ''),
          newStatus: paymentStatus,
          reason: reason || 'other',
          actor: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || '' },
        }),
      );
      tx.set(
        adminDb.collection('finance_ledger').doc(`invoice_refund_${refund.id}`),
        buildFinanceLedgerEntry({
          tenantId: String(current.tenantId || ''),
          type: 'invoice.refund_applied',
          paymentId,
          invoiceId,
          clientId: String(current.clientId || ''),
          amountUsd: -refundAmountUsd,
          previousStatus: previousInvoiceStatus,
          newStatus: nextInvoiceStatus,
          reason: reason || 'Stripe refund reversed invoice paid aggregate.',
          actor: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || '' },
        }),
      );
    });

    const refundNotifyTargets = await getUsersByRoles(
      ['admin', 'super_admin', 'finance'],
      auth.user.tenantId,
    );
    await createNotifications({
      recipients: refundNotifyTargets,
      tenantId: auth.user.tenantId,
      type: 'info',
      title: 'Refund issued',
      message: `A refund of ${refundCurrency} ${refundAmountUsd} was issued.`,
      entityType: 'payment',
      entityId: paymentId,
      deepLink: '/finance/payments',
    });

    return NextResponse.json({ ok: true, refundId: refund.id });
  } catch (err: any) {
    console.error('payments/refund error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unable to process refund.' },
      { status: 500 },
    );
  }
}
