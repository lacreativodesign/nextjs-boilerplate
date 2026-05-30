import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser, isAdminRole } from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const roleParam = String(searchParams.get("role") || "");
    const roles = roleParam
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);

    if (!roles.length) {
      return NextResponse.json({ ok: false, error: "Missing role" }, { status: 400 });
    }

    const tenantId = normalizeTenantId(current.tenantId as string | null | undefined);
    const snap = await adminDb.collection("users").where("role", "in", roles).get();
    const users = snap.docs
      .filter((doc) => docTenantId(doc.data()) === tenantId)
      .map((doc) => {
        const data = doc.data() || {};
        return {
          uid: doc.id,
          name: String(data.name || data.fullName || data.email || "User"),
          role: String(data.role || ""),
        };
      });

    return NextResponse.json({ ok: true, users });
  } catch (err) {
    console.error("admin users by-role error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load users." }, { status: 500 });
  }
}
