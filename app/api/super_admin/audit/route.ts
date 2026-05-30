import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../_utils";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof (value as Record<string, unknown>)?.toDate === "function") return (value as Record<string, unknown>).toDate().toISOString();
  if (typeof (value as Record<string, unknown>)?._seconds === "number") return new Date((value as Record<string, unknown>)._seconds * 1000).toISOString();
  return null;
}

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
        actorName: data.actorName || "",
        actorRole: data.actorRole || "",
        actionType: data.actionType || "",
        entityType: data.entityType || "",
        entityId: data.entityId || "",
        metadata: data.metadata || {},
        createdAt: toIso(data.createdAt),
      };
    });

    return NextResponse.json({ ok: true, logs });
  } catch (err) {
    const message = (err instanceof Error ? err.message : undefined) || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
