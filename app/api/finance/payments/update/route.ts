import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, parseString, requireFinance, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { assertPermission, Permission } from "../../../../lib/permissions";

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
      return NextResponse.json({ ok: false, error: "Payment id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("payments").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
    }

    const payment = snap.data() || {};
    const invoiceId = String(payment.invoiceId || "");
    const clientName = String(payment.clientName || "");
    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";

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

      const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"]);
      await Promise.all(
        financeIds.map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Payment marked paid",
            body: `Payment ${id} marked paid for ${clientName || "client"}.`,
            type: "success",
            entityType: "payment",
            entityId: id,
            deepLink: "/finance/payments",
            createdBy: { uid: auth.user.uid, name: actorName },
          })
        )
      );

      await createFinanceEvent({
        type: "finance.payment_paid",
        title: "Payment marked paid",
        description: `Payment ${id} marked paid for ${clientName || "client"}.`,
        entityType: "payment",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: actorName,
      });

      try {
        await logEvent({
          type: "finance.payment_paid",
          title: "Payment marked paid",
          description: `Payment ${id} marked paid for ${clientName || "client"}.`,
          entityType: "payment",
          entityId: id,
          actor: { uid: auth.user.uid, name: actorName },
        });
      } catch (auditError) {
        console.error("audit log error:", auditError);
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "update_notes") {
      const notes = parseString(body?.notes).trim();
      await ref.update({
        notes: notes || null,
        updatedAt: serverTimestamp(),
      });

      const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"]);
      await Promise.all(
        financeIds.map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Payment note updated",
            body: `Payment ${id} note updated for ${clientName || "client"}.`,
            type: "info",
            entityType: "payment",
            entityId: id,
            deepLink: "/finance/payments",
            createdBy: { uid: auth.user.uid, name: actorName },
          })
        )
      );

      await createFinanceEvent({
        type: "finance.payment_note",
        title: "Payment note updated",
        description: `Payment ${id} note updated for ${clientName || "client"}.`,
        entityType: "payment",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: actorName,
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
