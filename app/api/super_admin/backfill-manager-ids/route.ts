import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin(req);

    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId") || String((user as any).tenantId || "").trim();

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "tenantId is required" }, { status: 400 });
    }

    // Find the admin uid for the tenant
    const adminSnap = await adminDb
      .collection("users")
      .where("tenantId", "==", tenantId)
      .where("role", "==", "admin")
      .limit(1)
      .get();

    const adminUid = adminSnap.empty ? user.uid : adminSnap.docs[0].id;

    // Query all users in the tenant
    const usersSnap = await adminDb
      .collection("users")
      .where("tenantId", "==", tenantId)
      .get();

    const toUpdate = usersSnap.docs.filter((doc: any) => {
      const d = doc.data();
      const r = String(d.role || "").toLowerCase();
      if (r === "admin" || r === "super_admin") return false;
      return !d.managerId;
    });

    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += 400) {
      const chunk = toUpdate.slice(i, i + 400);
      const batch = adminDb.batch();
      for (const doc of chunk) {
        batch.update(doc.ref, { managerId: adminUid });
      }
      await batch.commit();
      updated += chunk.length;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
