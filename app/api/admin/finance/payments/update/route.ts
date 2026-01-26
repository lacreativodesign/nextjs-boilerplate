import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, queueFinanceEmail, requireAdmin, parseString, serverTimestamp } from "../../_utils";
import { logEvent } from "@/lib/audit";
import { assertPermission, Permission } from "../../../../../lib/permissions";

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

    if (action === "mark_paid") {
      try {
        assertPermission(auth.user.role, Permission.MarkPaymentPaid);
      } catch {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }

      await ref.update({
        status: "Paid",
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (invoiceId) {
        await adminDb.collection("invoices").doc(invoiceId).set(
          {
            status: "Paid",
            paidAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await createFinanceEvent({
        type: "finance.payment_paid",
        title: "Payment marked paid",
        description: `Payment ${id} marked paid for ${clientName || "client"}.`,
        entityType: "payment",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: auth.user.name || auth.user.fullName || auth.user.displayName || "",
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

      const clientSnap = clientId ? await adminDb.collection("clients").doc(clientId).get() : null;
      const email = clientSnap?.exists ? String(clientSnap.data()?.primaryContactEmail || "") : "";
      if (email) {
        await queueFinanceEmail({
          to: email,
          template: "payment_received",
          subject: "Payment received",
          data: { paymentId: id, invoiceId },
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "refund") {
      await ref.update({
        status: "Refunded",
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
