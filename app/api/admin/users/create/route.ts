import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 1) Get current logged-in user from existing util
    const current = await getCurrentUser();
    if (!current) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const currentRole = (current.role || "").toLowerCase();

    // 2) Only admin or super_admin can create users
    if (!isAdminRole(currentRole)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // SUPER_ADMIN can create anyone
    // ADMIN cannot create ADMIN or SUPER_ADMIN
    const canManageRole = (targetRole: string) => {
      const roleLower = (targetRole || "").toLowerCase();

      if (currentRole === "super_admin") return true;

      if (currentRole === "admin") {
        return roleLower !== "admin" && roleLower !== "super_admin";
      }

      return false;
    };

    // 3) Read body
    const body = await req.json();

    const {
      name,
      email,
      password,
      role,
      phone,
      department,
      designation,
      salary,
      monthlyTarget,
      commission,
      joiningDate,
      status,
    } = body;

    // 4) Validate required fields
    if (!email || !password || !role || !name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!canManageRole(role)) {
      return NextResponse.json(
        { error: "Permission denied for selected role" },
        { status: 403 }
      );
    }

    const targetRole = (role || "").toLowerCase();

    // 5) Check duplicate email
    const existingUser = await adminAuth
      .getUserByEmail(email)
      .catch(() => null);
    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    // 6) Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      disabled: status === "disabled",
    });

    // 7) Assign custom claims
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: targetRole });

    // 8) Save user document in Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      role: targetRole,
      phone: phone || "",
      department: department || "",
      designation: designation || "",
      salary: salary || "",
      monthlyTarget: monthlyTarget || "",
      commission: commission || "",
      joiningDate: joiningDate || "",
      status: status || "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: current.uid,
    });

    // 9) Log admin activity
    await adminDb.collection("admin_activity").add({
      action: "create_user",
      performedBy: current.uid,
      performedByRole: currentRole,
      targetUser: {
        uid: userRecord.uid,
        email,
        role: targetRole,
      },
      timestamp: new Date().toISOString(),
    });

    // 10) Respond
    return NextResponse.json({
      success: true,
      uid: userRecord.uid,
    });
  } catch (e: any) {
    console.error("Error create user:", e);
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
