import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await adminAuth.setCustomUserClaims("3NaI798Lcahia7fuDuDTzj2hF", {
      role: "super_admin",
      tenantId: "bizosto",
    });
    return NextResponse.json({ ok: true, message: "Claims set successfully" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
