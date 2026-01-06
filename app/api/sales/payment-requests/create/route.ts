import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import {
  createSalesEvent,
  parseNumber,
  parseString,
  requireSalesWrite,
  serverTimestamp,
  userLabel,
} from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStripeConfig(tenantId: string) {
  const snap = await adminDb.collection("tenants").doc(tenantId).collection("integrations").doc("stripe").get();
  if (!snap.exists) return null;
  return snap.data() || null;
}

async function createStripeCheckoutSession({
  secretKey,
  successUrl,
  cancelUrl,
  amountUsd,
  customerEmail,
  packageLabel,
}: {
  secretKey: string;
  successUrl: string;
  cancelUrl: string;
  amountUsd: number;
  customerEmail?: string | null;
  packageLabel: string;
}) {
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", successUrl);
  params.append("cancel_url", cancelUrl);
  if (customerEmail) {
    params.append("customer_email", customerEmail);
  }
  params.append("line_items[0][quantity]", "1");
  params.append("line_items[0][price_data][currency]", "usd");
  params.append("line_items[0][price_data][unit_amount]", String(Math.round(amountUsd * 100)));
  params.append("line_items[0][price_data][product_data][name]", packageLabel);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || "Stripe session creation failed.";
    throw new Error(message);
  }
  return data as { id: string; url?: string | null };
}

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const leadId = parseString(body.leadId, "");
    const amountUsd = parseNumber(body.amountUsd, 0);
    const packageLabel = parseString(body.packageLabel, "").trim();
    const services = Array.isArray(body.services)
      ? body.services.map((item: any) => parseString(item, "").trim()).filter(Boolean)
      : [];

    if (!leadId) {
      return NextResponse.json({ ok: false, error: "Lead is required." }, { status: 400 });
    }
    if (amountUsd <= 0) {
      return NextResponse.json({ ok: false, error: "Amount must be greater than 0." }, { status: 400 });
    }

    const tenantId = auth.user.tenantId || "";
    const leadSnap = await adminDb.collection("leads").doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }
    const lead = leadSnap.data() || {};
    if (lead.tenantId && lead.tenantId !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (auth.user.role === "sales" && lead.ownerId !== auth.user.uid) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const stripeConfig = await getStripeConfig(tenantId);
    const stripeEnabled = Boolean(stripeConfig?.enabled && stripeConfig?.secretKey);
    let status: "sent" | "draft" = stripeEnabled ? "sent" : "draft";

    let stripeSessionId: string | null = null;
    let stripeCheckoutUrl: string | null = null;
    let notice: string | null = null;

    if (stripeEnabled) {
      const origin = new URL(req.url).origin;
      const successUrl = `${origin}/sales/leads?payment=success`;
      const cancelUrl = `${origin}/sales/leads?payment=cancel`;
      const label = packageLabel || `Payment for ${lead.companyName || lead.contactName || "Lead"}`;
      try {
        const session = await createStripeCheckoutSession({
          secretKey: String(stripeConfig.secretKey),
          successUrl,
          cancelUrl,
          amountUsd,
          customerEmail: lead.contactEmail || lead.email || null,
          packageLabel: label,
        });
        stripeSessionId = session.id;
        stripeCheckoutUrl = session.url || null;
      } catch (err) {
        console.error("Stripe session error:", err);
        status = "draft";
        notice = "Stripe is configured but unavailable. Payment request saved as draft.";
      }
    }

    const requestRef = adminDb.collection("paymentRequests").doc();
    await requestRef.set({
      id: requestRef.id,
      tenantId,
      leadId,
      createdById: auth.user.uid,
      packageLabel,
      services,
      amountUsd,
      currency: "USD",
      status,
      provider: "stripe",
      stripeCheckoutUrl,
      stripeSessionId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      paidAt: null,
    });

    await adminDb
      .collection("leads")
      .doc(leadId)
      .set(
        {
          paymentRequestsCount: admin.firestore.FieldValue.increment(1),
          lastActivityAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

    const salesName = userLabel(auth.user);
    await createSalesEvent({
      type: stripeEnabled ? "payment_request_sent" : "payment_request_created",
      title: stripeEnabled ? "Payment request sent" : "Payment request created",
      description: `${salesName} created a payment request for $${amountUsd.toLocaleString()}.`,
      entityType: "payment",
      entityId: requestRef.id,
      createdByUid: auth.user.uid,
      createdByName: salesName,
      metadata: { leadId },
    });

    const [managerIds, adminIds, financeIds] = await Promise.all([
      getUserIdsByRoles(["sales_manager"], tenantId),
      getUserIdsByRoles(["admin", "super_admin"], tenantId),
      getUserIdsByRoles(["finance"], tenantId),
    ]);
    const ownerId = String(lead.ownerId || "");
    const notifyTargets = Array.from(new Set([ownerId, ...managerIds, ...adminIds, ...financeIds].filter(Boolean)));

    await Promise.all(
      notifyTargets.map((uid) =>
        createNotification({
          toUserId: uid,
          title: stripeEnabled ? "Payment request sent" : "Payment request created",
          body: `${salesName} created a payment request for $${amountUsd.toLocaleString()}.`,
          type: "info",
          entityType: "payment",
          entityId: requestRef.id,
          deepLink: managerIds.includes(uid)
            ? `/sales-manager/leads?open=${leadId}`
            : adminIds.includes(uid)
            ? `/admin/finance/invoices?open=${requestRef.id}`
            : financeIds.includes(uid)
            ? `/finance/invoices?open=${requestRef.id}`
            : `/sales/leads?open=${leadId}`,
          createdBy: { uid: auth.user.uid, name: salesName },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      id: requestRef.id,
      status,
      stripeCheckoutUrl,
      notice: notice || (stripeEnabled ? null : "Stripe not configured. Payment request saved as draft."),
    });
  } catch (err) {
    console.error("sales payment request create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create payment request." }, { status: 500 });
  }
}
