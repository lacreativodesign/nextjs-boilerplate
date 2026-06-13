import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUserOrThrow } from "@/lib/tenant/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUserOrThrow(req);

    // Read the caller's own user doc to find their managerId.
    const meSnap = await adminDb.collection("users").doc(me.uid).get();
    const managerId = (meSnap.data()?.managerId as string | undefined) || null;

    if (!managerId) {
      return NextResponse.json({ ok: true, manager: null });
    }

    const managerSnap = await adminDb.collection("users").doc(managerId).get();
    if (!managerSnap.exists) {
      return NextResponse.json({ ok: true, manager: null });
    }

    const data = managerSnap.data() || {};

    // Same-tenant guard — never leak cross-tenant manager info.
    if (data.tenantId !== me.tenantId) {
      return NextResponse.json({ ok: true, manager: null });
    }

    return NextResponse.json({
      ok: true,
      manager: {
        uid: managerSnap.id,
        name: data.name || data.displayName || data.email || "",
        email: data.email || "",
        role: data.role || "",
      },
    });
  } catch (err: any) {
    const message = err?.message || "Unauthorized";
    const isAuth =
      message === "Unauthorized" ||
      message === "User not found" ||
      message === "Session expired";
    return NextResponse.json(
      { ok: false, error: isAuth ? "Unauthorized" : "Server error" },
      { status: isAuth ? 401 : 500 },
    );
  }
}
