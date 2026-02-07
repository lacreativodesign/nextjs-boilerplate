import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, requireAdmin, parseString, serverTimestamp } from "../../_utils";

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
      return NextResponse.json({ ok: false, error: "Payroll id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("payroll").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Payroll entry not found." }, { status: 404 });
    }

    const payroll = snap.data() || {};
    const userName = String(payroll.userName || "");

    if (action === "approve") {
      await ref.update({
        status: "Approved",
        updatedAt: serverTimestamp(),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_paid") {
      await ref.update({
        status: "Paid",
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await createFinanceEvent({
        type: "finance.payroll_paid",
        title: "Payroll marked paid",
        description: `Payroll paid for ${userName || "employee"}.`,
        entityType: "payroll",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: auth.user.name || auth.user.fullName || auth.user.displayName || "",
        tenantId: auth.user.tenantId,
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
