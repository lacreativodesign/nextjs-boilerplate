import * as admin from "firebase-admin";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStripeClient } from "@/lib/payments/stripe";
import { type BillingPlanKey, getStripePriceId, normalizePlanKey, plans } from "@/lib/billing/plans";
import { PLAN_MODULES } from "@/app/config/plans";
import { ingestMetric } from "@/lib/monitoring/dashboard-service";

// Module access must follow the plan. resolveTenantModules treats the explicit
// `modules` field as authoritative, so every plan write must rewrite it or a
// downgrade would retain paid modules.
function modulesForPlan(plan: BillingPlanKey) {
  return PLAN_MODULES[plan as keyof typeof PLAN_MODULES] ?? PLAN_MODULES.starter;
}

export type UsageMetric = "api_calls" | "storage" | "users";

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
  subscriptions: "billing_subscriptions",
  usageRecords: "billing_usage_records",
  usageMonthly: "billing_usage_monthly",
  invoices: "billing_invoices",
  paymentMethods: "billing_payment_methods",
};

function toIsoFromUnix(epoch?: number | null) {
  if (!epoch || epoch <= 0) return null;
  return new Date(epoch * 1000).toISOString();
}

function getUnixPeriod(month: string) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    throw new Error("Invalid period format. Use YYYY-MM");
  }

  const periodStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  return {
    periodStart,
    periodEnd,
    key: `${yearStr}-${monthStr.padStart(2, "0")}`,
  };
}

async function updateTenantBillingSummary(tenantId: string, payload: Record<string, unknown>) {
  await adminDb.collection("tenants").doc(tenantId).set(
    {
      ...payload,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function ensureStripeCustomer(input: { tenantId: string; email?: string; name?: string }) {
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
      source: "bizosto_erp",
    },
  });

  await ref.set(
    {
      tenantId: input.tenantId,
      stripeCustomerId: customer.id,
      plan: "starter",
      status: "incomplete",
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return customer.id;
}

export async function subscribeTenantToPlan(input: {
  tenantId: string;
  plan: BillingPlanKey;
  paymentMethodId?: string;
  email?: string;
  name?: string;
}) {
  const stripe = getStripeClient();
  const customerId = await ensureStripeCustomer({
    tenantId: input.tenantId,
    email: input.email,
    name: input.name,
  });

  if (input.paymentMethodId) {
    await stripe.paymentMethods.attach(input.paymentMethodId, { customer: customerId }).catch(() => null);
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: input.paymentMethodId },
    });
  }

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: getStripePriceId(input.plan) }],
    proration_behavior: "create_prorations",
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
    metadata: {
      tenantId: input.tenantId,
      plan: input.plan,
    },
  });

  const payload: BillingSubscription = {
    tenantId: input.tenantId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    plan: input.plan,
    status: subscription.status,
    currentPeriodStart: toIsoFromUnix(subscription.current_period_start),
    currentPeriodEnd: toIsoFromUnix(subscription.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    canceledAt: toIsoFromUnix(subscription.canceled_at),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await adminDb.collection(BILLING_COLLECTIONS.subscriptions).doc(input.tenantId).set(payload, { merge: true });
  await updateTenantBillingSummary(input.tenantId, {
    plan: input.plan,
    modules: modulesForPlan(input.plan),
    modulesEnabled: modulesForPlan(input.plan),
    billingStatus: subscription.status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
  });

  return payload;
}

export async function changeTenantPlan(input: { tenantId: string; newPlan: BillingPlanKey }) {
  const stripe = getStripeClient();
  const subscription = await getCurrentSubscription(input.tenantId);
  if (!subscription?.stripeSubscriptionId) {
    throw new Error("No active subscription found for tenant.");
  }

  const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
  const itemId = stripeSub.items.data[0]?.id;
  if (!itemId) {
    throw new Error("Subscription item not found.");
  }

  const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    items: [{ id: itemId, price: getStripePriceId(input.newPlan) }],
    proration_behavior: "create_prorations",
    metadata: {
      ...stripeSub.metadata,
      plan: input.newPlan,
      tenantId: input.tenantId,
    },
  });

  await adminDb.collection(BILLING_COLLECTIONS.subscriptions).doc(input.tenantId).set(
    {
      plan: input.newPlan,
      status: updated.status,
      currentPeriodStart: toIsoFromUnix(updated.current_period_start),
      currentPeriodEnd: toIsoFromUnix(updated.current_period_end),
      cancelAtPeriodEnd: Boolean(updated.cancel_at_period_end),
      canceledAt: toIsoFromUnix(updated.canceled_at),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await updateTenantBillingSummary(input.tenantId, {
    plan: input.newPlan,
    modules: modulesForPlan(input.newPlan),
    modulesEnabled: modulesForPlan(input.newPlan),
    billingStatus: updated.status,
  });
}

export async function cancelTenantSubscription(input: { tenantId: string; immediate?: boolean }) {
  const stripe = getStripeClient();
  const subscription = await getCurrentSubscription(input.tenantId);
  if (!subscription?.stripeSubscriptionId) {
    throw new Error("No active subscription found for tenant.");
  }

  const updated = input.immediate
    ? await stripe.subscriptions.cancel(subscription.stripeSubscriptionId)
    : await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });

  await adminDb.collection(BILLING_COLLECTIONS.subscriptions).doc(input.tenantId).set(
    {
      status: updated.status,
      cancelAtPeriodEnd: Boolean(updated.cancel_at_period_end),
      canceledAt: toIsoFromUnix(updated.canceled_at),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await updateTenantBillingSummary(input.tenantId, {
    billingStatus: updated.status,
    subscriptionState: updated.status === "canceled" ? "hard_locked" : "active",
  });
}

export async function getCurrentSubscription(tenantId: string): Promise<BillingSubscription | null> {
  const snap = await adminDb.collection(BILLING_COLLECTIONS.subscriptions).doc(tenantId).get();
  if (!snap.exists) return null;
  const data = snap.data() as BillingSubscription;
  return data;
}

export async function updatePaymentMethod(input: { tenantId: string; paymentMethodId: string }) {
  const stripe = getStripeClient();
  const subscription = await getCurrentSubscription(input.tenantId);
  if (!subscription?.stripeCustomerId) {
    throw new Error("Stripe customer not found for tenant.");
  }

  const paymentMethod = await stripe.paymentMethods.attach(input.paymentMethodId, {
    customer: subscription.stripeCustomerId,
  });

  await stripe.customers.update(subscription.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: input.paymentMethodId,
    },
  });

  await adminDb.collection(BILLING_COLLECTIONS.paymentMethods).doc(input.tenantId).set(
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
    { merge: true }
  );
}

export async function listInvoices(tenantId: string) {
  const snap = await adminDb
    .collection(BILLING_COLLECTIONS.invoices)
    .where("tenantId", "==", tenantId)
    .orderBy("createdAt", "desc")
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
    throw new Error("Usage quantity must be > 0");
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
    source: input.source || "system",
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
    { merge: true }
  );

  await batch.commit();
}

export async function getUsageByTenant(tenantId: string, period: string) {
  const metrics: UsageMetric[] = ["api_calls", "storage", "users"];
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
    })
  );

  return usage;
}

export async function enforceUsageLimit(input: { tenantId: string; metric: UsageMetric; requested: number; period: string }) {
  const subscription = await getCurrentSubscription(input.tenantId);
  const currentPlan = normalizePlanKey(subscription?.plan || "starter");
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

export async function handleBillingWebhook(event: Stripe.Event) {
  // Idempotency: skip events already processed; mark processed only AFTER the
  // handler succeeds so a transient failure can be safely retried by Stripe.
  const processedRef = adminDb.collection("processed_webhook_events").doc(event.id);
  const processedSnap = await processedRef.get();
  if (processedSnap.exists) return;

  await applyBillingEvent(event);

  await processedRef.set({
    eventId: event.id,
    type: event.type,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function applyBillingEvent(event: Stripe.Event) {
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const tenantId = String(subscription.metadata?.tenantId || "");
    if (!tenantId) return;

    await adminDb.collection(BILLING_COLLECTIONS.subscriptions).doc(tenantId).set(
      {
        status: "canceled",
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        canceledAt: toIsoFromUnix(subscription.canceled_at) || new Date().toISOString(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Cancellation locks the tenant out until billing is restored.
    await updateTenantBillingSummary(tenantId, {
      billingStatus: "canceled",
      subscriptionState: "hard_locked",
    });
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const subscription = event.data.object as Stripe.Subscription;
    const tenantId = String(subscription.metadata?.tenantId || "");
    if (!tenantId) return;

    const planFromMetadata = normalizePlanKey(subscription.metadata?.plan || "starter");
    await adminDb.collection(BILLING_COLLECTIONS.subscriptions).doc(tenantId).set(
      {
        tenantId,
        stripeCustomerId: String(subscription.customer || ""),
        stripeSubscriptionId: subscription.id,
        plan: planFromMetadata,
        status: subscription.status,
        currentPeriodStart: toIsoFromUnix(subscription.current_period_start),
        currentPeriodEnd: toIsoFromUnix(subscription.current_period_end),
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        canceledAt: toIsoFromUnix(subscription.canceled_at),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await updateTenantBillingSummary(tenantId, {
      plan: planFromMetadata,
      modules: modulesForPlan(planFromMetadata),
      modulesEnabled: modulesForPlan(planFromMetadata),
      billingStatus: subscription.status,
      stripeCustomerId: String(subscription.customer || ""),
      stripeSubscriptionId: subscription.id,
    });

    if (event.type === "customer.subscription.created") {
      await ingestMetric({
        type: "conversion_event",
        module: "billing",
        endpoint: "stripe.subscription.created",
        conversionStage: "trial",
        metadata: { tenantId, plan: planFromMetadata, status: subscription.status },
      });
    }
    return;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const tenantId = String((invoice as any).subscription_details?.metadata?.tenantId || invoice.metadata?.tenantId || "");
    if (!tenantId) return;

    const amount = Number(invoice.amount_paid || invoice.amount_due || 0) / 100;
    await adminDb.collection(BILLING_COLLECTIONS.invoices).doc(invoice.id).set(
      {
        id: invoice.id,
        tenantId,
        stripeSubscriptionId: typeof invoice.subscription === "string" ? invoice.subscription : null,
        amount,
        currency: String(invoice.currency || "usd").toUpperCase(),
        status: invoice.status || (event.type === "invoice.paid" ? "paid" : "open"),
        periodStart: toIsoFromUnix(invoice.period_start),
        periodEnd: toIsoFromUnix(invoice.period_end),
        pdfUrl: invoice.invoice_pdf || null,
        hostedInvoiceUrl: invoice.hosted_invoice_url || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await updateTenantBillingSummary(tenantId, {
      billingStatus: event.type === "invoice.paid" ? "active" : "past_due",
      subscriptionState: event.type === "invoice.paid" ? "active" : "grace",
    });

    if (event.type === "invoice.paid") {
      await ingestMetric({
        type: "conversion_event",
        module: "billing",
        endpoint: "stripe.invoice.paid",
        conversionStage: "paid",
        metadata: { tenantId, invoiceId: invoice.id, amount },
      });
    }
  }
}

export async function verifyAndConstructBillingEvent(rawBody: string, signature: string) {
  const secret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_INVOICE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_SUBSCRIPTION_WEBHOOK_SECRET");
  }
  return getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
}
