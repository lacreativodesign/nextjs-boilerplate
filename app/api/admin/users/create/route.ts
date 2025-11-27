import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  auth as adminAuth,
  firestore as adminFirestore,
} from "@/lib/firebaseAdmin";
import { isSuperAdmin } from "../_utils";

export async function POST(req: Request) {
  try {
    // 1. Read session token
    const token = cookies().get("lac_session")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // 2. Verify JWT token (your real auth method)
    const decoded = await adminAuth.verifyIdToken(token).catch(() => null);

    if (!decoded || !decoded.uid) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }

    const currentUid = decoded.uid;

    // 3. Fetch logged-in user's Firestore profile
    const currentUserDoc = await adminFirestore
      .collection("users")
      .doc(currentUid)
      .get();

    if (!currentUserDoc.exists) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const currentUser = currentUserDoc.data();
    const currentRole = (currentUser?.role || "").toLowerCase();

    // 4. Ensure only admin or super_admin can proceed
    if (currentRole !== "admin" && currentRole !== "super_admin") {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // 5. Extract request body
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

    // Required fields
    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const roleLower = role.toLowerCase();

    // Admin cannot create admin or super_admin
    if (currentRole === "admin") {
      if (roleLower === "admin" || roleLower === "super_admin") {
        return NextResponse.json(
          { error: "Admins cannot create admin or super_admin users" },
          { status: 403 }
        );
      }
    }

    // 6. Create user in Firebase Auth
    const newUser = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      disabled: status === "disabled",
    });

    const uid = newUser.uid;

    // 7. Create user profile in Firestore
    await adminFirestore.collection("users").doc(uid).set({
      uid,
      name,
      email,
      role: roleLower,
      phone: phone || "",
      department: department || "",
      designation: designation || "",
      salary: salary || "",
      monthlyTarget: monthlyTarget || "",
      commission: commission || "",
      joiningDate: joiningDate || "",
      status: status || "active",
      createdAt: adminFirestore.FieldValue.serverTimestamp(),
      updatedAt: adminFirestore.FieldValue.serverTimestamp(),
      createdBy: currentUid,
    });

    // 8. Log admin activity
    await adminFirestore.collection("admin_activity").add({
      action: "create_user",
      targetUser: uid,
      role: roleLower,
      createdBy: currentUid,
      timestamp: adminFirestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "User created successfully",
    });
  } catch (err: any) {
    console.error("Create User API Error:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
