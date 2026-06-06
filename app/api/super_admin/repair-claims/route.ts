import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "@/app/api/super_admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const usersSnap = await adminDb.collection("users").get();

    let total = 0;
    let fixed = 0;
    let skipped = 0;
    let failed = 0;

    for (const doc of usersSnap.docs) {
      total++;
      const data = doc.data();
      const uid = doc.id;
      const role = (data.role as string | undefined) || "";
      const tenantId = (data.tenantId as string | undefined) || "";

      if (!uid || !role || !tenantId) {
        skipped++;
        continue;
      }

      try {
        const authUser = await adminAuth.getUser(uid);
        const existing = (authUser.customClaims || {}) as Record<string, unknown>;

        if (existing.role === role && existing.tenantId === tenantId) {
          skipped++;
          continue;
        }

        await adminAuth.setCustomUserClaims(uid, {
          ...existing,
          role,
          tenantId,
        });
        fixed++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ ok: true, summary: { total, fixed, skipped, failed } });
  } catch (err: any) {
    const status = err?.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: err?.message || "Failed" }, { status });
  }
}
