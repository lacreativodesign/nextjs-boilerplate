import { NextResponse } from "next/server";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../_utils";

export const dynamic = "force-dynamic";

function toISO(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof (value as Record<string, unknown>)?.toDate === "function") return (value as { toDate: () => Date }).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function canViewClient(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "sales_manager";
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canViewClient(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const snap = await db.collection("clients").doc(id).get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const data = snap.data() || {};
    const d = data as Record<string, unknown>;
    if (d.tenantId && d.tenantId !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (d.deletedAt) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      client: {
        id: snap.id,
        ...data,
        createdAt: toISO(d.createdAt),
        updatedAt: toISO(d.updatedAt),
        lastActivity: toISO(d.lastActivity),
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Failed to get client" }, { status: 500 });
  }
}
