import { NextResponse } from "next/server";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing segment id" }, { status: 400 });

  const ref = db.collection("clientSegments").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ ok: false, error: "Segment not found" }, { status: 404 });
  const data = snap.data() || {};
  const isSuperAdmin = (me.role || "").toLowerCase() === "super_admin";
  if (!isSuperAdmin && String(data.tenantId || "") !== String(me.tenantId || "")) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const updateData: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (body?.name !== undefined) {
    const name = String(body?.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    updateData.name = name;
  }
  if (body?.isActive !== undefined) {
    updateData.isActive = Boolean(body?.isActive);
  }

  await ref.set(updateData, { merge: true });

  return NextResponse.json({ ok: true, id });
}
