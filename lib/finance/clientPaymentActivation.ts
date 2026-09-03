import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { logEvent } from '@/lib/audit';
import { queueEmailEvent } from '@/lib/emailEvents';
import { queueClientActivationInvite } from '@/lib/clientActivation';
import { createNotification, getUserIdsByRoles } from '@/lib/notifications';
import { buildFinanceLedgerEntry } from '@/lib/finance/ledger';
import { computeBalanceDue, computeInvoiceStatus, normalizeInvoiceStatus } from '@/lib/finance/status';
import { maybeAutoCreateProjectFromInvoice } from '@/lib/finance/invoiceActions';
import { resolveAmountTotal, resolveTotalPaid } from '@/lib/finance/paymentSchedule';

type PaymentActor = { uid: string; name?: string };

type SuccessfulClientPaymentInput = {
  invoiceId: string;
  tenantId: string;
  paymentId: string;
  amount: number;
  currency: string;
  method: string;
  source: string;
  actor: PaymentActor;
  platformFee?: number;
  stripePaymentIntentId?: string | null;
};

type PaymentMutationResult = {
  newlyRecorded: boolean;
  invoiceId: string;
  tenantId: string;
  clientId: string;
  dealId: string;
  orderId: string;
  previousStatus: string;
  status: string;
  amountTotal: number;
  amountPaid: number;
  totalPaid: number;
  balanceDue: number;
};

function money(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

/**
 * Canonical client-payment mutation.
 *
 * Every successful client payment source (Stripe synchronous confirmation, Stripe webhook
 * backstop, and future payment providers) must come through this service. The payment,
 * invoice balance and append-only finance ledger land atomically. Operational side effects
 * are reconciled afterwards and are independently idempotent.
 */
export async function recordSuccessfulClientPayment(
  input: SuccessfulClientPaymentInput,
): Promise<PaymentMutationResult & { projectId: string | null }> {
  const invoiceId = String(input.invoiceId || '').trim();
  const tenantId = String(input.tenantId || '').trim();
  const paymentId = String(input.paymentId || '').trim();
  const currency = String(input.currency || '').trim().toUpperCase();
  const amount = money(Number(input.amount || 0));

  if (!invoiceId || !tenantId || !paymentId) {
    throw new Error('Payment reconciliation requires invoiceId, tenantId and paymentId.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const result = await adminDb.runTransaction<PaymentMutationResult>(async (tx) => {
    const invoiceRef = adminDb.collection('invoices').doc(invoiceId);
    const paymentRef = adminDb.collection('payments').doc(paymentId);
    const [invoiceSnap, paymentSnap] = await Promise.all([tx.get(invoiceRef), tx.get(paymentRef)]);

    if (!invoiceSnap.exists) {
      throw new Error('Invoice not found.');
    }

    const invoice = (invoiceSnap.data() || {}) as Record<string, unknown>;
    const invoiceTenantId = String(invoice.tenantId || '').trim();
    if (!invoiceTenantId || invoiceTenantId !== tenantId) {
      throw new Error('Invoice tenant mismatch.');
    }

    const invoiceCurrency = String(invoice.currency || 'USD').trim().toUpperCase();
    if (currency && invoiceCurrency !== currency) {
      throw new Error('Payment currency does not match invoice currency.');
    }

    const amountTotal = resolveAmountTotal(invoice);
    const currentPaid = Math.min(amountTotal, resolveTotalPaid(invoice));
    const currentStatus = normalizeInvoiceStatus(invoice.status);
    const currentBalance = computeBalanceDue(amountTotal, currentPaid);
    const clientId = String(invoice.clientId || '');
    const dealId = String(invoice.dealId || '');
    const orderId = String(invoice.orderId || invoiceId);

    if (paymentSnap.exists) {
      const existing = paymentSnap.data() || {};
      if (
        String(existing.invoiceId || '') !== invoiceId ||
        String(existing.tenantId || '') !== tenantId
      ) {
        throw new Error('Payment id is already bound to another invoice.');
      }

      return {
        newlyRecorded: false,
        invoiceId,
        tenantId,
        clientId,
        dealId,
        orderId,
        previousStatus: currentStatus,
        status: currentStatus,
        amountTotal,
        amountPaid: Number(existing.amountUsd || amount),
        totalPaid: currentPaid,
        balanceDue: currentBalance,
      };
    }

    if (currentStatus === 'void') {
      throw new Error('Void invoices cannot accept payments.');
    }
    if (currentStatus === 'paid' || currentBalance <= 0) {
      throw new Error('Invoice is already paid.');
    }
    if (amount - currentBalance > 0.01) {
      throw new Error('Payment amount exceeds the outstanding invoice balance.');
    }

    const nextPaid = money(Math.min(amountTotal, currentPaid + amount));
    const nextBalance = computeBalanceDue(amountTotal, nextPaid);
    const nextStatus = computeInvoiceStatus({
      currentStatus: invoice.status,
      totalPaid: nextPaid,
      totalAmount: amountTotal,
    });
    const nowIso = new Date().toISOString();

    tx.set(
      paymentRef,
      {
        tenantId,
        clientId: clientId || null,
        invoiceId,
        dealId: dealId || null,
        orderId,
        amountUsd: amount,
        platformFeeUsd: money(Number(input.platformFee || 0)),
        currency: invoiceCurrency,
        status: 'succeeded',
        method: input.method,
        source: input.source,
        stripePaymentIntentId: input.stripePaymentIntentId || null,
        paidAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        isDeleted: false,
      },
      { merge: false },
    );

    tx.update(invoiceRef, {
      status: nextStatus,
      totalPaid: nextPaid,
      paidAmount: nextPaid,
      balanceDue: nextBalance,
      firstPaymentAt: currentPaid <= 0 ? nowIso : invoice.firstPaymentAt || null,
      paidAt: nextStatus === 'paid' ? nowIso : invoice.paidAt || null,
      paymentMethod: input.method,
      stripePaymentIntentId: input.stripePaymentIntentId || invoice.stripePaymentIntentId || null,
      paymentIds: admin.firestore.FieldValue.arrayUnion(paymentId),
      updatedAt: nowIso,
    });

    tx.set(
      adminDb.collection('finance_ledger').doc(`payment_succeeded_${paymentId}`),
      buildFinanceLedgerEntry({
        tenantId,
        type: 'payment.succeeded',
        paymentId,
        invoiceId,
        orderId,
        clientId,
        amountUsd: amount,
        previousStatus: currentStatus,
        newStatus: 'succeeded',
        method: input.method,
        actor: input.actor,
      }),
    );
    tx.set(
      adminDb.collection('finance_ledger').doc(`invoice_payment_${paymentId}`),
      buildFinanceLedgerEntry({
        tenantId,
        type: 'invoice.payment_applied',
        paymentId,
        invoiceId,
        orderId,
        clientId,
        amountUsd: amount,
        previousStatus: currentStatus,
        newStatus: nextStatus,
        method: input.method,
        reason: 'Successful client payment applied to invoice balance.',
        actor: input.actor,
      }),
    );

    return {
      newlyRecorded: true,
      invoiceId,
      tenantId,
      clientId,
      dealId,
      orderId,
      previousStatus: currentStatus,
      status: nextStatus,
      amountTotal,
      amountPaid: amount,
      totalPaid: nextPaid,
      balanceDue: nextBalance,
    };
  });

  const currentInvoiceSnap = await adminDb.collection('invoices').doc(invoiceId).get();
  const currentInvoice = (currentInvoiceSnap.data() || {}) as Record<string, unknown>;

  // Any successful first payment (100% or 50% deposit) activates production. The helper
  // is idempotent by invoice projectId + deal/order lookup, so retries cannot duplicate a
  // project and a later balance payment stays on the same project.
  const project = await maybeAutoCreateProjectFromInvoice({
    invoiceId,
    invoiceData: currentInvoice,
    tenantId,
    actor: input.actor,
  });
  const projectId = String(project?.id || currentInvoice.projectId || '') || null;

  if (result.dealId) {
    await adminDb.collection('deals').doc(result.dealId).set(
      {
        projectId,
        projectCreated: Boolean(projectId),
        paymentStatus: result.status,
        engagementStatus: result.totalPaid > 0 ? 'active' : 'awaiting_payment',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (result.clientId) {
    const clientSnap = await adminDb.collection('clients').doc(result.clientId).get();
    if (clientSnap.exists) {
      const clientData = clientSnap.data() || {};
      await queueClientActivationInvite({
        clientId: result.clientId,
        clientData,
        tenantId,
        createdByUid: input.actor.uid,
        reason: 'first_successful_client_payment',
      }).catch((error) => {
        console.error('client payment portal activation error:', error);
      });

      if (result.newlyRecorded) {
        const email = String(clientData.primaryContactEmail || '').trim();
        if (email) {
          await queueEmailEvent({
            templateId: 'payment_confirmation',
            to: email,
            data: {
              clientName: String(clientData.companyName || clientData.primaryContactName || ''),
              invoiceId,
              orderId: result.orderId,
              amountPaidUsd: result.amountPaid,
              totalPaidUsd: result.totalPaid,
              balanceDueUsd: result.balanceDue,
              paymentStatus: result.status,
              projectId,
            },
            metadata: { tenantId, clientId: result.clientId, invoiceId, projectId },
          }).catch((error) => {
            console.error('payment confirmation email error:', error);
          });
        }
      }
    }
  }

  if (result.newlyRecorded) {
    const financeIds = await getUserIdsByRoles(['finance', 'admin', 'super_admin'], tenantId);
    await Promise.all(
      financeIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: result.status === 'paid' ? 'Invoice paid' : 'Partial payment received',
          body: `${result.orderId}: ${result.amountPaid.toFixed(2)} received; ${result.balanceDue.toFixed(2)} remaining.`,
          type: 'success',
          entityType: 'invoice',
          entityId: invoiceId,
          deepLink: '/finance/invoices',
          createdBy: input.actor,
          tenantId,
          roleTarget: 'finance',
        }),
      ),
    );

    await logEvent({
      tenantId,
      type: 'finance.client_payment_succeeded',
      title: result.status === 'paid' ? 'Client invoice paid' : 'Client deposit received',
      description: `${result.orderId} received ${result.amountPaid.toFixed(2)}; ${result.balanceDue.toFixed(2)} remains.`,
      entityType: 'invoice',
      entityId: invoiceId,
      actor: input.actor,
      metadata: {
        paymentId,
        projectId,
        previousStatus: result.previousStatus,
        newStatus: result.status,
        amountPaid: result.amountPaid,
        totalPaid: result.totalPaid,
        balanceDue: result.balanceDue,
      },
    });
  }

  return { ...result, projectId };
}
