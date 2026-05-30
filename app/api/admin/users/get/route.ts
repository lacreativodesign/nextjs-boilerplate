import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole, isSuperAdmin } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { uid } = await req.json();
    if (!uid) {
      return new NextResponse("Missing uid", { status: 400 });
    }

    const doc = await adminDb.collection("users").doc(uid).get();
    if (!doc.exists) {
      return new NextResponse("User not found", { status: 404 });
    }

    const data = doc.data();

    const isSuperAdminReq = String(current.role || "").toLowerCase() === "super_admin";
    const docTenantId = String((data as unknown).tenantId || "").trim();
    const myTenantId = String(current.tenantId || "").trim();
    if (!isSuperAdminReq && docTenantId !== myTenantId) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // ADMIN cannot view ADMIN or SUPER_ADMIN
    if (!isSuperAdmin(current.role)) {
      if (data?.role === "admin" || data?.role === "super_admin") {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    return NextResponse.json({ uid, ...data });
  } catch (e) {
    console.error("Error get user:", e);
    return new NextResponse("Server error", { status: 500 });
  }
      }
