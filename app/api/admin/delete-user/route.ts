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

    // Delete Firestore user first
    await db.collection("users").doc(uid).delete();

    // Delete Auth user
    await auth.deleteUser(uid);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Delete failed" },
      { status: 400 }
    );
  }
}
