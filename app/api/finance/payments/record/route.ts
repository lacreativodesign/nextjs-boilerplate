import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseNumber, parseString, requireFinance, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { assertPermission, Permission } from "@/lib/permissions";
import { normalizeInvoiceStatus } from "@/lib/finance/status";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    try {
      assertPermission(auth.user.role, Permission.MarkPaymentPaid);
    } catch {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const invoiceId = parseString(body?.invoiceId).trim();
    const method = parseString(body?.method || "manual").trim().toLowerCase();
    const reference = parseString(body?.reference).trim();
    const allowedMethods = new Set(["manual", "bank", "stripe_future"]);
    if (!allowedMethods.has(method)) {
      return NextResponse.json({ ok: false, error: "Invalid payment method." }, { status: 400 });
    }

    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: "Invoice id is required." }, { status: 400 });
    }

    const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
    let invoiceData: Record<string, any>;
    let paymentRef: FirebaseFirestore.DocumentReference;

    await adminDb.runTransaction(async (tx) => {
      const invoiceSnap = await tx.get(invoiceRef);
      if (!invoiceSnap.exists) {
        throw new Error("Invoice not found.");
      }
      invoiceData = invoiceSnap.data() || {};
      if (String(invoiceData.tenantId || "") !== auth.tenantId) {
        throw new Error("Forbidden");
      }

      const currentStatus = normalizeInvoiceStatus(invoiceData.status);
      if (currentStatus === "paid") {
        throw new Error("Paid invoices are immutable.");
      }
      if (currentStatus === "void") {
        throw new Error("Void invoices cannot accept payments.");
      }
      if (currentStatus !== "issued") {
        throw new Error("Only issued invoices can accept payments.");
      }

      const totalAmount = Number(invoiceData.totalAmount ?? invoiceData.amountTotalUsd ?? 0);
      const paymentAmount = parseNumber(body?.amount, totalAmount);
      if (paymentAmount <= 0 || paymentAmount !== totalAmount) {
        throw new Error("Payment amount must equal the invoice total.");
      }

      paymentRef = adminDb.collection("payments").doc();
      const now = serverTimestamp();
      const invoiceNumber = String(invoiceData.invoiceNumber || invoiceData.orderId || invoiceId);
      tx.set(paymentRef, {
        id: paymentRef.id,
        tenantId: auth.tenantId,
        invoiceId,
        orderId: invoiceNumber,
        clientId: invoiceData.clientId || null,
        clientName: invoiceData.clientName || null,
        amount: paymentAmount,
        amountUsd: paymentAmount,
        currency: "USD",
        method,
        reference: reference || null,
        status: "succeeded",
        receivedBy: { uid: auth.user.uid, role: auth.user.role },
        receivedAt: now,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });

      tx.update(invoiceRef, {
        status: "paid",
        paidAt: now,
        updatedAt: now,
        totalPaid: paymentAmount,
        balanceDue: 0,
      });
    });

    const invoiceNumber = String(invoiceData.invoiceNumber || invoiceData.orderId || invoiceId);
    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";

    const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"], auth.tenantId);
    await Promise.all(
      financeIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Payment recorded",
          body: `Payment recorded for invoice ${invoiceNumber}.`,
          type: "success",
          entityType: "payment",
          entityId: paymentRef?.id || null,
          deepLink: "/finance/payments",
          createdBy: { uid: auth.user.uid, name: actorName },
          tenantId: auth.tenantId,
          roleTarget: "finance",
        })
      )
    );

    const paidAtIso = new Date().toISOString();
    await logEvent({
      tenantId: auth.tenantId,
      type: "finance.payment_recorded",
      title: "Payment recorded",
      description: `Payment recorded for invoice ${invoiceNumber}.`,
      entityType: "payment",
      entityId: paymentRef?.id || null,
      actor: { uid: auth.user.uid, name: actorName },
      metadata: {
        before: null,
        after: {
          id: paymentRef?.id || null,
          invoiceId,
          amount: Number(invoiceData.totalAmount ?? invoiceData.amountTotalUsd ?? 0),
          method,
          reference: reference || null,
          receivedAt: paidAtIso,
        },
      },
    });

    await logEvent({
      tenantId: auth.tenantId,
      type: "finance.invoice_paid",
      title: "Invoice paid",
      description: `Invoice ${invoiceNumber} marked paid.`,
      entityType: "invoice",
      entityId: invoiceId,
      actor: { uid: auth.user.uid, name: actorName },
      metadata: {
        before: invoiceData,
        after: { ...invoiceData, status: "paid", paidAt: paidAtIso },
        paymentId: paymentRef?.id || null,
      },
    });

    return NextResponse.json({ ok: true, id: paymentRef?.id || null });
  } catch (err: any) {
    console.error("finance/payments record error:", err);
    const message = String(err?.message || "Unable to record payment.");
    const safeMessage = message === "Forbidden" ? "Forbidden" : message;
    const status = safeMessage === "Forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: safeMessage }, { status });
  }
}
