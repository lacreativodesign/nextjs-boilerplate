import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { uid, email, displayName, role } = await req.json();

    if (!uid) {
      return NextResponse.json(
        { error: "Missing UID" },
        { status: 400 }
      );
    }

    // Update auth record (email + name)
    await adminAuth.updateUser(uid, {
      email: email || undefined,
      displayName: displayName || undefined,
    });

    // Update Firestore user profile
    await adminDb.collection("users").doc(uid).update({
      email,
      displayName,
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
