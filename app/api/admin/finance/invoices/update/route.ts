import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, queueFinanceEmail, requireAdmin, parseString, serverTimestamp } from "../../_utils";

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

    if (action === "send") {
      await ref.update({
        status: "Sent",
        issuedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await createFinanceEvent({
        type: "finance.invoice_sent",
        title: "Invoice sent",
        description: `Invoice ${orderId || id} sent to ${clientName || "client"}.`,
        entityType: "invoice",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: auth.user.name || auth.user.fullName || auth.user.displayName || "",
      });

      const clientSnap = clientId ? await adminDb.collection("clients").doc(clientId).get() : null;
      const email = clientSnap?.exists ? String(clientSnap.data()?.primaryContactEmail || "") : "";
      if (email) {
        await queueFinanceEmail({
          to: email,
          template: "invoice_sent",
          subject: "Your invoice is ready",
          data: { invoiceId: id, orderId, clientName },
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "mark_paid") {
      await ref.update({
        status: "Paid",
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const paymentId = parseString(body?.paymentId).trim();
      if (paymentId) {
        await adminDb.collection("payments").doc(paymentId).set(
          {
            status: "Paid",
            paidAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await createFinanceEvent({
        type: "finance.invoice_paid",
        title: "Invoice marked paid",
        description: `Invoice ${orderId || id} marked paid.`,
        entityType: "invoice",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: auth.user.name || auth.user.fullName || auth.user.displayName || "",
      });

      const clientSnap = clientId ? await adminDb.collection("clients").doc(clientId).get() : null;
      const email = clientSnap?.exists ? String(clientSnap.data()?.primaryContactEmail || "") : "";
      if (email) {
        await queueFinanceEmail({
          to: email,
          template: "payment_received",
          subject: "Payment received",
          data: { invoiceId: id, orderId, clientName },
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "update_status") {
      const status = parseString(body?.status).trim();
      if (!status) {
        return NextResponse.json({ ok: false, error: "Status is required." }, { status: 400 });
      }
      await ref.update({
        status,
        updatedAt: serverTimestamp(),
      });
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
