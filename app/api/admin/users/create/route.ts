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

    // 2) Only admin / super_admin / other privileged roles allowed
    if (!isAdminRole(currentRole)) {
      return NextResponse.json(
        { error: "Only admin users can create new users" },
        { status: 403 }
      );
    }

    // 3) Parse body
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
      cnic,
      dob,
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
      cnic: cnic || "",
      dob: dob || "",
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

// Same helper logic as you already had
function canManageRole(targetRole: string) {
  const r = (targetRole || "").toLowerCase();
  // super_admin / admin allowed to manage all roles except restricting logic already implemented where needed
  return ["super_admin", "admin", "sales_manager", "sales", "am", "hr", "finance", "production"].includes(
    r
  );
}
