import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, parseString, requireAdmin, serverTimestamp } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = parseString(body?.id).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Payroll id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("payroll").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Payroll entry not found." }, { status: 404 });
    }
    const existing = snap.data() || {};
    const isSuperAdmin = (auth.user.role || "").toLowerCase() === "super_admin";
    if (!isSuperAdmin && String(existing.tenantId || "") !== String(auth.user.tenantId || "")) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    await ref.set(
      {
        isDeleted: true,
        status: "deleted",
        updatedAt: serverTimestamp(),
        deletedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await createFinanceEvent({
      type: "finance.payroll_deleted",
      title: "Payroll entry deleted",
      description: `Payroll deleted for ${String(existing.userName || "employee")}.`,
      entityType: "payroll",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || auth.user.displayName || "",
      tenantId: auth.user.tenantId,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("finance/payroll delete error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to delete payroll entry.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
