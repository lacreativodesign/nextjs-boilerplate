import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
export async function GET() {
  try {
    const { auth } = getFirebaseAdmin();
    await auth.setCustomUserClaims("3NaI798Lcahia7fuDuDTzj2hF", { role: "super_admin", tenantId: "bizosto" });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
