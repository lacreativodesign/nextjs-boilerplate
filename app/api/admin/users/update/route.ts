import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 1) Get current logged-in user from shared util (same as list/create/etc.)
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentRole = (current.role || "").toLowerCase();

    // Only admin / super_admin (and whatever your isAdminRole allows) can update
    if (!isAdminRole(currentRole)) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // 2) Parse body
    const body = await req.json();
    const { uid, ...fields } = body;

    if (!uid) {
      return NextResponse.json({ error: "Missing user ID" }, { status: 400 });
    }

    // 3) Load target user from Firestore
    const targetSnap = await adminDb.collection("users").doc(uid).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const targetUser = targetSnap.data() || {};
    const targetRole = (targetUser.role || "").toLowerCase();

    const isSuperAdmin = currentRole === "super_admin";

    // Admin cannot edit super_admin account at all
    if (!isSuperAdmin && targetRole === "super_admin") {
      return NextResponse.json(
        { error: "Admins cannot edit super_admin accounts" },
        { status: 403 }
      );
    }

    // 4) Determine new role (if changing)
    const requestedRole = fields.role || targetUser.role || "sales";
    const newRole = String(requestedRole).toLowerCase();

    // Admin cannot assign super_admin role
    if (!isSuperAdmin && newRole === "super_admin") {
      return NextResponse.json(
        { error: "Admins cannot assign super_admin role" },
        { status: 403 }
      );
    }

    // 5) Build clean payload including CNIC + DOB
    const payload = {
      name: fields.name ?? targetUser.name ?? "",
      email: targetUser.email ?? "", // email not edited from UI
      phone: fields.phone ?? targetUser.phone ?? "",
      role: newRole,
      department: fields.department ?? targetUser.department ?? "",
      designation: fields.designation ?? targetUser.designation ?? "",
      salary: fields.salary
        ? Number(fields.salary)
        : targetUser.salary || 0,
      monthlyTarget: fields.monthlyTarget
        ? Number(fields.monthlyTarget)
        : targetUser.monthlyTarget || 0,
      commission: fields.commission
        ? Number(fields.commission)
        : targetUser.commission || 0,
      joiningDate: fields.joiningDate ?? targetUser.joiningDate ?? "",
      cnic: fields.cnic ?? targetUser.cnic ?? "",
      dob: fields.dob ?? targetUser.dob ?? "",
      status: fields.status
        ? String(fields.status).toLowerCase()
        : targetUser.status || "active",
      updatedAt: new Date().toISOString(),
    };

    // 6) Update Firestore
    await adminDb.collection("users").doc(uid).update(payload);

    // 7) Sync Firebase Auth user (displayName + disabled + claims)
    try {
      await adminAuth.updateUser(uid, {
        disabled: payload.status === "disabled",
        displayName: payload.name,
      });
      await adminAuth.setCustomUserClaims(uid, { role: newRole });
    } catch (err) {
      console.error("Failed to sync auth user:", err);
      // We don't fail the whole request if Auth sync hiccups – it's logged.
    }

    // 8) Optionally log admin activity
    try {
      await adminDb.collection("admin_activity").add({
        action: "update_user",
        performedBy: current.uid,
        performedByRole: currentRole,
        targetUser: {
          uid,
          email: targetUser.email || "",
          oldRole: targetRole,
          newRole,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to log admin activity:", err);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("UPDATE USER ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update user" },
      { status: 500 }
    );
  }
}
