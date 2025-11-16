import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDB } from "@/lib/firebaseAdmin";
import { authGuard } from "@/lib/serverAuth";

export async function POST(req: Request) {
  try {
    const session = await authGuard();

    // Must be admin
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { uid, name, email, role, status } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const db = getAdminDB();
    const auth = getAdminAuth();

    // ----- Update Firestore -----
    const updateData: any = {
      updatedAt: Date.now(),
    };

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role.toLowerCase();
    if (status) updateData.status = status;

    await db.collection("users").doc(uid).update(updateData);

    // ----- Update Firebase Authentication -----
    const authUpdate: any = {};
    if (email) authUpdate.email = email;
    if (name) authUpdate.displayName = name;

    if (Object.keys(authUpdate).length > 0) {
      await auth.updateUser(uid, authUpdate);
    }

    return NextResponse.json({ ok: true, message: "User updated successfully" });
  } catch (err: any) {
    console.error("UPDATE USER ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
