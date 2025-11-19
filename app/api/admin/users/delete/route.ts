import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole, isSuperAdmin } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { uid } = body;
    if (!uid) return new NextResponse("Missing uid", { status: 400 });

    // Get target user's role
    const snap = await adminDb.collection("users").doc(uid).get();
    if (!snap.exists) return new NextResponse("User not found", { status: 404 });
    const data = snap.data() || {};

    const isTargetAdminOrSuper =
      data.role === "admin" || data.role === "super_admin";

    if (isTargetAdminOrSuper && !isSuperAdmin(current.role)) {
      return new NextResponse(
        "Only Super Admin can delete Admin/Super Admin",
        { status: 403 }
      );
    }

    // Delete from Auth & Firestore
    await adminAuth.deleteUser(uid);
    await adminDb.collection("users").doc(uid).delete();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Error delete user:", e);
    return new NextResponse("Server error", { status: 500 });
  }
  }
