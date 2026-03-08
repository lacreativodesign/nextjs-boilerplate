import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { loadRateLimitConfigFromFirestore } from "@/lib/rate-limit/config";
import { getCurrentUser, isSuperAdmin } from "../_utils";

export const runtime = "nodejs";

export async function GET() {
  const current = await getCurrentUser();
  if (!current || !isSuperAdmin(current.role)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const snap = await adminDb.collection("rate_limit_rules").orderBy("priority", "desc").get();
  const rules = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
  return NextResponse.json({ ok: true, rules });
}

export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current || !isSuperAdmin(current.role)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.endpointPattern || !body?.limit || !body?.windowSeconds) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  await adminDb.collection("rate_limit_rules").add({
    endpointPattern: String(body.endpointPattern),
    limit: Number(body.limit),
    windowSeconds: Number(body.windowSeconds),
    scope: body.scope === "tenant" || body.scope === "user" ? body.scope : "both",
    priority: Number(body.priority || 1),
    enabled: Boolean(body.enabled ?? true),
    createdAt: new Date().toISOString(),
    createdBy: current.uid,
  });

  await loadRateLimitConfigFromFirestore();

  return NextResponse.json({ ok: true });
}
