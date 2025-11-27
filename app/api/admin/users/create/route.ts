import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  auth as adminAuth,
  firestore as adminFirestore,
} from "@/lib/firebaseAdmin";
import { isSuperAdmin } from "../_utils";

export async function POST(req: Request) {
  try {
    // 1. Get session cookie
    const sessionCookie = cookies().get("lac_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. Verify session
    const decoded = await adminAuth
      .verifySessionCookie(sessionCookie, true)
      .catch(() => null);

    if (!decoded || !decoded.uid) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const currentUid = decoded.uid;

    // 3. Fetch current user's Firestore profile
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

    // Only admin or super_admin can create users
    if (currentRole !== "admin" && currentRole !== "super_admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Extract body
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

    // Required fields check
    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const roleLower = role.toLowerCase();

    // Admin CANNOT create admin or super_admin
    if (currentRole === "admin") {
      if (roleLower === "admin" || roleLower === "super_admin") {
        return NextResponse.json(
          { error: "Admins cannot create admin or super_admin users" },
          { status: 403 }
        );
      }
    }

    // 4. Create Firebase Auth user
    const newUser = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      disabled: status === "disabled",
    });

    const uid = newUser.uid;

    // 5. Create user document in Firestore
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

    // 6. Log activity
    await adminFirestore.collection("admin_activity").add({
      action: "create_user",
      targetUser: uid,
      createdBy: currentUid,
      role: roleLower,
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
