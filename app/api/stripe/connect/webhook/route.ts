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
import { recordSuccessfulClientPayment } from '@/lib/finance/clientPaymentActivation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENT_PAYMENT_SOURCES = new Set(['client_payment_page', 'client_portal']);

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

function eventAccountId(event: Stripe.Event): string {
  return typeof event.account === 'string' ? event.account.trim() : '';
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
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = String(pi.metadata?.invoiceId || '').trim();
      const tenantId = String(pi.metadata?.tenantId || '').trim();
      const source = String(pi.metadata?.source || '').trim();
      const accountId = eventAccountId(event);

      if (CLIENT_PAYMENT_SOURCES.has(source) && invoiceId && tenantId) {
        // A signed Stripe payload is not enough to choose a tenant. Bind the event's actual
        // connected account to the server-owned tenant record and require metadata to agree.
        if (!accountId) {
          throw new Error('Connect payment event is missing its account id.');
        }
        const tenantDoc = await findTenantByAccountId(accountId);
        if (!tenantDoc || tenantDoc.id !== tenantId) {
          throw new Error('Connect payment tenant/account mismatch.');
        }

        const amountReceivedCents = pi.amount_received ?? pi.amount ?? 0;
        const expectedAmountCents = Number(pi.metadata?.expectedAmountCents || 0);
        if (
          expectedAmountCents > 0 &&
          (!Number.isInteger(expectedAmountCents) || expectedAmountCents !== amountReceivedCents)
        ) {
          throw new Error('Connect payment amount does not match the server-issued amount.');
        }

        await recordSuccessfulClientPayment({
          invoiceId,
          tenantId,
          paymentId: pi.id,
          amount: amountReceivedCents / 100,
          platformFee: (pi.application_fee_amount ?? 0) / 100,
          currency: pi.currency || 'usd',
          method: 'stripe_checkout',
          source: `stripe_connect_webhook:${source}`,
          reason: 'Stripe Connect confirmed a successful client invoice payment.',
          stripePaymentIntentId: pi.id,
          actor: { uid: 'system', name: 'Client payment (Stripe webhook)' },
        });
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
