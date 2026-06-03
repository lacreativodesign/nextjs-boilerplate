import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "@/app/api/admin/_utils";

type PeriodType = "monthly" | "quarterly" | "annual";
type MetricDef = { label: string; target: number; unit: string };

const allowedSetRoles = new Set(["admin", "super_admin", "sales_manager", "am_manager", "production_manager", "hr", "finance"]);

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("userId") || me.uid;
  const period = req.nextUrl.searchParams.get("period");
  const periodType = req.nextUrl.searchParams.get("periodType");

  let query: FirebaseFirestore.Query = adminDb
    .collection("performance_targets")
    .where("tenantId", "==", me.tenantId)
    .where("userId", "==", userId);

  if (period) query = query.where("period", "==", period);
  if (periodType) query = query.where("periodType", "==", periodType);

  const snap = await query.get();
  const targets = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })).filter((t: any) => t.isDeleted !== true);
  return NextResponse.json({ ok: true, targets });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const role = normalizeRole(me.role);
  if (!allowedSetRoles.has(role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    userId?: string;
    period?: string;
    periodType?: PeriodType;
    metrics?: Record<string, MetricDef>;
  } | null;

  if (!body?.userId || !body.period || !body.metrics || Object.keys(body.metrics).length === 0 || !body.periodType) {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }
  if (body.userId === me.uid) {
    return NextResponse.json({ ok: false, error: "You cannot set your own targets" }, { status: 403 });
  }

  const userSnap = await adminDb.collection("users").doc(body.userId).get();
  if (userSnap.data()?.tenantId !== me.tenantId && role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  const userDisplayName = String(userSnap.data()?.displayName || userSnap.data()?.name || "Unknown");
  const targetRole = String(userSnap.data()?.role || "unknown");

  const existing = await adminDb
    .collection("performance_targets")
    .where("tenantId", "==", me.tenantId)
    .where("userId", "==", body.userId)
    .where("period", "==", body.period)
    .limit(1)
    .get();

  const now = new Date().toISOString();
  if (!existing.empty) {
    const doc = existing.docs[0];
    const mergedMetrics = {
      ...((doc.data()?.metrics as Record<string, MetricDef> | undefined) || {}),
      ...body.metrics,
    };
    await doc.ref.set(
      {
        metrics: mergedMetrics,
        periodType: body.periodType,
        updatedAt: now,
      },
      { merge: true }
    );
    const updated = await doc.ref.get();
    return NextResponse.json({ ok: true, target: { id: updated.id, ...(updated.data() || {}) } });
  }

  const ref = await adminDb.collection("performance_targets").add({
    tenantId: me.tenantId,
    userId: body.userId,
    userDisplayName,
    role: targetRole,
    period: body.period,
    periodType: body.periodType,
    metrics: body.metrics,
    setBy: me.uid,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  });

  const created = await ref.get();
  return NextResponse.json({ ok: true, target: { id: created.id, ...(created.data() || {}) } });
}
