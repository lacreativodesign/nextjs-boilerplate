import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, queueFinanceEmail, requireAdmin, parseString, serverTimestamp } from "../../_utils";
import { logEvent } from "@/lib/audit";
import { assertPermission, Permission } from "../../../../../lib/permissions";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import {
  computeBalanceDue,
  computeInvoiceStatus,
  normalizeInvoiceStatus,
  normalizePaymentStatus,
} from "@/lib/finance/status";
import { maybeAutoCreateProjectFromInvoice } from "@/lib/finance/invoiceActions";
import { createNotification, getUserIdsByRoles } from "../../../../../../lib/notifications";
import { normalizeRole } from "../../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = parseString(body?.id).trim();
    const action = parseString(body?.action).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Payment id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("payments").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
    }

    const payment = snap.data() || {};
    const invoiceId = String(payment.invoiceId || "");
    const clientId = String(payment.clientId || "");
    const clientName = String(payment.clientName || "");
    const isSuperAdmin = normalizeRole(auth.user.role || "") === "super_admin";
    const tenantId = normalizeTenantId(auth.user.tenantId);

    if (!isSuperAdmin && docTenantId(payment) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (action === "mark_paid") {
      try {
        assertPermission(auth.user.role, Permission.MarkPaymentPaid);
      } catch {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }

      let invoiceStatusBefore = "";
      let invoiceStatusAfter = "";
      let invoiceSnapshotData: Record<string, any> | null = null;
      let invoiceTenantId: string | null = null;
      let paymentAlreadySucceeded = false;

      try {
        await adminDb.runTransaction(async (tx) => {
          const paymentSnap = await tx.get(ref);
          if (!paymentSnap.exists) {
            throw new Error("Payment not found.");
          }

          const paymentData = paymentSnap.data() || {};
          const currentPaymentStatus = normalizePaymentStatus(paymentData.status);
          if (currentPaymentStatus === "succeeded") {
            paymentAlreadySucceeded = true;
            return;
          }

          tx.update(ref, {
            status: "succeeded",
            paidAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (!invoiceId) {
            return;
          }

          const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
          const invoiceSnap = await tx.get(invoiceRef);
          if (!invoiceSnap.exists) {
            return;
          }

          const invoice = invoiceSnap.data() || {};
          const invoiceStatus = normalizeInvoiceStatus(invoice.status);
          invoiceStatusBefore = invoiceStatus;
          invoiceTenantId = String(invoice.tenantId || auth.user.tenantId || "");
          if (!isSuperAdmin && docTenantId(invoice) !== tenantId) {
            throw new Error("Forbidden");
          }
          if (invoiceStatus === "void") {
            throw new Error("Void invoices cannot accept payments.");
          }

          const amountTotal = Number(invoice.amountTotalUsd || 0);
          const existingPaid = Number(invoice.totalPaid || 0);
          const paymentAmount = Number(paymentData.amountUsd || 0);
          const nextPaid = existingPaid + paymentAmount;
          const nextStatus = computeInvoiceStatus({
            currentStatus: invoice.status,
            totalPaid: nextPaid,
            totalAmount: amountTotal,
          });
          const balanceDue = computeBalanceDue(amountTotal, nextPaid);

          invoiceStatusAfter = nextStatus;
          invoiceSnapshotData = { ...invoice, totalPaid: nextPaid, balanceDue, status: nextStatus };

          tx.set(
            invoiceRef,
            {
              totalPaid: nextPaid,
              balanceDue,
              status: nextStatus,
              paidAt: nextStatus === "paid" ? serverTimestamp() : invoice.paidAt || null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
      } catch (updateError: any) {
        console.error("finance/payments update transaction error:", updateError);
        const message = String(updateError?.message || "");
        if (message.toLowerCase().includes("forbidden")) {
          return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.json({ ok: false, error: "Unable to update payment." }, { status: 500 });
      }

      if (!paymentAlreadySucceeded && invoiceId && invoiceStatusAfter === "paid" && invoiceStatusBefore !== "paid" && invoiceSnapshotData) {
        try {
          await maybeAutoCreateProjectFromInvoice({
            invoiceId,
            invoiceData: invoiceSnapshotData,
            tenantId: invoiceTenantId,
            actor: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || auth.user.displayName || "" },
          });
        } catch (autoCreateError) {
          console.error("project auto-create error:", autoCreateError);
        }
      }

      if (paymentAlreadySucceeded) {
        return NextResponse.json({ ok: true });
      }

      await createFinanceEvent({
        type: "finance.payment_paid",
        title: "Payment marked paid",
        description: `Payment ${id} marked paid for ${clientName || "client"}.`,
        entityType: "payment",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: auth.user.name || auth.user.fullName || auth.user.displayName || "",
        tenantId: auth.user.tenantId,
      });

      try {
        await logEvent({
          type: "finance.payment_paid",
          title: "Payment marked paid",
          description: `Payment ${id} marked paid for ${clientName || "client"}.`,
          entityType: "payment",
          entityId: id,
          actor: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || auth.user.displayName || "" },
        });
      } catch (auditError) {
        console.error("audit log error:", auditError);
      }

      try {
        const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"], auth.user.tenantId || null);
        await Promise.all(
          financeIds.map((uid) =>
            createNotification({
              toUserId: uid,
              title: "Payment received",
              body: `Payment ${id} marked paid for ${clientName || "client"}.`,
              type: "success",
              entityType: "payment",
              entityId: id,
              deepLink: "/admin/finance/payments",
              createdBy: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || auth.user.displayName || "" },
              roleTarget: "finance",
              tenantId: auth.user.tenantId || null,
            })
          )
        );
      } catch (notifyError) {
        console.error("payment notification error:", notifyError);
      }

      const clientSnap = clientId ? await adminDb.collection("clients").doc(clientId).get() : null;
      const email = clientSnap?.exists ? String(clientSnap.data()?.primaryContactEmail || "") : "";
      if (email) {
        queueFinanceEmail({
          to: email,
          template: "payment_received",
          subject: "Payment received",
          data: { paymentId: id, invoiceId },
          tenantId: auth.user.tenantId,
        }).catch((error) => {
          console.error("payment email queue error:", error);
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "refund") {
      await ref.update({
        status: "refunded",
        updatedAt: serverTimestamp(),
      });

      await createFinanceEvent({
        type: "finance.payment_refunded",
        title: "Payment refunded",
        description: `Payment ${id} refunded for ${clientName || "client"}.`,
        entityType: "payment",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: auth.user.name || auth.user.fullName || auth.user.displayName || "",
        tenantId: auth.user.tenantId,
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
  } catch (err: any) {
    console.error("finance/payments update error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to update payment.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
