import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const otp = String(body?.otp || "").trim();

    if (!email || !otp) {
      return NextResponse.json({ ok: false, error: "Email and code are required." }, { status: 400 });
    }

    const ref = adminDb.collection("email_otps").doc(email);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "No verification code found. Please request a new one." }, { status: 404 });
    }

    const data = snap.data() || {};
    const now = Date.now();

    // Check expiry
    if (now > (data.expiresAt as number)) {
      await ref.delete();
      return NextResponse.json({ ok: false, error: "Code has expired. Please request a new one." }, { status: 410 });
    }

    // Check max attempts (5)
    const attempts = (data.attempts as number) || 0;
    if (attempts >= 5) {
      await ref.delete();
      return NextResponse.json({ ok: false, error: "Too many incorrect attempts. Please request a new code." }, { status: 429 });
    }

    // Check code
    if (data.otp !== otp) {
      await ref.set({ attempts: attempts + 1 }, { merge: true });
      const remaining = 5 - (attempts + 1);
      return NextResponse.json(
        { ok: false, error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` },
        { status: 400 }
      );
    }

    // Mark verified
    await ref.set({ verified: true }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ ok: false, error: "Verification failed." }, { status: 500 });
  }
}
