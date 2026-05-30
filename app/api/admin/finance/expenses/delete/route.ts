import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseString, requireAdmin, serverTimestamp } from "../../_utils";
import { logEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/security";

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
      return NextResponse.json({ ok: false, error: "Expense id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("expenses").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const existing = snap.data() || {};
    const isSuperAdmin = (auth.user.role || "").toLowerCase() === "super_admin";
    if (!isSuperAdmin && String(existing.tenantId || "") !== String(auth.user.tenantId || "")) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    await ref.set(
      {
        isDeleted: true,
        updatedAt: serverTimestamp(),
        deletedAt: serverTimestamp(),
      },
      { merge: true }
    );

    try {
      const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
      await logEvent({
        type: "finance.expense_deleted",
        title: "Expense deleted",
        description: `${String(existing.category || "Expense")} deleted.`,
        entityType: "expense",
        entityId: id,
        actor: { uid: auth.user.uid, name: actorName },
        metadata: {
          ip: getClientIp(req),
          userAgent: req.headers.get("user-agent") || "",
        },
        audit: {
          action: "delete",
          resource: "expense",
          resourceId: id,
          changes: [
            { field: "isDeleted", oldValue: existing.isDeleted || false, newValue: true },
            { field: "deletedAt", oldValue: existing.deletedAt || null, newValue: "serverTimestamp" },
          ],
        },
      });
    } catch (auditError) {
      console.error("audit log error:", auditError);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("finance/expenses delete error:", err);
    return NextResponse.json({ ok: false, error: "Unable to delete expense." }, { status: 500 });
  }
}
