import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { uid, email, role } = await req.json();

    if (!uid) {
      return NextResponse.json(
        { error: "UID is required" },
        { status: 400 }
      );
    }

    // Update Firebase Auth if email provided
    if (email) {
      await adminAuth.updateUser(uid, { email });
    }

    // Update Firestore role
    if (role) {
      await adminDb.collection("users").doc(uid).update({ role });
    }

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
