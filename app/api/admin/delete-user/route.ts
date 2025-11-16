import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDB } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { uid } = await req.json();

    if (!uid) {
      return NextResponse.json(
        { error: "Missing UID" },
        { status: 400 }
      );
    }

    const auth = getAdminAuth();
    const db = getAdminDB();

    // 1) Delete auth user
    await auth.deleteUser(uid);

    // 2) Delete Firestore user record
    await db.collection("users").doc(uid).delete();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}
