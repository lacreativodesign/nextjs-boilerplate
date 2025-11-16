import { NextResponse } from "next/server";
import { adminAuth, adminDB } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { uid, name, email, role } = body;

    if (!uid) {
      return NextResponse.json(
        { error: "Missing user UID" },
        { status: 400 }
      );
    }

    // Update Firebase Authentication
    const authUpdateData: any = {};
    if (email) authUpdateData.email = email;
    if (name) authUpdateData.displayName = name;

    if (Object.keys(authUpdateData).length > 0) {
      await adminAuth.updateUser(uid, authUpdateData);
    }

    // Update Firestore Profile
    const firestoreUpdate: any = {};
    if (name) firestoreUpdate.name = name;
    if (email) firestoreUpdate.email = email;
    if (role) firestoreUpdate.role = role;

    if (Object.keys(firestoreUpdate).length > 0) {
      await adminDB.collection("users").doc(uid).update(firestoreUpdate);
    }

    return NextResponse.json({
      ok: true,
      message: "User updated successfully",
    });
  } catch (err: any) {
    console.error("Update-user error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update user" },
      { status: 500 }
    );
  }
}
