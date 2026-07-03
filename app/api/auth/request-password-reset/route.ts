import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { createPasswordSetupToken, sendSetPasswordEmail } from "@/lib/passwordSetup";

export const runtime = "nodejs";

// Password reset now uses our own single-use, hashed, 24h set-password tokens instead
// of Firebase's hosted reset link. Reason: the Firebase-hosted flow changes the
// password without touching our internal session ledger, so existing sessions
// survived a reset. Our flow ends at /api/auth/consume-set-password-token, which
// revokes the ledger and Firebase refresh tokens atomically with the change.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
    }

    // Enumeration-safe: identical response whether or not the account exists.
    const user = await adminAuth.getUserByEmail(email).catch(() => null);
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const tokenData = await createPasswordSetupToken({
      uid: user.uid,
      email,
      createdBy: null,
    });

    await sendSetPasswordEmail({ email, link: tokenData.link, isNewUser: false });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("REQUEST PASSWORD RESET ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
