import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const email = "admin@bizosto.com";
    const user = await adminAuth.getUserByEmail(email);

    await adminAuth.setCustomUserClaims(user.uid, {
      role: "super_admin",
      tenantId: "bizosto",
    });

    const updated = await adminAuth.getUser(user.uid);

    return NextResponse.json({
      ok: true,
      uid: user.uid,
      claims: updated.customClaims,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
