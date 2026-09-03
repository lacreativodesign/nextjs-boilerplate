import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { adminDb } from '../../../../lib/firebaseAdmin';
import { createRoleNotifications, type NotificationType } from '@/lib/notifications';
import { writeAuditLog } from '@/lib/tenant/audit';
import { applySubscriptionState } from '@/lib/billing/apply-subscription-state';
import {
  claimWebhookEvent,
  finalizeWebhookEvent,
  releaseWebhookEvent,
} from '@/lib/stripe/webhook-idempotency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set(['checkout.session.completed']);
const TRUSTED_CHECKOUT_SOURCES = new Set(['bizosto_app', 'bizosto_platform', 'bizosto_website']);
const PAID_PLANS = new Set(['starter', 'pro', 'enterprise']);

type BillingCycle = 'monthly' | 'annual';
type BillingStatus = 'active' | 'past_due' | 'canceled';
type PaidPlan = 'starter' | 'pro' | 'enterprise';

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  return new Stripe(secretKey, { apiVersion: '2024-04-10' });
}

function requireWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  }
  return secret;
}

function parseBillingCycle(value: string | null | undefined): BillingCycle | null {
  if (value === 'monthly' || value === 'annual') return value;
  return null;
}

function parsePaidPlan(value: string | null | undefined): PaidPlan | null {
  const plan = String(value || '').trim();
  return PAID_PLANS.has(plan) ? (plan as PaidPlan) : null;
}

function normalizeBillingStatus(
  status: Stripe.Subscription.Status,
  eventType: string,
): BillingStatus {
  if (eventType === 'customer.subscription.deleted') {
    return 'canceled';
  }

  if (status === 'active' || status === 'trialing') {
    return 'active';
  }

  if (status === 'canceled') {
    return 'canceled';
  }

  return 'past_due';
}

function formatBillingStatus(status: BillingStatus | null | undefined) {
  if (!status) return 'unknown';
  return status.replace(/_/g, ' ');
}

function buildSubscriptionNotification({
  tenantName,
  previousStatus,
  nextStatus,
}: {
  tenantName: string;
  previousStatus: BillingStatus | null;
  nextStatus: BillingStatus;
}) {
  const previousLabel = formatBillingStatus(previousStatus);
  const nextLabel = formatBillingStatus(nextStatus);
  const title =
    nextStatus === 'active'
      ? 'Subscription active'
      : nextStatus === 'past_due'
        ? 'Subscription past due'
        : 'Subscription canceled';
  const body =
    previousStatus && previousStatus !== nextStatus
      ? `${tenantName} subscription changed from ${previousLabel} to ${nextLabel}.`
      : `${tenantName} subscription is now ${nextLabel}.`;
  const type: NotificationType =
    nextStatus === 'active' ? 'success' : nextStatus === 'past_due' ? 'warning' : 'warning';
  const priority: 'low' | 'normal' | 'high' = nextStatus === 'active' ? 'normal' : 'high';
  return { title, body, type, priority };
}

async function linkExistingTenant({
  tenantId,
  stripeCustomerId,
  stripeSubscriptionId,
  billingCycle,
  plan,
  subscription,
  eventId,
  lockCurrency,
}: {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  billingCycle: BillingCycle;
  plan: PaidPlan;
  subscription: Stripe.Subscription;
  eventId?: string;
  lockCurrency: boolean;
}): Promise<boolean> {
  const result = await applySubscriptionState({
    tenantId,
    source: 'checkout.linked',
    eventId,
    plan,
    stripeStatus: subscription.status,
    stripeCustomerId,
    stripeSubscriptionId,
    billingCycle,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEnd: subscription.trial_end,
  });

  if (!result.ok || !result.tenantExists) return false;

  // Activation metadata is deliberately written only after the canonical billing transition
  // succeeds. Currency becomes immutable on the first successful checkout activation.
  const activationPayload: Record<string, unknown> = {
    activationStatus: 'active',
    activatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (lockCurrency) {
    activationPayload.currencyLockedAt = admin.firestore.FieldValue.serverTimestamp();
    activationPayload.currencyLockedBy = 'stripe_checkout';
  }
  await adminDb.collection('tenants').doc(tenantId).set(activationPayload, { merge: true });

  return true;
}

async function updateSubscriptionStatus({
  subscription,
  eventType,
}: {
  subscription: Stripe.Subscription;
  eventType: string;
}) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const subscriptionId = subscription.id;
  const billingStatus = normalizeBillingStatus(subscription.status, eventType);
  const billingCycle = parseBillingCycle(subscription.metadata?.billingCycle);

  const tenantsRef = adminDb.collection('tenants');
  let tenantSnap = await tenantsRef
    .where('stripeSubscriptionId', '==', subscriptionId)
    .limit(1)
    .get();

  if (tenantSnap.empty && customerId) {
    tenantSnap = await tenantsRef.where('stripeCustomerId', '==', customerId).limit(1).get();
  }

  const tenantDoc = tenantSnap.docs[0];
  if (!tenantDoc) {
    return { updated: false };
  }

  const tenantData = tenantDoc.data() || {};
  const previousStatus = (tenantData.billingStatus || null) as BillingStatus | null;
  const tenantName = String(tenantData.name || 'Bizosto Tenant');

  const updatePayload: Record<string, unknown> = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    billingStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (billingCycle) {
    updatePayload.billingCycle = billingCycle;
  }

  await tenantDoc.ref.set(updatePayload, { merge: true });

  if (previousStatus !== billingStatus) {
    const notificationCopy = buildSubscriptionNotification({
      tenantName,
      previousStatus,
      nextStatus: billingStatus,
    });

    await Promise.all([
      createRoleNotifications({
        tenantId: tenantDoc.id,
        roles: ['admin', 'finance'],
        title: notificationCopy.title,
        body: notificationCopy.body,
        type: notificationCopy.type,
        priority: notificationCopy.priority,
        entityType: 'subscription',
        entityId: subscriptionId,
        deepLink: '/billing',
        createdBy: { uid: 'system', name: 'Stripe' },
        metadata: {
          previousStatus,
          billingStatus,
          billingCycle,
          eventType,
          stripeCustomerId: customerId,
        },
      }),
      createRoleNotifications({
        tenantId: tenantDoc.id,
        roles: ['super_admin'],
        recipientTenantId: null,
        title: notificationCopy.title,
        body: notificationCopy.body,
        type: notificationCopy.type,
        priority: notificationCopy.priority,
        entityType: 'subscription',
        entityId: subscriptionId,
        deepLink: '/super_admin/tenants',
        createdBy: { uid: 'system', name: 'Stripe' },
        metadata: {
          previousStatus,
          billingStatus,
          billingCycle,
          eventType,
          stripeCustomerId: customerId,
        },
      }),
      writeAuditLog({
        tenantId: tenantDoc.id,
        actorUserId: 'system',
        actorName: 'Stripe',
        actorRole: 'system',
        actionType: 'subscription_status_changed',
        entityType: 'subscription',
        entityId: subscriptionId,
        metadata: {
          previousStatus,
          billingStatus,
          billingCycle,
          eventType,
          stripeCustomerId: customerId,
        },
      }),
    ]);
  }

  return { updated: true };
}

export async function POST(req: Request) {
  let claimedEventId: string | null = null;
  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ ok: false, error: 'Missing signature.' }, { status: 400 });
    }

    const body = await req.text();
    const stripe = getStripeClient();
    const webhookSecret = requireWebhookSecret();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    if (!ALLOWED_EVENTS.has(event.type)) {
      return NextResponse.json({ ok: true, received: true });
    }

    const claim = await claimWebhookEvent(event.id, event.type);
    if (claim === 'duplicate') {
      return NextResponse.json({ ok: true, received: true });
    }
    claimedEventId = event.id;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      const source = metadata.source || '';

      if (!TRUSTED_CHECKOUT_SOURCES.has(source)) {
        await finalizeWebhookEvent(event.id, event.type);
        return NextResponse.json({ ok: true, received: true, linked: false });
      }

      const stripeCustomerId =
        typeof session.customer === 'string' ? session.customer : session.customer?.id || '';
      const stripeSubscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id || '';
      const billingCycle = parseBillingCycle(metadata.billingCycle);
      const metadataPlan = parsePaidPlan(metadata.bizosto_plan);
      const metadataTenantId =
        typeof metadata.tenantId === 'string' ? metadata.tenantId.trim() : '';

      if (
        !stripeCustomerId ||
        !stripeSubscriptionId ||
        !billingCycle ||
        !metadataPlan ||
        !metadataTenantId
      ) {
        console.error('stripe webhook: checkout session missing canonical metadata', {
          eventId: event.id,
          stripeCustomerId,
          stripeSubscriptionId,
          tenantId: metadataTenantId,
          plan: metadata.bizosto_plan || '',
          billingCycle: metadata.billingCycle || '',
          source,
        });
        await finalizeWebhookEvent(event.id, event.type);
        return NextResponse.json({ ok: true, received: true, linked: false });
      }

      if (source === 'bizosto_app' && session.client_reference_id !== metadataTenantId) {
        console.error('stripe webhook: checkout client_reference_id mismatch', {
          eventId: event.id,
          tenantId: metadataTenantId,
          clientReferenceId: session.client_reference_id || null,
        });
        await finalizeWebhookEvent(event.id, event.type);
        return NextResponse.json({ ok: true, received: true, linked: false });
      }

      const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      const subscriptionCustomerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;
      const subscriptionMetadata = subscription.metadata || {};

      if (
        subscriptionCustomerId !== stripeCustomerId ||
        subscriptionMetadata.tenantId !== metadataTenantId ||
        subscriptionMetadata.bizosto_plan !== metadataPlan ||
        subscriptionMetadata.billingCycle !== billingCycle ||
        subscriptionMetadata.source !== source
      ) {
        console.error('stripe webhook: session/subscription metadata mismatch', {
          eventId: event.id,
          tenantId: metadataTenantId,
          subscriptionId: stripeSubscriptionId,
        });
        await finalizeWebhookEvent(event.id, event.type);
        return NextResponse.json({ ok: true, received: true, linked: false });
      }

      const tenantRef = adminDb.collection('tenants').doc(metadataTenantId);
      const tenantSnap = await tenantRef.get();
      if (!tenantSnap.exists) {
        console.error('stripe webhook: metadata.tenantId did not match any tenant', {
          eventId: event.id,
          tenantId: metadataTenantId,
          stripeCustomerId,
          stripeSubscriptionId,
        });
        await finalizeWebhookEvent(event.id, event.type);
        return NextResponse.json({ ok: true, received: true, linked: false });
      }

      const tenantData = tenantSnap.data() || {};
      const isInitialCheckout = String(tenantData.subscriptionState || '') === 'pending_checkout';
      if (isInitialCheckout) {
        const provisionedPlan = String(tenantData.plan || '').trim();
        const currency = String(tenantData.settings?.currency || '')
          .trim()
          .toUpperCase();

        if (provisionedPlan !== metadataPlan || !currency) {
          console.error('stripe webhook: signup activation invariant failed', {
            eventId: event.id,
            tenantId: metadataTenantId,
            provisionedPlan,
            paidPlan: metadataPlan,
            currencyPresent: Boolean(currency),
          });
          await finalizeWebhookEvent(event.id, event.type);
          return NextResponse.json({ ok: true, received: true, linked: false });
        }
      }

      const currentSubscriptionId = String(tenantData.stripeSubscriptionId || '').trim();
      const currentBillingStatus = String(tenantData.billingStatus || '').toLowerCase();
      if (
        currentSubscriptionId &&
        currentSubscriptionId !== stripeSubscriptionId &&
        currentBillingStatus !== 'canceled'
      ) {
        console.error('stripe webhook: refusing to replace a live tenant subscription', {
          eventId: event.id,
          tenantId: metadataTenantId,
          currentSubscriptionId,
          incomingSubscriptionId: stripeSubscriptionId,
        });
        await finalizeWebhookEvent(event.id, event.type);
        return NextResponse.json({ ok: true, received: true, linked: false });
      }

      const linked = await linkExistingTenant({
        tenantId: metadataTenantId,
        stripeCustomerId,
        stripeSubscriptionId,
        billingCycle,
        plan: metadataPlan,
        subscription,
        eventId: event.id,
        lockCurrency: isInitialCheckout,
      });

      if (!linked) {
        console.error('stripe webhook: existing tenant could not be activated', {
          eventId: event.id,
          tenantId: metadataTenantId,
          stripeCustomerId,
          stripeSubscriptionId,
        });
        await finalizeWebhookEvent(event.id, event.type);
        return NextResponse.json({ ok: true, received: true, linked: false });
      }

      await finalizeWebhookEvent(event.id, event.type);
      return NextResponse.json({ ok: true, received: true, tenantId: metadataTenantId });
    }

    const subscription = event.data.object as Stripe.Subscription;
    await updateSubscriptionStatus({ subscription, eventType: event.type });
    await finalizeWebhookEvent(event.id, event.type);
    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    console.error('stripe webhook error:', err);
    if (claimedEventId) {
      await releaseWebhookEvent(claimedEventId);
    }
    return NextResponse.json({ ok: false, error: 'Webhook error.' }, { status: 500 });
  }
}
