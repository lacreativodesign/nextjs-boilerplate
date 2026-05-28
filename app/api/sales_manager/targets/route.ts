import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSalesManager, toISO } from "../_utils";

export const dynamic = "force-dynamic";

function parseMonth(value: string | null) {
  if (!value) return null;
  const [yearStr, monthStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return null;
  return { year, month };
}

export async function GET(req: Request) {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const monthParam = parseMonth(searchParams.get("month"));
    const now = new Date();
    const year = monthParam?.year ?? now.getFullYear();
    const month = monthParam?.month ?? now.getMonth() + 1;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;

    const [usersSnap, targetsSnap, dealsSnap] = await Promise.all([
      adminDb.collection("users").where("tenantId", "==", auth.user.tenantId || "").where("role", "==", "sales").get(),
      adminDb.collection("sales_targets").where("tenantId", "==", auth.user.tenantId || "").where("month", "==", monthKey).get(),
      adminDb.collection("deals").where("tenantId", "==", auth.user.tenantId || "").where("isDeleted", "==", false).limit(500).get(),
    ]);

    const targetMap = new Map<string, number>();
    targetsSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const userId = String(data.userId || data.uid || "");
      if (!userId) return;
      targetMap.set(userId, Number(data.targetUsd || 0));
    });

    const achievedMap = new Map<string, number>();
    dealsSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (String(data.stage || "") !== "Closed Won") return;
      const closedAt = toISO(data.closedWonAt || data.updatedAt || data.createdAt);
      if (!closedAt) return;
      const closedDate = new Date(closedAt);
      if (closedDate < start || closedDate > end) return;
      const ownerId = String(data.ownerId || "");
      if (!ownerId) return;
      achievedMap.set(ownerId, (achievedMap.get(ownerId) || 0) + Number(data.valueUsd || 0));
    });

    const targets = usersSnap.docs.map((doc) => {
      const data = doc.data() || {};
      const uid = doc.id;
      const targetUsd = targetMap.get(uid) || 0;
      const achievedUsd = achievedMap.get(uid) || 0;
      return {
        uid,
        name: String(data.name || data.fullName || data.email || "Sales Rep"),
        targetUsd,
        achievedUsd,
        varianceUsd: achievedUsd - targetUsd,
      };
    });

    return NextResponse.json({ ok: true, month: monthKey, targets });
  } catch (err: any) {
    console.error("sales manager targets error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load targets." }, { status: 500 });
  }
}
