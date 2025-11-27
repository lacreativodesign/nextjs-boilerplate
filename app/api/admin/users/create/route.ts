import { NextResponse } from "next/server";
import {
  auth as adminAuth,
  firestore as adminFirestore,
} from "@/lib/firebaseAdmin";
import { getAuthSession } from "@/lib/getAuthSession";
import { isSuperAdmin } from "../_utils";

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();

    if (!session || !session.uid) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Fetch the current logged-in user's profile
    const currentUserDoc = await adminFirestore
      .collection("users")
      .doc(session.uid)
      .get();

    if (!currentUserDoc.exists) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const currentUser = currentUserDoc.data();
    const currentRole = (currentUser?.role || "").toLowerCase();

    // Only admin + super_admin allowed
    if (currentRole !== "admin" && currentRole !== "super_admin") {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

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
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    const roleLower = role.toLowerCase();

    // Permission rules
    if (currentRole === "admin") {
      if (roleLower === "admin" || roleLower === "super_admin") {
        return NextResponse.json(
          { error: "Admins cannot create admin or super_admin users" },
          { status: 403 }
        );
      }
    }

    // Create Firebase Auth user
    const newUser = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      disabled: status === "disabled",
    });

    const uid = newUser.uid;

    // Create Firestore profile
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
      createdBy: session.uid,
      updatedAt: adminFirestore.FieldValue.serverTimestamp(),
    });

    // Log activity
    await adminFirestore.collection("admin_activity").add({
      action: "create_user",
      targetUser: uid,
      email,
      role: roleLower,
      createdBy: session.uid,
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
