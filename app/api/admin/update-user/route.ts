import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDB } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { uid, email, role } = await req.json();

    if (!uid || !email || !role) {
      return NextResponse.json(
        { error: "UID, Email, and Role are required" },
        { status: 400 }
      );
    }

    const auth = getAdminAuth();
    const db = getAdminDB();

    // Update email in Firebase Auth
    await auth.updateUser(uid, { email });

    // Update Firestore doc
    await db.collection("users").doc(uid).update({
      email,
      role,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Update failed" },
      { status: 400 }
    );
  }
}
