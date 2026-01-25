import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "@/app/api/super_admin/_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const searchParams = req.nextUrl.searchParams;
    const tenantId = searchParams.get("tenantId");
    let query = adminDb.collection("auditLogs").orderBy("createdAt", "desc").limit(200);

    if (tenantId) {
      query = query.where("tenantId", "==", tenantId);
    }

    const snap = await query.get();
    const logs = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        tenantId: data.tenantId || null,
        actorUserId: data.actorUserId || "",
        actionType: data.actionType || "",
        entityType: data.entityType || "",
        entityId: data.entityId || "",
        metadata: data.metadata || {},
        createdAt: data.createdAt || null,
      };
    });

    return NextResponse.json({ ok: true, logs });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
