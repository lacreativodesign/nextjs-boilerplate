import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createFinanceEvent,
  parseString,
  queueFinanceEmail,
  requireFinance,
  serverTimestamp,
} from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/security";
import { assertPermission, Permission } from "../../../../lib/permissions";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import {
  computeBalanceDue,
  computeInvoiceStatus,
  normalizeInvoiceStatus,
  parseInvoiceStatus,
} from "@/lib/finance/status";
import { maybeAutoCreateProjectFromInvoice } from "@/lib/finance/invoiceActions";
import { normalizeRole } from "../../../admin/_utils";
import { sendBizostoEventNotification } from "@/lib/integrations/slack";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = parseString(body?.id).trim();
    const action = parseString(body?.action).trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "Invoice id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("invoices").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
    }

    const invoice = snap.data() || {};
    const clientId = String(invoice.clientId || "");
    const clientName = String(invoice.clientName || "");
    const orderId = String(invoice.orderId || "");
    const isSuperAdmin = normalizeRole(auth.user.role || "") === "super_admin";
    const tenantId = normalizeTenantId(auth.user.tenantId);

    if (!isSuperAdmin && docTenantId(invoice) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (action === "mark_paid") {
      try {
        assertPermission(auth.user.role, Permission.MarkPaymentPaid);
      } catch {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }

      const currentStatus = normalizeInvoiceStatus(invoice.status);
      if (currentStatus === "void") {
        return NextResponse.json({ ok: false, error: "Void invoices cannot be marked paid." }, { status: 400 });
      }

      const amountTotal = Number(invoice.amountTotalUsd || 0);
      const nextPaid = amountTotal;
      const nextStatus = computeInvoiceStatus({
        currentStatus: invoice.status,
        totalPaid: nextPaid,
        totalAmount: amountTotal,
      });
      const balanceDue = computeBalanceDue(amountTotal, nextPaid);

      await ref.update({
        status: nextStatus,
        totalPaid: nextPaid,
        balanceDue,
        paidAt: nextStatus === "paid" ? serverTimestamp() : invoice.paidAt || null,
        updatedAt: serverTimestamp(),
      });

      const paymentId = parseString(body?.paymentId).trim();
      if (paymentId) {
        const paymentRef = adminDb.collection("payments").doc(paymentId);
        const paymentSnap = await paymentRef.get();
        if (!paymentSnap.exists) {
          return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
        }
        const paymentData = paymentSnap.data() || {};
        if (!isSuperAdmin && docTenantId(paymentData) !== tenantId) {
          return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }
        await paymentRef.set(
          {
            status: "succeeded",
            paidAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
      const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"]);
      await Promise.all(
        financeIds.map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Invoice paid",
            body: `Invoice ${orderId || id} marked paid.`,
            type: "success",
            entityType: "invoice",
            entityId: id,
            deepLink: "/finance/invoices",
            createdBy: { uid: auth.user.uid, name: actorName },
            roleTarget: "finance",
            tenantId: auth.user.tenantId || null,
          })
        )
      );

      await createFinanceEvent({
        type: "finance.invoice_paid",
        title: "Invoice marked paid",
        description: `Invoice ${orderId || id} marked paid.`,
        entityType: "invoice",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: actorName,
        tenantId: auth.user.tenantId,
      });

      try {
        await logEvent({
          type: "finance.invoice_paid",
          title: "Invoice marked paid",
          description: `Invoice ${orderId || id} marked paid.`,
          entityType: "invoice",
          entityId: id,
          actor: { uid: auth.user.uid, name: actorName },
          metadata: {
            ip: getClientIp(req),
            userAgent: req.headers.get("user-agent") || "",
          },
          audit: {
            action: "update",
            resource: "invoice",
            resourceId: id,
            changes: [
              { field: "status", oldValue: invoice.status || null, newValue: nextStatus },
              { field: "totalPaid", oldValue: invoice.totalPaid || 0, newValue: nextPaid },
              { field: "balanceDue", oldValue: invoice.balanceDue || 0, newValue: balanceDue },
              { field: "paidAt", oldValue: invoice.paidAt || null, newValue: nextStatus === "paid" ? "serverTimestamp" : null },
            ],
          },
        });
      } catch (auditError) {
        console.error("audit log error:", auditError);
      }

      if (nextStatus === "paid") {
        try {
          await maybeAutoCreateProjectFromInvoice({
            invoiceId: id,
            invoiceData: { ...invoice, totalPaid: nextPaid, balanceDue, status: nextStatus },
            tenantId: String(invoice.tenantId || tenantId || ""),
            actor: { uid: auth.user.uid, name: actorName },
          });
        } catch (autoCreateError) {
          console.error("project auto-create error:", autoCreateError);
        }

        await sendBizostoEventNotification({
          type: "invoice_paid",
          tenantId: String(invoice.tenantId || tenantId || ""),
          invoiceNumber: orderId || id,
          amountLabel: `${invoice.currency || "USD"} ${amountTotal.toFixed(2)}`,
        }).catch((error) => {
          console.error("slack invoice notification failed:", error);
        });
      }

      const clientSnap = clientId ? await adminDb.collection("clients").doc(clientId).get() : null;
      const email = clientSnap?.exists ? String(clientSnap.data()?.primaryContactEmail || "") : "";
      if (email) {
        queueFinanceEmail({
          to: email,
          template: "payment_received",
          subject: "Payment received",
          data: { invoiceId: id, orderId, clientName },
          tenantId: auth.user.tenantId,
        }).catch((error) => {
          console.error("payment email queue error:", error);
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "update_status") {
      const requested = parseInvoiceStatus(body?.status);
      if (!requested) {
        return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
      }
      if (requested === "paid") {
        return NextResponse.json({ ok: false, error: "Use mark_paid to record payments." }, { status: 400 });
      }
      if (requested === "void" && normalizeInvoiceStatus(invoice.status) === "paid") {
        return NextResponse.json({ ok: false, error: "Paid invoices cannot be voided." }, { status: 400 });
      }
      await ref.update({
        status: requested,
        updatedAt: serverTimestamp(),
      });
      try {
        const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
        await logEvent({
          type: "finance.invoice_status_updated",
          title: "Invoice status updated",
          description: `Invoice ${orderId || id} status updated to ${requested}.`,
          entityType: "invoice",
          entityId: id,
          actor: { uid: auth.user.uid, name: actorName },
          metadata: {
            ip: getClientIp(req),
            userAgent: req.headers.get("user-agent") || "",
          },
          audit: {
            action: "update",
            resource: "invoice",
            resourceId: id,
            changes: [{ field: "status", oldValue: invoice.status || null, newValue: requested }],
          },
        });
      } catch (auditError) {
        console.error("audit log error:", auditError);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
  } catch (err: any) {
    console.error("finance/invoices update error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to update invoice.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
