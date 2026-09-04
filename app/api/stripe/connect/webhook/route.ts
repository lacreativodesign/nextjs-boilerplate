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
import { recordUnappliedClientPayment } from '@/lib/finance/unappliedClientPayment';
import { resolveInvoicePaymentSchedule } from '@/lib/finance/paymentSchedule';
import { amountToMinorUnits, minorUnitsToAmount } from '@/lib/finance/minorUnits';

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

  if (query.empty) return null;
  return query.docs[0];
}

function eventAccountId(event: Stripe.Event): string {
  return typeof event.account === 'string' ? event.account.trim() : '';
}

function isPermanentPaymentReconciliationError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    'missing its account id',
    'tenant/account mismatch',
    'server-issued amount',
    'expected amount metadata',
    'expected currency metadata',
    'currency does not match',
    'invoice not found',
    'invoice tenant mismatch',
    'installment sequence',
    'payment id is already bound',
    'existing payment currency',
    'existing payment amount',
    'refunded payments',
    'void invoices',
    'invoice is already paid',
    'exceeds the outstanding invoice balance',
  ].some((fragment) => message.includes(fragment));
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
      const metadataTenantId = String(pi.metadata?.tenantId || '').trim();
      const source = String(pi.metadata?.source || '').trim();
      const accountId = eventAccountId(event);

      if (CLIENT_PAYMENT_SOURCES.has(source) && invoiceId && metadataTenantId) {
        let evidenceTenantId = metadataTenantId;
        const amountReceivedMinor = pi.amount_received ?? pi.amount ?? 0;
        const currency = String(pi.currency || '').trim().toLowerCase();

        try {
          if (!accountId) {
            throw new Error('Connect payment event is missing its account id.');
          }

          const tenantDoc = await findTenantByAccountId(accountId);
          if (tenantDoc) evidenceTenantId = tenantDoc.id;
          if (!tenantDoc || tenantDoc.id !== metadataTenantId) {
            throw new Error('Connect payment tenant/account mismatch.');
          }

          const expectedAmountMinor = Number(pi.metadata?.expectedAmountCents || 0);
          if (!Number.isInteger(expectedAmountMinor) || expectedAmountMinor <= 0) {
            throw new Error('Connect payment expected amount metadata is invalid.');
          }
          if (expectedAmountMinor !== amountReceivedMinor) {
            throw new Error('Connect payment amount does not match the server-issued amount.');
          }

          const expectedCurrency = String(pi.metadata?.expectedCurrency || '')
            .trim()
            .toLowerCase();
          if (!expectedCurrency) {
            throw new Error('Connect payment expected currency metadata is missing.');
          }
          if (expectedCurrency !== currency) {
            throw new Error('Connect payment currency does not match server-issued currency.');
          }

          const invoiceSnap = await adminDb.collection('invoices').doc(invoiceId).get();
          if (!invoiceSnap.exists || invoiceSnap.data()?.isDeleted) {
            throw new Error('Invoice not found.');
          }
          const invoice = (invoiceSnap.data() || {}) as Record<string, unknown>;
          if (String(invoice.tenantId || '').trim() !== metadataTenantId) {
            throw new Error('Invoice tenant mismatch.');
          }

          const schedule = resolveInvoicePaymentSchedule(invoice);
          const installmentSequence = Number(pi.metadata?.installmentSequence || 0);
          if (
            !Number.isInteger(installmentSequence) ||
            installmentSequence <= 0 ||
            installmentSequence !== schedule.installmentSequence
          ) {
            throw new Error('Connect payment installment sequence is stale or invalid.');
          }

          const currentPayableMinor = amountToMinorUnits(schedule.payableNow, currency);
          if (currentPayableMinor !== amountReceivedMinor) {
            throw new Error('Connect payment amount does not match the current payable installment.');
          }

          await recordSuccessfulClientPayment({
            invoiceId,
            tenantId: metadataTenantId,
            paymentId: pi.id,
            amount: minorUnitsToAmount(amountReceivedMinor, currency),
            platformFee: minorUnitsToAmount(pi.application_fee_amount ?? 0, currency),
            currency,
            method: 'stripe_checkout',
            source: `stripe_connect_webhook:${source}`,
            reason: 'Stripe Connect confirmed a successful client invoice payment.',
            stripePaymentIntentId: pi.id,
            actor: { uid: 'system', name: 'Client payment (Stripe webhook)' },
          });
        } catch (error) {
          if (!isPermanentPaymentReconciliationError(error)) throw error;

          await recordUnappliedClientPayment({
            paymentId: pi.id,
            eventId: event.id,
            tenantId: evidenceTenantId,
            invoiceId,
            accountId,
            amount: minorUnitsToAmount(amountReceivedMinor, currency),
            currency,
            source: `stripe_connect_webhook:${source}`,
            error,
          });
          await finalizeWebhookEvent(event.id, event.type);
          return NextResponse.json({ ok: false, received: true, deadLettered: true });
        }
      }
    }

    await finalizeWebhookEvent(event.id, event.type);
    return NextResponse.json({ ok: true, received: true });
  } catch (error) {
    console.error('[STRIPE_CONNECT] Webhook handling failed', error);
    await releaseWebhookEvent(event.id);
    return NextResponse.json({ ok: false, error: 'handler failed' }, { status: 500 });
  }
}
