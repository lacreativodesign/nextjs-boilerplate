import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { uid, ...fields } = body;

    if (!uid) {
      return NextResponse.json({ error: "Missing user ID" }, { status: 400 });
    }

    // 1) EXTRACT lac_session COOKIE (single string)
    const cookieHeader = req.headers.get("cookie") || "";
    const lacCookie = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("lac_session="));

    if (!lacCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const lacValue = decodeURIComponent(lacCookie.split("=")[1] || "");
    let decoded: any = null;
    try {
      decoded = JSON.parse(lacValue);
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const currentUid = decoded?.uid;
    const currentRole = (decoded?.role || "").toLowerCase();

    if (!currentUid || !currentRole) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const isSuperAdmin = currentRole === "super_admin";
    const isAdmin = currentRole === "admin";

    if (!isSuperAdmin && !isAdmin) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // 4) LOAD TARGET USER
    const targetSnap = await adminDb.collection("users").doc(uid).get();
    if (!targetSnap.exists) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    const targetUser = targetSnap.data() || {};

    const targetRole = (targetUser.role || "").toLowerCase();

    // Admin cannot edit super_admin user or assign super_admin
    if (!isSuperAdmin) {
      if (targetRole === "super_admin") {
        return NextResponse.json(
          { error: "Admins cannot edit super_admin accounts" },
          { status: 403 }
        );
      }
    }

    // 5) DETERMINE NEW ROLE
    const requestedRole = fields.role || targetUser.role || "sales";
    const newRole = String(requestedRole).toLowerCase();

    if (!isSuperAdmin && newRole === "super_admin") {
      return NextResponse.json(
        { error: "Admins cannot assign super_admin role" },
        { status: 403 }
      );
    }

    // 5) BUILD CLEAN PAYLOAD
    const payload = {
      name: fields.name ?? targetUser.name ?? "",
      email: fields.email ?? targetUser.email ?? "",
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
      joiningDate:
        fields.joiningDate ?? targetUser.joiningDate ?? "",
      cnic: fields.cnic ?? targetUser.cnic ?? "",
      dob: fields.dob ?? targetUser.dob ?? "",
      status: fields.status
        ? String(fields.status).toLowerCase()
        : targetUser.status || "active",
      updatedAt: new Date().toISOString(),
    };

    // 6) UPDATE FIRESTORE
    await adminDb.collection("users").doc(uid).update(payload);

    // 7) SYNC AUTH DISABLED / ROLE IF NEEDED
    try {
      await adminAuth.updateUser(uid, {
        disabled: payload.status === "disabled",
        displayName: payload.name,
      });
      await adminAuth.setCustomUserClaims(uid, { role: newRole });
    } catch (err) {
      console.error("Failed to sync auth user:", err);
      // Don't fail whole request for this – we log it.
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
