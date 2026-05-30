import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, queueFinanceEmail, requireAdmin, parseString, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles, type NotificationEntityType } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/security";
import { assertPermission, Permission } from "../../../../../lib/permissions";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import {
  computeBalanceDue,
  computeInvoiceStatus,
  normalizeInvoiceStatus,
  parseInvoiceStatus,
} from "@/lib/finance/status";
import { maybeAutoCreateProjectFromInvoice } from "@/lib/finance/invoiceActions";
import { normalizeRole } from "../../../_utils";
import { dispatchWebhookEvent } from "@/lib/webhooks/webhook-delivery";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    const authUser = auth.user as { uid: string; role: string; tenantId: string | null; email?: string | null; name?: string | null; fullName?: string | null; displayName?: string | null };

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
    const isSuperAdmin = normalizeRole(authUser.role || "") === "super_admin";
    const tenantId = normalizeTenantId(authUser.tenantId as string | null | undefined);

    if (!isSuperAdmin && docTenantId(invoice) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (action === "send") {
      await ref.update({
        status: "issued",
        issuedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const actorName = authUser.name || authUser.fullName || authUser.displayName || "";
      const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"], authUser.tenantId || null);
      await Promise.all(
        financeIds.map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Invoice sent",
            body: `Invoice ${orderId || id} sent to ${clientName || "client"}.`,
            type: "info",
            entityType: "invoice" as NotificationEntityType,
            entityId: id,
            deepLink: "/admin/finance/invoices",
            createdBy: { uid: authUser.uid, name: actorName },
            roleTarget: "finance",
            tenantId: authUser.tenantId || null,
          })
        )
      );

      await createFinanceEvent({
        type: "finance.invoice_sent",
        title: "Invoice sent",
        description: `Invoice ${orderId || id} sent to ${clientName || "client"}.`,
        entityType: "invoice" as NotificationEntityType,
        entityId: id,
        createdByUid: authUser.uid,
        createdByName: actorName,
        tenantId: authUser.tenantId,
      });

      try {
        await logEvent({
          type: "finance.invoice_sent",
          title: "Invoice sent",
          description: `Invoice ${orderId || id} sent to ${clientName || "client"}.`,
          entityType: "invoice" as NotificationEntityType,
          entityId: id,
          actor: { uid: authUser.uid, name: actorName },
          metadata: {
            ip: getClientIp(req),
            userAgent: req.headers.get("user-agent") || "",
          },
          audit: {
            action: "update",
            resource: "invoice",
            resourceId: id,
            changes: [
              { field: "status", oldValue: invoice.status || null, newValue: "issued" },
              { field: "issuedAt", oldValue: invoice.issuedAt || null, newValue: "serverTimestamp" },
            ],
          },
        });
      } catch (auditError) {
        console.error("audit log error:", auditError);
      }

      const clientSnap = clientId ? await adminDb.collection("clients").doc(clientId).get() : null;
      const email = clientSnap?.exists ? String(clientSnap.data()?.primaryContactEmail || "") : "";
      if (email) {
        queueFinanceEmail({
          to: email,
          template: "invoice_sent",
          subject: "Your invoice is ready",
          data: { invoiceId: id, orderId, clientName },
          tenantId: authUser.tenantId,
        }).catch((error) => {
          console.error("invoice email queue error:", error);
        });
      }

      try {
        await dispatchWebhookEvent({
          tenantId,
          event: "invoice.updated",
          entityType: "invoice" as NotificationEntityType,
          entityId: id,
          payload: { invoiceId: id, orderId, status: "issued", action: "send" },
          actor: { uid: authUser.uid, email: authUser.email || null, role: authUser.role || null },
        });
      } catch (webhookError) {
        console.error("invoice.updated webhook dispatch error:", webhookError);
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "mark_paid") {
      try {
        assertPermission(authUser.role, Permission.MarkPaymentPaid);
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

      const actorName = authUser.name || authUser.fullName || authUser.displayName || "";
      const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"]);
      await Promise.all(
        financeIds.map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Invoice paid",
            body: `Invoice ${orderId || id} marked paid.`,
            type: "success",
            entityType: "invoice" as NotificationEntityType,
            entityId: id,
            deepLink: "/admin/finance/invoices",
            createdBy: { uid: authUser.uid, name: actorName },
            roleTarget: "finance",
            tenantId: authUser.tenantId || null,
          })
        )
      );

      await createFinanceEvent({
        type: "finance.invoice_paid",
        title: "Invoice marked paid",
        description: `Invoice ${orderId || id} marked paid.`,
        entityType: "invoice" as NotificationEntityType,
        entityId: id,
        createdByUid: authUser.uid,
        createdByName: actorName,
        tenantId: authUser.tenantId,
      });

      try {
        await logEvent({
          type: "finance.invoice_paid",
          title: "Invoice marked paid",
          description: `Invoice ${orderId || id} marked paid.`,
          entityType: "invoice" as NotificationEntityType,
          entityId: id,
          actor: { uid: authUser.uid, name: actorName },
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
            actor: { uid: authUser.uid, name: actorName },
          });
        } catch (autoCreateError) {
          console.error("project auto-create error:", autoCreateError);
        }
      }

      const clientSnap = clientId ? await adminDb.collection("clients").doc(clientId).get() : null;
      const email = clientSnap?.exists ? String(clientSnap.data()?.primaryContactEmail || "") : "";
      if (email) {
        queueFinanceEmail({
          to: email,
          template: "payment_received",
          subject: "Payment received",
          data: { invoiceId: id, orderId, clientName },
          tenantId: authUser.tenantId,
        }).catch((error) => {
          console.error("payment email queue error:", error);
        });
      }

      try {
        await dispatchWebhookEvent({
          tenantId,
          event: "invoice.paid",
          entityType: "invoice" as NotificationEntityType,
          entityId: id,
          payload: { invoiceId: id, orderId, status: nextStatus, action: "mark_paid", balanceDue },
          actor: { uid: authUser.uid, email: authUser.email || null, role: authUser.role || null },
        });
        await dispatchWebhookEvent({
          tenantId,
          event: "payment.received",
          entityType: "payment",
          entityId: parseString(body?.paymentId).trim() || id,
          payload: { invoiceId: id, orderId, status: "succeeded", amountTotal },
          actor: { uid: authUser.uid, email: authUser.email || null, role: authUser.role || null },
        });
      } catch (webhookError) {
        console.error("invoice.paid/payment.received webhook dispatch error:", webhookError);
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "update_status") {
      const requested = parseInvoiceStatus(body?.status);
      if (!requested) {
        return NextResponse.json({ ok: false, error: "Status is required." }, { status: 400 });
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
        await logEvent({
          type: "finance.invoice_status_updated",
          title: "Invoice status updated",
          description: `Invoice ${orderId || id} status updated to ${requested}.`,
          entityType: "invoice" as NotificationEntityType,
          entityId: id,
          actor: { uid: authUser.uid, name: authUser.name || authUser.fullName || authUser.displayName || "" },
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
      try {
        await dispatchWebhookEvent({
          tenantId,
          event: "invoice.updated",
          entityType: "invoice" as NotificationEntityType,
          entityId: id,
          payload: { invoiceId: id, orderId, status: requested, action: "update_status" },
          actor: { uid: authUser.uid, email: authUser.email || null, role: authUser.role || null },
        });
      } catch (webhookError) {
        console.error("invoice.updated webhook dispatch error:", webhookError);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
  } catch (err) {
    console.error("finance/invoices update error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to update invoice.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
