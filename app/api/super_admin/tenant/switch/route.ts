import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../../_utils";
import { writeAuditLog } from "@/lib/tenant/audit";

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenantId || "").trim();

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "tenantId is required" }, { status: 400 });
    }

    const snap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    await writeAuditLog({
      tenantId: null,
      actorUserId: user.uid,
      actionType: "tenant_switch",
      entityType: "tenant",
      entityId: tenantId,
      metadata: { tenantId },
    });

    const res = NextResponse.json({ ok: true, tenantId });
    res.cookies.set("bizosto_tenant", tenantId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
    return res;
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
