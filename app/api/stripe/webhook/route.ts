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

// Checkout sessions Bizosto itself originated (app signup, platform, marketing site).
// Only these link a tenant; any other checkout.session.completed is ignored.
const TRUSTED_CHECKOUT_SOURCES = new Set(['bizosto_app', 'bizosto_platform', 'bizosto_website']);

type BillingCycle = 'monthly' | 'annual';

type BillingStatus = 'active' | 'past_due' | 'canceled';

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

function normalizeEmail(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function parseBillingCycle(value: string | null | undefined): BillingCycle | null {
  if (value === 'monthly' || value === 'annual') return value;
  return null;
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
  eventId,
}: {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  billingCycle: BillingCycle;
  eventId?: string;
}): Promise<boolean> {
  // Canonical billing state service: activates billing, stores Stripe IDs and
  // billing cycle, and writes a billing_state_audit record. Returns false when
  // the tenant does not exist.
  const result = await applySubscriptionState({
    tenantId,
    source: 'checkout.linked',
    eventId,
    stripeCustomerId,
    stripeSubscriptionId,
    billingCycle,
  });
  return result.tenantExists;
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
  // Hoisted so the outer catch can release a partial claim for Stripe retry.
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
      // Subscription/invoice events are owned solely by /api/stripe/subscription-webhook.
      // Ack-and-ignore here so Stripe does not retry against this endpoint.
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

      if (!TRUSTED_CHECKOUT_SOURCES.has(metadata.source || '')) {
        return NextResponse.json({ ok: true, received: true });
      }

      const stripeCustomerId =
        typeof session.customer === 'string' ? session.customer : session.customer?.id || '';
      const stripeSubscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id || '';
      const billingCycle = parseBillingCycle(metadata.billingCycle) || 'monthly';
      const metadataTenantId =
        typeof metadata.tenantId === 'string' ? metadata.tenantId.trim() : '';

      if (!stripeCustomerId || !stripeSubscriptionId) {
        return NextResponse.json(
          { ok: false, error: 'Missing checkout details.' },
          { status: 400 },
        );
      }

      // S39 single-provisioning invariant: /api/signup is the ONLY path that
      // creates a tenant, admin user, claims, plan, and modules — always before
      // Checkout, always stamping metadata.tenantId. This webhook therefore only
      // LINKS an existing tenant to its Stripe subscription and activates billing.
      // The former create-by-email fallback (ensureTenantForCheckout / ensureAdminUser)
      // was removed: no code path originates a tenant-less checkout, so the fallback
      // was dead and could only misfire — creating a duplicate tenant, inferring a
      // company name from an email domain, or granting a plan from unauthenticated
      // metadata. Missing or unknown tenantId now fails closed.
      if (!metadataTenantId) {
        // Trusted source but no tenant reference — cannot safely link. Ack so Stripe
        // stops retrying; the mismatch is logged for investigation rather than
        // silently provisioning a new workspace.
        console.error('stripe webhook: checkout.session.completed missing metadata.tenantId', {
          eventId: event.id,
          stripeCustomerId,
          stripeSubscriptionId,
          source: metadata.source || '',
        });
        await finalizeWebhookEvent(event.id, event.type);
        return NextResponse.json({ ok: true, received: true, linked: false });
      }

      const linked = await linkExistingTenant({
        tenantId: metadataTenantId,
        stripeCustomerId,
        stripeSubscriptionId,
        billingCycle,
        eventId: event.id,
      });

      if (!linked) {
        // tenantId was present but no tenant document matched. Do NOT create one —
        // ack, log, and let an operator reconcile. A retry cannot fix a nonexistent
        // tenant, and creating one here would bypass the verified signup flow.
        console.error('stripe webhook: metadata.tenantId did not match any tenant', {
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

    // Defensive: ALLOWED_EVENTS currently admits only checkout.session.completed,
    // so this path is unreachable today. Retained so that re-admitting subscription
    // events here (instead of subscription-webhook) stays a one-line change.
    const subscription = event.data.object as Stripe.Subscription;
    await updateSubscriptionStatus({ subscription, eventType: event.type });
    await finalizeWebhookEvent(event.id, event.type);
    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    console.error('stripe webhook error:', err);
    // Release any claim made in this delivery so Stripe's retry can re-process.
    if (claimedEventId) {
      await releaseWebhookEvent(claimedEventId);
    }
    return NextResponse.json({ ok: false, error: 'Webhook error.' }, { status: 500 });
  }
}
