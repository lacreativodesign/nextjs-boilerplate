import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { sendPaymentConfirmationEmail } from '@/lib/email/onboarding-emails';

export const runtime = 'nodejs';

function mapStripeStatusToSubscriptionState(status: string) {
  switch (status) {
    case 'active':
      return 'active';
    case 'past_due':
      return 'grace';
    case 'unpaid':
      return 'soft_locked';
    case 'canceled':
      return 'hard_locked';
    case 'trialing':
      return 'active';
    default:
      return 'grace';
  }
}

async function resolveTenantIdFromInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<string> {
  const metadataTenantId = String(invoice.metadata?.tenantId || '').trim();
  if (metadataTenantId) {
    return metadataTenantId;
  }

  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id || '';
  if (!subscriptionId) {
    return '';
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return String(subscription.metadata?.tenantId || '').trim();
  } catch (error) {
    console.error('[STRIPE] Failed to resolve tenantId from invoice subscription', {
      subscriptionId,
      error,
    });
    return '';
  }
}

export async function POST(req: Request) {
  const stripe = getStripeClient();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ ok: false, error: 'Missing Stripe signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[STRIPE] STRIPE_SUBSCRIPTION_WEBHOOK_SECRET is missing');
    return NextResponse.json({ ok: true, received: true });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('[STRIPE] Subscription webhook signature verification failed', error);
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = String(subscription.metadata?.tenantId || '').trim();
        if (!tenantId) break;

        const updatedPlan = String(subscription.metadata?.bizosto_plan || '').trim();
        await adminDb
          .collection('tenants')
          .doc(tenantId)
          .set(
            {
              subscriptionState: mapStripeStatusToSubscriptionState(subscription.status),
              billingStatus: subscription.status,
              currentPeriodEnd: subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : null,
              cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
              stripeSubscriptionId: subscription.id,
              ...(updatedPlan ? { plan: updatedPlan } : {}),
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = String(subscription.metadata?.tenantId || '').trim();
        if (!tenantId) break;

        await adminDb.collection('tenants').doc(tenantId).set(
          {
            subscriptionState: 'hard_locked',
            billingStatus: 'canceled',
            plan: 'trial',
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const tenantId = await resolveTenantIdFromInvoice(stripe, invoice);
        if (!tenantId) break;

        await adminDb.collection('tenants').doc(tenantId).set(
          {
            subscriptionState: 'active',
            billingStatus: 'active',
            failedPaymentCount: 0,
            lastPaymentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );

        // Send payment confirmation email to tenant admin
        try {
          const usersSnap = await adminDb
            .collection('users')
            .where('tenantId', '==', tenantId)
            .where('role', '==', 'admin')
            .limit(1)
            .get();

          if (!usersSnap.empty) {
            const adminUser = usersSnap.docs[0].data();
            const email = String(adminUser.email || '').trim();
            const name = String(adminUser.displayName || adminUser.name || 'there').trim();

            if (email) {
              const amountPaid = invoice.amount_paid
                ? new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: String(invoice.currency || 'usd').toUpperCase(),
                  }).format(invoice.amount_paid / 100)
                : '';

              const invoiceUrl = invoice.hosted_invoice_url || null;

              await sendPaymentConfirmationEmail(email, name, tenantId, amountPaid, invoiceUrl);
            }
          }
        } catch (emailErr) {
          console.error('[STRIPE] Failed to send payment confirmation email', emailErr);
        }

        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const tenantId = await resolveTenantIdFromInvoice(stripe, invoice);
        if (!tenantId) break;

        const tenantRef = adminDb.collection('tenants').doc(tenantId);
        await adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(tenantRef);
          const currentCount = Number(snap.data()?.failedPaymentCount || 0);
          const failedPaymentCount = currentCount + 1;

          tx.set(
            tenantRef,
            {
              failedPaymentCount,
              subscriptionState: failedPaymentCount >= 3 ? 'soft_locked' : 'grace',
              billingStatus: 'past_due',
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        });
        break;
      }
      case 'invoice.finalized': {
        const invoice = event.data.object as Stripe.Invoice;
        const tenantId = await resolveTenantIdFromInvoice(stripe, invoice);
        if (!tenantId) break;

        await adminDb.collection('tenants').doc(tenantId).set(
          {
            lastInvoiceTax: Number((invoice.tax || 0)) / 100,
            lastInvoiceTotal: Number((invoice.total || 0)) / 100,
            lastInvoiceSubtotal: Number((invoice.subtotal || 0)) / 100,
            lastInvoiceTaxAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        return NextResponse.json({ ok: true });
      }
      case 'customer.tax_id.created': {
        console.info('[TAX] Tax ID created for customer', event.data.object);
        return NextResponse.json({ ok: true });
      }
      default:
        break;
    }
  } catch (error) {
    console.error('[STRIPE] Error processing subscription webhook event', {
      type: event.type,
      error,
    });
  }

  return NextResponse.json({ ok: true, received: true });
}
