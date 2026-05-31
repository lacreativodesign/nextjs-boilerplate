import crypto from "crypto";
import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { adminAuth, adminDb } from "../../../../lib/firebaseAdmin";
import { DEFAULT_MODULES, DEFAULT_ROLES, DEFAULT_TENANT_BRAND } from "../../../../lib/tenant/constants";
import { PLAN_MODULES } from "../../../../app/config/plans";
import { createPasswordSetupToken, sendSetPasswordEmail } from "../../../../lib/passwordSetup";
import { createRoleNotifications } from "@/lib/notifications";
import { writeAuditLog } from "@/lib/tenant/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

type BillingCycle = "monthly" | "annual";

type BillingStatus = "active" | "past_due" | "canceled";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return new Stripe(secretKey, { apiVersion: "2024-06-20" });
}

function requireWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function deriveTenantName(email: string) {
  const domain = email.split("@")[1] || "";
  const base = domain.split(".")[0] || "";
  if (!base) return "Bizosto Tenant";
  return base.replace(/[^a-z0-9]/gi, " ").trim() || "Bizosto Tenant";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function parseBillingCycle(value: string | null | undefined): BillingCycle | null {
  if (value === "monthly" || value === "annual") return value;
  return null;
}

function normalizeBillingStatus(status: Stripe.Subscription.Status, eventType: string): BillingStatus {
  if (eventType === "customer.subscription.deleted") {
    return "canceled";
  }

  if (status === "active" || status === "trialing") {
    return "active";
  }

  if (status === "canceled") {
    return "canceled";
  }

  return "past_due";
}

function formatBillingStatus(status: BillingStatus | null | undefined) {
  if (!status) return "unknown";
  return status.replace(/_/g, " ");
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
    nextStatus === "active"
      ? "Subscription active"
      : nextStatus === "past_due"
      ? "Subscription past due"
      : "Subscription canceled";
  const body =
    previousStatus && previousStatus !== nextStatus
      ? `${tenantName} subscription changed from ${previousLabel} to ${nextLabel}.`
      : `${tenantName} subscription is now ${nextLabel}.`;
  const type = nextStatus === "active" ? "success" : nextStatus === "past_due" ? "warning" : "warning";
  const priority = nextStatus === "active" ? "normal" : "high";
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
    throw new Error("Admin email is required.");
  }

  let userRecord = await adminAuth.getUserByEmail(normalizedEmail).catch(() => null);
  let isNewUser = false;

  if (!userRecord) {
    userRecord = await adminAuth.createUser({
      email: normalizedEmail,
      password: crypto.randomBytes(16).toString("hex"),
      displayName: normalizedEmail.split("@")[0],
    });
    isNewUser = true;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  await adminDb
    .collection("users")
    .doc(userRecord.uid)
    .set(
      {
        uid: userRecord.uid,
        email: normalizedEmail,
        displayName: userRecord.displayName || normalizedEmail.split("@")[0],
        role: "admin",
        tenantId,
        status: "active",
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );

  if (isNewUser) {
    const tokenData = await createPasswordSetupToken({
      uid: userRecord.uid,
      email: normalizedEmail,
      createdBy: "stripe_checkout",
    });
    await sendSetPasswordEmail({ email: normalizedEmail, link: tokenData.link });

    await adminDb.collection("events").add({
      type: "stripe.admin_invited",
      title: "Admin invited",
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

async function ensureTenantForCheckout({
  email,
  stripeCustomerId,
  stripeSubscriptionId,
  billingCycle,
}: {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  billingCycle: BillingCycle;
}) {
  const now = admin.firestore.FieldValue.serverTimestamp();

  return adminDb.runTransaction(async (tx) => {
    const tenantsRef = adminDb.collection("tenants");
    const byCustomerSnap = await tx.get(
      tenantsRef.where("stripeCustomerId", "==", stripeCustomerId).limit(1)
    );
    const bySubscriptionSnap = await tx.get(
      tenantsRef.where("stripeSubscriptionId", "==", stripeSubscriptionId).limit(1)
    );

    const existingDoc = byCustomerSnap.docs[0] || bySubscriptionSnap.docs[0];

    if (existingDoc) {
      const existingData = existingDoc.data() || {};
      tx.set(
        existingDoc.ref,
        {
          stripeCustomerId,
          stripeSubscriptionId,
          billingStatus: "active",
          billingCycle,
          status: "active",
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        tenantId: existingDoc.id,
        tenantName: String(existingData.name || "Bizosto Tenant"),
        created: false,
      };
    }

    const name = deriveTenantName(email);
    const slugBase = slugify(name) || "bizosto-tenant";
    const tenantRef = tenantsRef.doc();
    const slug = `${slugBase}-${tenantRef.id.slice(0, 6)}`;

    tx.set(tenantRef, {
      name,
      slug,
      status: "active",
      source: "stripe_checkout",
      brand: {
        ...DEFAULT_TENANT_BRAND,
        name,
      },
      modulesEnabled: DEFAULT_MODULES,
      rolesEnabled: DEFAULT_ROLES,
      plan: "pro",
      settings: {
        currency: "USD",
        timezone: "UTC",
        country: "",
        state: "",
      },
      modules: { ...PLAN_MODULES.pro, sales: true, production: true },
      planSetBy: { uid: "system", role: "super_admin" },
      planUpdatedAt: now,
      stripeCustomerId,
      stripeSubscriptionId,
      billingStatus: "active",
      billingCycle,
      createdAt: now,
      updatedAt: now,
      updatedBy: "system",
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
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const subscriptionId = subscription.id;
  const billingStatus = normalizeBillingStatus(subscription.status, eventType);
  const billingCycle = parseBillingCycle(subscription.metadata?.billingCycle);

  const tenantsRef = adminDb.collection("tenants");
  let tenantSnap = await tenantsRef.where("stripeSubscriptionId", "==", subscriptionId).limit(1).get();

  if (tenantSnap.empty && customerId) {
    tenantSnap = await tenantsRef.where("stripeCustomerId", "==", customerId).limit(1).get();
  }

  const tenantDoc = tenantSnap.docs[0];
  if (!tenantDoc) {
    return { updated: false };
  }

  const tenantData = tenantDoc.data() || {};
  const previousStatus = (tenantData.billingStatus || null) as BillingStatus | null;
  const tenantName = String(tenantData.name || "Bizosto Tenant");

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
        roles: ["admin", "finance"],
        title: notificationCopy.title,
        body: notificationCopy.body,
        type: notificationCopy.type,
        priority: notificationCopy.priority,
        entityType: "subscription",
        entityId: subscriptionId,
        deepLink: "/billing",
        createdBy: { uid: "system", name: "Stripe" },
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
        roles: ["super_admin"],
        recipientTenantId: null,
        title: notificationCopy.title,
        body: notificationCopy.body,
        type: notificationCopy.type,
        priority: notificationCopy.priority,
        entityType: "subscription",
        entityId: subscriptionId,
        deepLink: "/super_admin/tenants",
        createdBy: { uid: "system", name: "Stripe" },
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
        actorUserId: "system",
        actorName: "Stripe",
        actorRole: "system",
        actionType: "subscription_status_changed",
        entityType: "subscription",
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
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
    }

    const body = await req.text();
    const stripe = getStripeClient();
    const webhookSecret = requireWebhookSecret();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    const processedRef = adminDb.collection("processed_webhook_events").doc(event.id);
    const processedSnap = await processedRef.get();
    if (processedSnap.exists) {
      return NextResponse.json({ ok: true, received: true });
    }
    await processedRef.set({ eventId: event.id, type: event.type, processedAt: new Date().toISOString() });

    if (!ALLOWED_EVENTS.has(event.type)) {
      return NextResponse.json({ ok: false, error: "Unhandled event type." }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};

      if (metadata.source !== "bizosto_website") {
        return NextResponse.json({ ok: true, received: true });
      }

      const email = normalizeEmail(session.customer_details?.email || session.customer_email);
      const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id || "";
      const stripeSubscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id || "";
      const billingCycle = parseBillingCycle(metadata.billingCycle) || "monthly";

      if (!email || !stripeCustomerId || !stripeSubscriptionId) {
        return NextResponse.json({ ok: false, error: "Missing checkout details." }, { status: 400 });
      }

      const tenantResult = await ensureTenantForCheckout({
        email,
        stripeCustomerId,
        stripeSubscriptionId,
        billingCycle,
      });

      await ensureAdminUser({
        email,
        tenantId: tenantResult.tenantId,
        tenantName: tenantResult.tenantName,
      });

      return NextResponse.json({ ok: true, received: true, tenantId: tenantResult.tenantId });
    }

    const subscription = event.data.object as Stripe.Subscription;
    await updateSubscriptionStatus({ subscription, eventType: event.type });
    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    console.error("stripe webhook error:", err);
    return NextResponse.json({ ok: false, error: "Webhook error." }, { status: 500 });
  }
}
