import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { getStripeClient } from '@/lib/payments/stripe';
import { type BillingPlanKey, normalizePlanKey, plans } from '@/lib/billing/plans';

export type UsageMetric = 'api_calls' | 'storage' | 'users';

export type BillingSubscription = {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: BillingPlanKey;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  createdAt?: any;
  updatedAt?: any;
};

const BILLING_COLLECTIONS = {
  subscriptions: 'billing_subscriptions',
  usageRecords: 'billing_usage_records',
  usageMonthly: 'billing_usage_monthly',
  invoices: 'billing_invoices',
  paymentMethods: 'billing_payment_methods',
};

function getUnixPeriod(month: string) {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    throw new Error('Invalid period format. Use YYYY-MM');
  }

  const periodStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  return {
    periodStart,
    periodEnd,
    key: `${yearStr}-${monthStr.padStart(2, '0')}`,
  };
}

export async function ensureStripeCustomer(input: {
  tenantId: string;
  email?: string;
  name?: string;
}) {
  const ref = adminDb.collection(BILLING_COLLECTIONS.subscriptions).doc(input.tenantId);
  const snap = await ref.get();
  const existing = snap.data() || {};
  if (existing.stripeCustomerId) {
    return String(existing.stripeCustomerId);
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: input.email,
    name: input.name,
    metadata: {
      tenantId: input.tenantId,
      source: 'bizosto_erp',
    },
  });

  await ref.set(
    {
      tenantId: input.tenantId,
      stripeCustomerId: customer.id,
      plan: 'starter',
      status: 'incomplete',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return customer.id;
}

export async function getCurrentSubscription(
  tenantId: string,
): Promise<BillingSubscription | null> {
  const snap = await adminDb.collection(BILLING_COLLECTIONS.subscriptions).doc(tenantId).get();
  if (!snap.exists) return null;
  const data = snap.data() as BillingSubscription;
  return data;
}

export async function updatePaymentMethod(input: { tenantId: string; paymentMethodId: string }) {
  const stripe = getStripeClient();
  const subscription = await getCurrentSubscription(input.tenantId);
  if (!subscription?.stripeCustomerId) {
    throw new Error('Stripe customer not found for tenant.');
  }

  const paymentMethod = await stripe.paymentMethods.attach(input.paymentMethodId, {
    customer: subscription.stripeCustomerId,
  });

  await stripe.customers.update(subscription.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: input.paymentMethodId,
    },
  });

  await adminDb
    .collection(BILLING_COLLECTIONS.paymentMethods)
    .doc(input.tenantId)
    .set(
      {
        tenantId: input.tenantId,
        stripePaymentMethodId: paymentMethod.id,
        brand: paymentMethod.card?.brand || null,
        last4: paymentMethod.card?.last4 || null,
        expMonth: paymentMethod.card?.exp_month || null,
        expYear: paymentMethod.card?.exp_year || null,
        isDefault: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function listInvoices(tenantId: string) {
  const snap = await adminDb
    .collection(BILLING_COLLECTIONS.invoices)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
}

export async function recordUsage(input: {
  tenantId: string;
  metric: UsageMetric;
  quantity: number;
  period: string;
  source?: string;
}) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('Usage quantity must be > 0');
  }
  const period = getUnixPeriod(input.period);
  const key = `${input.tenantId}_${input.metric}_${period.key}`;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const batch = adminDb.batch();
  batch.set(adminDb.collection(BILLING_COLLECTIONS.usageRecords).doc(), {
    tenantId: input.tenantId,
    metric: input.metric,
    quantity: input.quantity,
    period: period.key,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    source: input.source || 'system',
    createdAt: now,
  });

  batch.set(
    adminDb.collection(BILLING_COLLECTIONS.usageMonthly).doc(key),
    {
      tenantId: input.tenantId,
      metric: input.metric,
      period: period.key,
      quantity: admin.firestore.FieldValue.increment(input.quantity),
      updatedAt: now,
    },
    { merge: true },
  );

  await batch.commit();
}

export async function getUsageByTenant(tenantId: string, period: string) {
  const metrics: UsageMetric[] = ['api_calls', 'storage', 'users'];
  const usage: Record<UsageMetric, number> = {
    api_calls: 0,
    storage: 0,
    users: 0,
  };

  await Promise.all(
    metrics.map(async (metric) => {
      const key = `${tenantId}_${metric}_${period}`;
      const snap = await adminDb.collection(BILLING_COLLECTIONS.usageMonthly).doc(key).get();
      if (snap.exists) {
        usage[metric] = Number(snap.data()?.quantity || 0);
      }
    }),
  );

  return usage;
}

export async function enforceUsageLimit(input: {
  tenantId: string;
  metric: UsageMetric;
  requested: number;
  period: string;
}) {
  const subscription = await getCurrentSubscription(input.tenantId);
  const currentPlan = normalizePlanKey(subscription?.plan || 'starter');
  const limit = plans[currentPlan].limits[input.metric];
  if (limit < 0) {
    return { allowed: true, used: 0, limit, warning: false };
  }

  const usage = await getUsageByTenant(input.tenantId, input.period);
  const used = usage[input.metric];
  const next = used + input.requested;

  if (next > limit) {
    return { allowed: false, used, limit, warning: true };
  }

  const warning = next >= limit * 0.8;
  return { allowed: true, used: next, limit, warning };
}

export async function verifyAndConstructBillingEvent(rawBody: string, signature: string) {
  const secret =
    process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_INVOICE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('Missing STRIPE_SUBSCRIPTION_WEBHOOK_SECRET');
  }
  return getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
}
