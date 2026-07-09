import crypto from 'crypto';
import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { adminAuth, adminDb } from '../../../../lib/firebaseAdmin';
import { DEFAULT_ROLES, DEFAULT_TENANT_BRAND } from '../../../../lib/tenant/constants';
import { PLAN_MODULES } from '../../../../app/config/plans';
import { createPasswordSetupToken, sendSetPasswordEmail } from '../../../../lib/passwordSetup';
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
// Only these provision/link a tenant; any other checkout.session.completed is ignored.
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

function deriveTenantName(email: string) {
  const domain = email.split('@')[1] || '';
  const base = domain.split('.')[0] || '';
  if (!base) return 'Bizosto Tenant';
  return base.replace(/[^a-z0-9]/gi, ' ').trim() || 'Bizosto Tenant';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
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

async function ensureAdminUser({
  email,
  tenantId,
  tenantName,
}: {
  email: string;
  tenantId: string;
  tenantName: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Admin email is required.');
  }

  let userRecord = await adminAuth.getUserByEmail(normalizedEmail).catch(() => null);
  let isNewUser = false;

  if (!userRecord) {
    userRecord = await adminAuth.createUser({
      email: normalizedEmail,
      password: crypto.randomBytes(16).toString('hex'),
      displayName: normalizedEmail.split('@')[0],
    });
    isNewUser = true;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  await adminDb
    .collection('users')
    .doc(userRecord.uid)
    .set(
      {
        uid: userRecord.uid,
        email: normalizedEmail,
        displayName: userRecord.displayName || normalizedEmail.split('@')[0],
        role: 'admin',
        tenantId,
        status: 'active',
        updatedAt: now,
        createdAt: now,
      },
      { merge: true },
    );

  if (isNewUser) {
    const tokenData = await createPasswordSetupToken({
      uid: userRecord.uid,
      email: normalizedEmail,
      createdBy: 'stripe_checkout',
    });
    await sendSetPasswordEmail({ email: normalizedEmail, link: tokenData.link });

    await adminDb.collection('events').add({
      type: 'stripe.admin_invited',
      title: 'Admin invited',
      description: `Stripe checkout admin invite sent for ${tenantName}`,
      createdAt: now,
      updatedAt: now,
      metadata: {
        tenantId,
        email: normalizedEmail,
      },
    });
  }

  return userRecord.uid;
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
  // the tenant does not exist so the caller can fall back to legacy handling.
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

function resolveCheckoutPlan(value: unknown): keyof typeof PLAN_MODULES {
  const plan = String(value || '')
    .trim()
    .toLowerCase();
  if (plan === 'starter' || plan === 'pro' || plan === 'enterprise') {
    return plan;
  }
  // Fail closed: never silently grant a plan (previously hardcoded to "pro"). If checkout metadata
  // lacks a valid bizosto_plan, reject so Stripe retries and this surfaces, rather than provisioning
  // the wrong (higher) tier.
  throw new Error(`Unable to resolve Bizosto plan from checkout metadata: "${String(value)}"`);
}

async function ensureTenantForCheckout({
  email,
  stripeCustomerId,
  stripeSubscriptionId,
  billingCycle,
  plan,
}: {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  billingCycle: BillingCycle;
  plan: keyof typeof PLAN_MODULES;
}) {
  const now = admin.firestore.FieldValue.serverTimestamp();

  return adminDb.runTransaction(async (tx) => {
    const tenantsRef = adminDb.collection('tenants');
    const byCustomerSnap = await tx.get(
      tenantsRef.where('stripeCustomerId', '==', stripeCustomerId).limit(1),
    );
    const bySubscriptionSnap = await tx.get(
      tenantsRef.where('stripeSubscriptionId', '==', stripeSubscriptionId).limit(1),
    );

    const existingDoc = byCustomerSnap.docs[0] || bySubscriptionSnap.docs[0];

    if (existingDoc) {
      const existingData = existingDoc.data() || {};
      tx.set(
        existingDoc.ref,
        {
          stripeCustomerId,
          stripeSubscriptionId,
          billingStatus: 'active',
          billingCycle,
          status: 'active',
          updatedAt: now,
        },
        { merge: true },
      );

      return {
        tenantId: existingDoc.id,
        tenantName: String(existingData.name || 'Bizosto Tenant'),
        created: false,
      };
    }

    const name = deriveTenantName(email);
    const slugBase = slugify(name) || 'bizosto-tenant';
    const tenantRef = tenantsRef.doc();
    const slug = `${slugBase}-${tenantRef.id.slice(0, 6)}`;

    tx.set(tenantRef, {
      name,
      slug,
      status: 'active',
      source: 'stripe_checkout',
      brand: {
        ...DEFAULT_TENANT_BRAND,
        name,
      },
      modulesEnabled: { ...PLAN_MODULES[plan] },
      rolesEnabled: DEFAULT_ROLES,
      plan,
      settings: {
        currency: 'USD',
        timezone: 'UTC',
        country: '',
        state: '',
      },
      modules: { ...PLAN_MODULES[plan] },
      planSetBy: { uid: 'system', role: 'super_admin' },
      planUpdatedAt: now,
      stripeCustomerId,
      stripeSubscriptionId,
      billingStatus: 'active',
      billingCycle,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'system',
    });

    return { tenantId: tenantRef.id, tenantName: name, created: true };
  });
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

      const email = normalizeEmail(session.customer_details?.email || session.customer_email);
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

      try {
        // App signup flow: /api/signup already created the tenant, admin user,
        // claims, plan, modules, and welcome email. Here we only link the Stripe
        // customer/subscription to that existing tenant and activate billing.
        if (metadataTenantId) {
          const linked = await linkExistingTenant({
            tenantId: metadataTenantId,
            stripeCustomerId,
            stripeSubscriptionId,
            billingCycle,
            eventId: event.id,
          });
          if (linked) {
            await finalizeWebhookEvent(event.id, event.type);
            return NextResponse.json({ ok: true, received: true, tenantId: metadataTenantId });
          }
          // Tenant id present but not found — fall through to legacy create-by-email.
        }

        // Legacy / marketing-site checkout with no pre-created tenant.
        if (!email) {
          return NextResponse.json(
            { ok: false, error: 'Missing checkout details.' },
            { status: 400 },
          );
        }

        const tenantResult = await ensureTenantForCheckout({
          email,
          stripeCustomerId,
          stripeSubscriptionId,
          billingCycle,
          plan: resolveCheckoutPlan(metadata.bizosto_plan),
        });

        await ensureAdminUser({
          email,
          tenantId: tenantResult.tenantId,
          tenantName: tenantResult.tenantName,
        });

        await finalizeWebhookEvent(event.id, event.type);
        return NextResponse.json({ ok: true, received: true, tenantId: tenantResult.tenantId });
      } catch (handlerErr) {
        throw handlerErr;
      }
    }

    try {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscriptionStatus({ subscription, eventType: event.type });
      await finalizeWebhookEvent(event.id, event.type);
      return NextResponse.json({ ok: true, received: true });
    } catch (handlerErr) {
      throw handlerErr;
    }
  } catch (err) {
    console.error('stripe webhook error:', err);
    // Release any claim made in this delivery so Stripe's retry can re-process.
    if (claimedEventId) {
      await releaseWebhookEvent(claimedEventId);
    }
    return NextResponse.json({ ok: false, error: 'Webhook error.' }, { status: 500 });
  }
}
