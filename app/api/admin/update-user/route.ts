import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { uid, name, role } = await req.json();

    if (!uid || !name || !role) {
      return NextResponse.json(
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    // Update Firebase Auth displayName
    await adminAuth.updateUser(uid, {
      displayName: name,
    });

    // Update Firestore user data
    await adminDb.collection("users").doc(uid).update({
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
