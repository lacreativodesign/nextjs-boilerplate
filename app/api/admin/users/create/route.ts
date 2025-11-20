import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole, isSuperAdmin } from "../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // SUPER_ADMIN can create anyone
    // ADMIN cannot create ADMIN or SUPER_ADMIN
    const canManageRole = (targetRole: string) => {
      if (isSuperAdmin(current.role)) return true;
      if (current.role === "admin" && targetRole !== "admin" && targetRole !== "super_admin") {
        return true;
      }
      return false;
    };

    const body = await req.json();
    const { name, email, password, role } = body;

    if (!email || !password || !role) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    if (!canManageRole(role)) {
      return new NextResponse("Permission denied for selected role", {
        status: 403,
      });
    }

    // Check duplicate email
    const existingUser = await adminAuth.getUserByEmail(email).catch(() => null);
    if (existingUser) {
      return new NextResponse("User already exists", { status: 409 });
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      disabled: false,
    });

    // Assign custom claims
    await adminAuth.setCustomUserClaims(userRecord.uid, { role });

    // Save data in Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      role,
      disabled: false,
      createdAt: new Date().toISOString(),
      createdBy: current.uid,
    });

    // Activity log
    await adminDb.collection("admin_activity").add({
      action: "create_user",
      performedBy: current.uid,
      performedByRole: current.role,
      targetUser: {
        uid: userRecord.uid,
        email,
        role,
      },
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      uid: userRecord.uid,
    });

  } catch (e: any) {
    console.error("Error create user:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
