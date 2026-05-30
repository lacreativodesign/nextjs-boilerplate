import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser } from "@/app/api/admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as { token?: string } | null;
    const token = String(payload?.token || "").trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: "Push token is required." }, { status: 400 });
    }

    const tenantId = normalizeTenantId(me.tenantId as string | null | undefined);
    await adminDb
      .collection("users")
      .doc(me.uid)
      .set(
        {
          tenantId,
          pushTokens: FieldValue.arrayUnion(token),
          pushTokenUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("push-token route error", error);
    return NextResponse.json({ ok: false, error: "Unable to store push token." }, { status: 500 });
  }
}
