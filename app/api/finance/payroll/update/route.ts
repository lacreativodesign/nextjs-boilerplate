import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, parseString, requireFinance, serverTimestamp } from "../../_utils";
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
      return NextResponse.json({ ok: false, error: "Payroll id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("payroll").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Payroll entry not found." }, { status: 404 });
    }

    const payroll = snap.data() || {};
    const userName = String(payroll.userName || "");
    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";

    if (action === "approve") {
      await ref.update({
        status: "Approved",
        updatedAt: serverTimestamp(),
      });

      const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"]);
      await Promise.all(
        financeIds.map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Payroll approved",
            body: `Payroll approved for ${userName || "employee"}.`,
            type: "info",
            entityType: "payroll",
            entityId: id,
            deepLink: "/finance/payroll",
            createdBy: { uid: auth.user.uid, name: actorName },
          })
        )
      );

      await createFinanceEvent({
        type: "finance.payroll_approved",
        title: "Payroll approved",
        description: `Payroll approved for ${userName || "employee"}.`,
        entityType: "payroll",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: actorName,
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "mark_paid") {
      await ref.update({
        status: "Paid",
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"]);
      await Promise.all(
        financeIds.map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Payroll marked paid",
            body: `Payroll paid for ${userName || "employee"}.`,
            type: "success",
            entityType: "payroll",
            entityId: id,
            deepLink: "/finance/payroll",
            createdBy: { uid: auth.user.uid, name: actorName },
          })
        )
      );

      await createFinanceEvent({
        type: "finance.payroll_paid",
        title: "Payroll marked paid",
        description: `Payroll paid for ${userName || "employee"}.`,
        entityType: "payroll",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: actorName,
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
  } catch (err: any) {
    console.error("finance/payroll update error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to update payroll.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
