import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser, isAdminOrSuper, isSalesManager } from "../../../admin/_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isSalesManager(me.role) && !isAdminOrSuper(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const tenantId = normalizeTenantId(me.tenantId);
    const snap = await adminDb.collection("users").where("role", "==", "sales").get();
    const owners = snap.docs
      .filter((doc) => docTenantId(doc.data()) === tenantId)
      .map((doc) => {
        const data = doc.data() || {};
        return {
          uid: doc.id,
          name: String(data.name || data.fullName || data.email || "Sales Rep"),
        };
      });

    return NextResponse.json({ ok: true, owners });
  } catch (err: any) {
    console.error("sales_manager owners list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load sales reps." }, { status: 500 });
  }
}
