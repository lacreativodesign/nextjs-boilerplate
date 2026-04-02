import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createFinanceEvent,
  parseString,
  queueFinanceEmail,
  requireFinance,
  serverTimestamp,
} from "../../_utils";
import { createNotification, getUserIdsByRoles, getUsersByRoles } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/email-service";
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

      // Email finance + admin on invoice paid — non-blocking
      getUsersByRoles(['finance', 'admin'], auth.user.tenantId || '').then((recipients) => {
        return Promise.all(recipients.map((recipient) =>
          sendEmail({
            to: recipient.email || '',
            subject: `✅ Invoice paid — ${orderId || id}`,
            html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Finance Update</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#059669;">✅ Invoice Marked Paid</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">A payment has been recorded in your workspace.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Invoice</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${orderId || id}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Amount</td><td style="font-weight:700;color:#059669;text-align:right;border-bottom:1px solid #F1F5F9;">$${Number(invoice.amountTotalUsd || 0).toFixed(2)}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Marked by</td><td style="font-weight:600;color:#1E293B;text-align:right;">${actorName || 'Finance'}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/finance/invoices" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Finance →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto ERP · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table></td></tr></table></body></html>`,
          }).catch(() => {})
        ));
      }).catch((err) => console.error('[INVOICE_PAID] Failed to notify finance', err));

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
