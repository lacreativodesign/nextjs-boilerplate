import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDB } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { uid, name, email, role } = await req.json();

    if (!uid || !name || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const auth = getAdminAuth();
    const db = getAdminDB();

    // Update Firebase Auth user
    await auth.updateUser(uid, {
      displayName: name,
      email: email,
    });

    // Update Firestore user document
    await db.collection("users").doc(uid).update({
      name,
      email,
      role: role.toLowerCase(),
      updatedAt: Date.now(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update user" },
      { status: 500 }
    );
  }
}
