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
