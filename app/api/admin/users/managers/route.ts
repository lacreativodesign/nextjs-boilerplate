import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdminOrSuperAdmin } from "../../_utils";
import { eligibleManagerRolesFor } from "@/lib/hierarchy";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const role = url.searchParams.get("role") || "";

  const eligibleRoles = eligibleManagerRolesFor(role);
  if (eligibleRoles.length === 0) {
    return NextResponse.json({ ok: true, managers: [] });
  }

  const snap = await adminDb
    .collection("users")
    .where("tenantId", "==", auth.user.tenantId)
    .where("role", "in", eligibleRoles)
    .get();

  const managers = snap.docs.map((doc: any) => {
    const d = doc.data();
    return {
      uid: doc.id,
      name: String(d.name || d.email || ""),
      email: String(d.email || ""),
      role: String(d.role || ""),
    };
  });

  return NextResponse.json({ ok: true, managers });
}
