import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { toISO } from "../../sales/_utils";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeConfig = {
  tenantId: string;
  secretKey: string;
  webhookSecret: string;
};

async function loadStripeConfigs(): Promise<StripeConfig[]> {
  const tenantsSnap = await adminDb.collection("tenants").get();
  const configs: StripeConfig[] = [];

  for (const tenant of tenantsSnap.docs) {
    const tenantId = tenant.id;
    const stripeSnap = await adminDb.collection("tenants").doc(tenantId).collection("integrations").doc("stripe").get();
    if (!stripeSnap.exists) continue;
    const data = stripeSnap.data() || {};
    if (!data.enabled || !data.secretKey || !data.webhookSecret) continue;
    configs.push({
      tenantId,
      secretKey: String(data.secretKey),
      webhookSecret: String(data.webhookSecret),
    });
  }

  return configs;
}

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
    }

    const body = await req.text();
    const configs = await loadStripeConfigs();
    let matchedEvent: any | null = null;
    let matchedConfig: StripeConfig | null = null;

    for (const config of configs) {
      try {
        const verified = verifyStripeEvent(body, signature, config.webhookSecret);
        if (verified) {
          matchedEvent = verified;
          matchedConfig = config;
          break;
        }
      } catch (err) {
        continue;
      }
    }

    if (!matchedEvent || !matchedConfig) {
      return NextResponse.json({ ok: false, error: "Signature verification failed." }, { status: 400 });
    }

    if (matchedEvent.type !== "checkout.session.completed" && matchedEvent.type !== "payment_intent.succeeded") {
      return NextResponse.json({ ok: true, received: true });
    }

    const eventObject = matchedEvent?.data?.object || {};
    const sessionId =
      matchedEvent.type === "checkout.session.completed" && typeof eventObject.id === "string" ? eventObject.id : null;
    const paymentIntentId =
      matchedEvent.type === "payment_intent.succeeded" && typeof eventObject.id === "string" ? eventObject.id : null;

    if (!sessionId && !paymentIntentId) {
      return NextResponse.json({ ok: true, received: true });
    }

    const requestSnap = sessionId
      ? await adminDb
          .collection("paymentRequests")
          .where("stripeSessionId", "==", sessionId)
          .limit(1)
          .get()
      : null;
    const legacySnap =
      sessionId && requestSnap?.empty
        ? await adminDb.collection("paymentRequests").where("stripeCheckoutSessionId", "==", sessionId).limit(1).get()
        : null;

    const requestDoc = requestSnap?.docs?.[0] || legacySnap?.docs?.[0];
    if (!requestDoc) {
      return NextResponse.json({ ok: true, received: true });
    }

    const requestData = requestDoc.data() || {};
    const tenantId = String(requestData.tenantId || matchedConfig.tenantId || "");
    const leadId = String(requestData.leadId || "");
    const amountUsd = Number(requestData.amountUsd || 0);

    await requestDoc.ref.set(
      {
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const paymentRef = adminDb.collection("payments").doc();
    await paymentRef.set({
      id: paymentRef.id,
      tenantId,
      invoiceId: requestDoc.id,
      leadId,
      amountUsd,
      currency: "USD",
      provider: "stripe",
      providerPaymentId: paymentIntentId || sessionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const leadSnap = leadId ? await adminDb.collection("leads").doc(leadId).get() : null;
    const lead = leadSnap?.exists ? leadSnap.data() || {} : {};
    const companyName = String(lead.companyName || "");
    const contactName = String(lead.contactName || lead.name || "");
    const ownerId = String(lead.ownerId || "");

    const [managerIds, adminIds, financeIds] = await Promise.all([
      getUserIdsByRoles(["sales_manager"], tenantId),
      getUserIdsByRoles(["admin", "super_admin"], tenantId),
      getUserIdsByRoles(["finance"], tenantId),
    ]);

    const notificationTargets = new Set([ownerId, ...managerIds, ...adminIds, ...financeIds].filter(Boolean));
    const message = `Payment received: $${amountUsd.toLocaleString()} — ${companyName || "Lead"}${
      contactName ? ` (${contactName})` : ""
    }`;

    await Promise.all(
      Array.from(notificationTargets).map((uid) => {
        const roleLink = managerIds.includes(uid)
          ? `/sales-manager/leads?open=${leadId}`
          : adminIds.includes(uid)
          ? `/admin/finance/invoices?open=${requestDoc.id}`
          : financeIds.includes(uid)
          ? `/finance/invoices?open=${requestDoc.id}`
          : `/sales/leads?open=${leadId}`;
        return createNotification({
          toUserId: uid,
          title: "Payment received",
          body: message,
          type: "success",
          entityType: "payment",
          entityId: paymentRef.id,
          deepLink: roleLink,
        });
      })
    );

    await adminDb.collection("events").add({
      type: "sales.payment_received",
      title: "Payment received",
      description: message,
      entityType: "payment",
      entityId: paymentRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        leadId,
        invoiceId: requestDoc.id,
        paidAt: toISO(new Date()),
      },
    });

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    console.error("stripe webhook error:", err);
    return NextResponse.json({ ok: false, error: "Webhook error." }, { status: 500 });
  }
}

function verifyStripeEvent(payload: string, signatureHeader: string, secret: string) {
  const elements = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = elements.find((part) => part.startsWith("t="));
  const signatureParts = elements.filter((part) => part.startsWith("v1="));
  if (!timestampPart || signatureParts.length === 0) return null;

  const timestamp = timestampPart.split("=")[1];
  if (!timestamp) return null;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  const signatures = signatureParts.map((part) => part.split("=")[1]).filter(Boolean);

  if (!signatures.includes(expected)) return null;

  try {
    return JSON.parse(payload);
  } catch (err) {
    return null;
  }
}
