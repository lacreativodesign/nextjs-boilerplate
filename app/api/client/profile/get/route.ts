import { NextResponse } from "next/server";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { requireClient } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const snap = await db.collection("clients").doc(auth.clientId).get();
    if (!snap.exists || (snap.data() || {}).deletedAt) {
      return NextResponse.json({ ok: false, error: "Client profile not found" }, { status: 404 });
    }

    const data = snap.data() || {};
    if (String(data.tenantId || "") !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, client: { id: snap.id, ...data } });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load profile" }, { status: 500 });
  }
}
