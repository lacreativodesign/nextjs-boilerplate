import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDB } from "@/lib/firebaseAdmin";
import { authGuard } from "@/lib/serverAuth";

export async function POST(req: Request) {
  try {
    const session = await authGuard();

    // Must be Admin
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { uid } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const db = getAdminDB();
    const auth = getAdminAuth();

    // ---- Delete from Firestore ----
    await db.collection("users").doc(uid).delete();

    // ---- Delete from Firebase Auth ----
    await auth.deleteUser(uid);

    return NextResponse.json({
      ok: true,
      message: "User deleted successfully",
    });
  } catch (err: any) {
    console.error("DELETE USER ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
