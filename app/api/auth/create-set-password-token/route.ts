import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createPasswordSetupToken, sendSetPasswordEmail } from "@/lib/passwordSetup";
import { getCurrentUser, isAdminRole } from "../../admin/_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || "").trim();

    if (!uid) {
      return NextResponse.json({ ok: false, error: "Missing uid" }, { status: 400 });
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const userData = userSnap.data() || {};
    const email = String(userData?.email || "").trim();

    if (!email) {
      return NextResponse.json({ ok: false, error: "User email missing" }, { status: 400 });
    }

    const tokenData = await createPasswordSetupToken({
      uid,
      email,
      createdBy: current.uid,
    });

    const emailResult = await sendSetPasswordEmail({ email, link: tokenData.link });

    return NextResponse.json({
      ok: true,
      uid,
      email,
      expiresAt: tokenData.expiresAt,
      setPasswordLink: emailResult.sent ? undefined : tokenData.link,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
    });
  } catch (err: any) {
    console.error("CREATE SET PASSWORD TOKEN ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
