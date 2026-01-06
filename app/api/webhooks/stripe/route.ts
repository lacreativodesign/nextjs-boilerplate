import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { toISO } from "../../sales/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const requestId = String(body?.paymentRequestId || body?.requestId || body?.id || "");

    if (!requestId) {
      return NextResponse.json({ ok: false, error: "Missing paymentRequestId." }, { status: 400 });
    }

    const requestRef = adminDb.collection("paymentRequests").doc(requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      return NextResponse.json({ ok: false, error: "Payment request not found." }, { status: 404 });
    }

    const requestData = requestSnap.data() || {};
    const tenantId = String(requestData.tenantId || "");
    const leadId = String(requestData.leadId || "");
    const amountUsd = Number(requestData.amountUsd || 0);

    await requestRef.set(
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
      invoiceId: requestId,
      leadId,
      amountUsd,
      currency: "USD",
      provider: String(requestData.paymentProvider || "manual"),
      providerPaymentId: String(body?.providerPaymentId || body?.paymentIntentId || requestId),
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
    const message = `Payment received $${amountUsd.toLocaleString()}${
      companyName ? ` — ${companyName}` : ""
    }${contactName ? ` (${contactName})` : ""}`;

    await Promise.all(
      Array.from(notificationTargets).map((uid) => {
        const roleLink = managerIds.includes(uid)
          ? `/sales-manager/leads?open=${leadId}`
          : adminIds.includes(uid)
          ? `/admin/finance/invoices?open=${requestId}`
          : financeIds.includes(uid)
          ? `/finance/invoices?open=${requestId}`
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
        invoiceId: requestId,
        paidAt: toISO(new Date()),
      },
    });

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    console.error("payment webhook error:", err);
    return NextResponse.json({ ok: false, error: "Webhook error." }, { status: 500 });
  }
}
