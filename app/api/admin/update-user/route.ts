import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { uid, email, name, role } = await req.json();

    if (!uid) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Update Firebase Auth (email / displayName)
    await adminAuth.updateUser(uid, {
      email: email,
      displayName: name,
    });

    // Update Firestore user document
    await adminDb.collection("users").doc(uid).update({
      email,
      name,
      role,
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
