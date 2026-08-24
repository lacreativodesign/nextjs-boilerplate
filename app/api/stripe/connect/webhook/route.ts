import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { writeAuditLog } from '@/lib/tenant/audit';
import {
  claimWebhookEvent,
  finalizeWebhookEvent,
  releaseWebhookEvent,
} from '@/lib/stripe/webhook-idempotency';
import { getStripeClient } from '@/lib/payments/stripe';
import { buildFinanceLedgerEntry } from '@/lib/finance/ledger';
import { assertConnectInvoicePaymentIntent } from '@/lib/payments/connect-invoice-integrity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getConnectWebhookSecret(): string {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_CONNECT_WEBHOOK_SECRET is not configured.');
  }
  return secret;
}

async function findTenantByAccountId(accountId: string) {
  const query = await adminDb
    .collection('tenants')
    .where('stripeConnectAccountId', '==', accountId)
    .limit(1)
    .get();

  if (query.empty) {
    return null;
  }

  return query.docs[0];
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    console.error('[STRIPE_CONNECT] Missing webhook signature.');
    return NextResponse.json({ ok: false, error: 'missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, getConnectWebhookSecret());
  } catch (error) {
    console.error('[STRIPE_CONNECT] Webhook signature verification failed', error);
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 400 });
  }

  const claim = await claimWebhookEvent(event.id, event.type);
  if (claim === 'duplicate') {
    return NextResponse.json({ ok: true, received: true });
  }
  try {
    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      const accountId = account.id;
      const tenantDoc = await findTenantByAccountId(accountId);

      if (tenantDoc) {
        const now = new Date().toISOString();
        await tenantDoc.ref.set(
          {
            stripeConnectChargesEnabled: Boolean(account.charges_enabled),
            stripeConnectPayoutsEnabled: Boolean(account.payouts_enabled),
            stripeConnectStatus: account.charges_enabled ? 'active' : 'restricted',
            updatedAt: now,
          },
          { merge: true },
        );
      }
    } else if (event.type === 'account.application.deauthorized') {
      const data = event.data.object as { id?: string; account?: string; stripe_user_id?: string };
      const accountId = data.account || data.stripe_user_id || data.id;

      if (accountId) {
        const tenantDoc = await findTenantByAccountId(accountId);
        if (tenantDoc) {
          const now = new Date().toISOString();
          await tenantDoc.ref.set(
            {
              stripeConnectStatus: 'disconnected',
              stripeConnectAccountId: null,
              stripeConnectEmail: null,
              stripeConnectBusinessName: null,
              stripeConnectConnectedAt: null,
              stripeConnectChargesEnabled: false,
              stripeConnectPayoutsEnabled: false,
              updatedAt: now,
            },
            { merge: true },
          );

          await writeAuditLog({
            tenantId: tenantDoc.id,
            actorUserId: 'system',
            actionType: 'stripe_connect_deauthorized',
            entityType: 'stripe_connect',
            entityId: accountId,
            metadata: { accountId },
          });
        }
      }
    } else if (event.type === 'payment_intent.succeeded') {
      // Backstop: reconcile a client invoice payment if the synchronous pay/confirm
      // path failed to record it (e.g. the customer's browser closed mid-redirect).
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = String(pi.metadata?.invoiceId || '').trim();
      const metadataTenantId = String(pi.metadata?.tenantId || '').trim();
      const connectedAccountId = String(event.account || '').trim();

      if (pi.metadata?.source === 'client_payment_page' && invoiceId && metadataTenantId) {
        // A Connect PaymentIntent is authoritative only for the connected account
        // that emitted the event. Metadata is caller-controlled context and must
        // never select the tenant by itself.
        if (!connectedAccountId) {
          throw new Error('Connect payment event is missing its account binding.');
        }
        const tenantDoc = await findTenantByAccountId(connectedAccountId);
        if (!tenantDoc || tenantDoc.id !== metadataTenantId) {
          throw new Error('Connect account does not match payment tenant metadata.');
        }
        const tenantId = tenantDoc.id;
        const invoiceRef = adminDb.collection('invoices').doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();
        const invoice = (invoiceSnap.data() || {}) as Record<string, unknown>;
        if (!invoiceSnap.exists || String(invoice.tenantId || '').trim() !== tenantId) {
          throw new Error('Invoice does not belong to the connected account tenant.');
        }

        const metadataClientId = String(pi.metadata?.clientId || '').trim();
        const invoiceClientId = String(invoice.clientId || '').trim();
        if (metadataClientId && invoiceClientId && metadataClientId !== invoiceClientId) {
          throw new Error('Payment client metadata does not match the invoice.');
        }

        const expectedAmount = Number(
          invoice.balanceDue ??
            invoice.amount ??
            invoice.totalAmount ??
            invoice.amountTotal ??
            invoice.amountTotalUsd ??
            0,
        );
        const expectedAmountCents = Math.round(expectedAmount * 100);
        if (!Number.isFinite(expectedAmountCents) || expectedAmountCents <= 0) {
          throw new Error('Payment amount does not match the invoice balance.');
        }
        assertConnectInvoicePaymentIntent(pi, {
          invoiceId,
          tenantId,
          clientId: invoiceClientId || undefined,
          orderId: String(invoice.orderId || invoiceId),
          amountCents: expectedAmountCents,
          currency: String(invoice.currency || 'USD'),
        });
        const alreadyPaid =
          String((invoiceSnap.data() as { status?: string }).status || '').toLowerCase() === 'paid';

        if (!alreadyPaid) {
          const nowIso = new Date().toISOString();
          const amountUsd = (pi.amount_received ?? pi.amount ?? 0) / 100;
          const platformFeeUsd = (pi.application_fee_amount ?? 0) / 100;
          const currentTotalPaid = Number(invoice.totalPaid ?? invoice.paidAmount ?? 0);
          const totalPaid = Math.max(0, currentTotalPaid) + amountUsd;
          // Deterministic id = PaymentIntent id, identical shape to the pay/confirm
          // routes, so this backstop converges on a single record without duplicates.
          const paymentRef = adminDb.collection('payments').doc(pi.id);

          const batch = adminDb.batch();
          batch.update(invoiceRef, {
            status: 'paid',
            paidAt: nowIso,
            paidAmount: totalPaid,
            totalPaid,
            balanceDue: 0,
            paymentMethod: 'stripe',
            stripePaymentIntentId: pi.id,
            updatedAt: nowIso,
          });
          batch.set(paymentRef, {
            tenantId,
            clientId: String(pi.metadata?.clientId || '') || null,
            invoiceId,
            orderId: String(pi.metadata?.orderId || ''),
            amountUsd,
            platformFeeUsd,
            currency: (pi.currency || 'usd').toUpperCase(),
            status: 'succeeded',
            method: 'stripe_checkout',
            stripePaymentIntentId: pi.id,
            paidAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
            isDeleted: false,
          });
          // Same deterministic ledger ids as the pay/confirm routes so this
          // backstop converges on exactly one payment.succeeded and one
          // invoice.mark_paid entry per PaymentIntent — no duplicates on replay,
          // and no payment can be recorded without its ledger trail.
          const previousStatus = String(invoice.status || '');
          batch.set(
            adminDb.collection('finance_ledger').doc(`payment_succeeded_${pi.id}`),
            buildFinanceLedgerEntry({
              tenantId,
              type: 'payment.succeeded',
              paymentId: pi.id,
              invoiceId,
              orderId: String(pi.metadata?.orderId || ''),
              clientId: String(pi.metadata?.clientId || ''),
              amountUsd,
              previousStatus,
              newStatus: 'succeeded',
              method: 'stripe_checkout',
              actor: { uid: 'system', name: 'Client payment (Stripe webhook backstop)' },
            }),
          );
          batch.set(
            adminDb.collection('finance_ledger').doc(`invoice_paid_${pi.id}`),
            buildFinanceLedgerEntry({
              tenantId,
              type: 'invoice.mark_paid',
              invoiceId,
              orderId: String(pi.metadata?.orderId || ''),
              clientId: String(pi.metadata?.clientId || ''),
              amountUsd,
              previousStatus,
              newStatus: 'paid',
              method: 'stripe',
              reason: 'Paid online via client payment page',
              actor: { uid: 'system', name: 'Client payment (Stripe webhook backstop)' },
            }),
          );
          await batch.commit();
        }
      }
    }

    await finalizeWebhookEvent(event.id, event.type);
    return NextResponse.json({ ok: true, received: true });
  } catch (error) {
    console.error('[STRIPE_CONNECT] Webhook handling failed', error);
    // Release the claim so the next Stripe retry can re-process; return non-2xx.
    await releaseWebhookEvent(event.id);
    return NextResponse.json({ ok: false, error: 'handler failed' }, { status: 500 });
  }
}
