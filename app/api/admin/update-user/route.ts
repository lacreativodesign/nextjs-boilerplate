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

    const { uid, email, name, role } = await req.json();

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

    if (requesterRole !== "super_admin" && targetTenantId && requesterTenantId && targetTenantId !== requesterTenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedRole = normalizeRole(role);
    const wantsEmailChange =
      email !== undefined &&
      String(existing.email || "").toLowerCase() !== String(email || "").toLowerCase();

    if (requesterRole !== "super_admin" && (existingRole === "super_admin" || normalizedRole === "super_admin")) {
      return NextResponse.json({ error: "Admins cannot manage super_admin accounts." }, { status: 403 });
    }

    if (normalizedRole && normalizedRole !== existingRole) {
      try {
        assertPermission(requesterRole, Permission.ManageRoles);
      } catch {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (wantsEmailChange && requesterRole === "hr") {
      return NextResponse.json({ error: "HR cannot edit email." }, { status: 403 });
    }

    const wantsNameChange = name !== undefined && String(existing.name || "") !== String(name || "");
    if ((wantsEmailChange || wantsNameChange) && (requesterRole === "admin" || requesterRole === "super_admin")) {
      await adminAuth.updateUser(uid, {
        email: wantsEmailChange ? email : existing.email,
        displayName: wantsNameChange ? name : existing.name,
      });
    }

    // Update Firestore user document
    await adminDb.collection("users").doc(uid).update({
      email: email ?? existing.email,
      name: name ?? existing.name,
      role: normalizedRole || existingRole,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update user" },
      { status: 500 }
    );
  }
}
