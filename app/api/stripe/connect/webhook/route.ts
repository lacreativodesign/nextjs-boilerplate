import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';

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
    return NextResponse.json({ ok: false, received: true });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, getConnectWebhookSecret());
  } catch (error) {
    console.error('[STRIPE_CONNECT] Webhook signature verification failed', error);
    return NextResponse.json({ ok: false, received: true });
  }

  const processedRef = adminDb.collection('processed_webhook_events').doc(event.id);
  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
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

          await adminDb.collection('audit_logs').add({
            tenantId: tenantDoc.id,
            action: 'stripe_connect_deauthorized',
            performedBy: 'system',
            details: { accountId },
            timestamp: now,
          });
        }
      }
    } else if (event.type === 'payment_intent.succeeded') {
      // Backstop: reconcile a client invoice payment if the synchronous pay/confirm
      // path failed to record it (e.g. the customer's browser closed mid-redirect).
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = String(pi.metadata?.invoiceId || '').trim();
      const tenantId = String(pi.metadata?.tenantId || '').trim();

      if (pi.metadata?.source === 'client_payment_page' && invoiceId && tenantId) {
        const invoiceRef = adminDb.collection('invoices').doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();
        const alreadyPaid =
          invoiceSnap.exists &&
          String((invoiceSnap.data() as { status?: string }).status || '').toLowerCase() === 'paid';

        if (invoiceSnap.exists && !alreadyPaid) {
          const nowIso = new Date().toISOString();
          const amountUsd = (pi.amount_received ?? pi.amount ?? 0) / 100;
          const platformFeeUsd = (pi.application_fee_amount ?? 0) / 100;
          // Deterministic id = PaymentIntent id, identical shape to the pay/confirm
          // routes, so this backstop converges on a single record without duplicates.
          const paymentRef = adminDb.collection('payments').doc(pi.id);

          const batch = adminDb.batch();
          batch.update(invoiceRef, {
            status: 'paid',
            paidAt: nowIso,
            paidAmount: amountUsd,
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
          await batch.commit();
        }
      }
    }

    await processedRef.set({
      eventId: event.id,
      type: event.type,
      processedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, received: true });
  } catch (error) {
    console.error('[STRIPE_CONNECT] Webhook handling failed', error);
    // Do NOT mark processed; return non-2xx so Stripe retries this backstop.
    return NextResponse.json({ ok: false, error: 'handler failed' }, { status: 500 });
  }
}
