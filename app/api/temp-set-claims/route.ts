import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await adminAuth.getUserByEmail("admin@bizosto.com");
    await adminAuth.setCustomUserClaims(user.uid, {
      role: "super_admin",
      tenantId: "bizosto",
    });
    await adminDb
      .collection("users")
      .doc(user.uid)
      .set(
        {
          uid: user.uid,
          email: "admin@bizosto.com",
          role: "super_admin",
          tenantId: "bizosto",
          name: "Super Admin",
          status: "active",
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    return NextResponse.json({ ok: true, uid: user.uid });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
