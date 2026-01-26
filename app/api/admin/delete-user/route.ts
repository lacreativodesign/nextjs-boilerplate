import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "../_utils";
import { assertPermission, Permission } from "../../../../lib/permissions";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requesterRole = normalizeRole(current.role);
    try {
      assertPermission(requesterRole, Permission.ManageUsers);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { uid } = await req.json();

    if (!uid) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existing = userSnap.data() || {};
    const existingRole = normalizeRole(existing.role);
    const targetTenantId = String(existing.tenantId || "");
    const requesterTenantId = String(current.tenantId || "");

    if (requesterRole !== "super_admin" && existingRole === "super_admin") {
      return NextResponse.json({ error: "Admins cannot delete super_admin accounts." }, { status: 403 });
    }

    if (requesterRole !== "super_admin" && targetTenantId && requesterTenantId && targetTenantId !== requesterTenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete from Firebase Auth
    await adminAuth.deleteUser(uid);

    // Delete Firestore profile
    await adminDb.collection("users").doc(uid).delete();

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}
