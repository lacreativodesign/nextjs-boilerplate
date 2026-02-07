import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth } from "@/lib/firebaseAdmin";
import { AUTH_REDIRECT_URL, EMAIL_FROM, RESEND_API_KEY } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
    }

    const apiKey = RESEND_API_KEY;
    const from = EMAIL_FROM;
    if (!apiKey || !from) {
      const missing = [!apiKey ? "RESEND_API_KEY" : null, !from ? "EMAIL_FROM" : null].filter(Boolean).join(", ");
      return NextResponse.json(
        { ok: false, error: `Email service unavailable: ${missing} missing.` },
        { status: 500 }
      );
    }

    const user = await adminAuth.getUserByEmail(email).catch(() => null);
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const resetLink = await adminAuth.generatePasswordResetLink(email, { url: AUTH_REDIRECT_URL });

    const resend = new Resend(apiKey);

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <h2 style="margin: 0 0 12px;">Reset your LA CREATIVO Dashboard password</h2>
        <p style="margin: 0 0 16px;">Click the button below to reset your password.</p>
        <p style="margin: 0 0 20px;">
          <a href="${resetLink}" style="display: inline-block; padding: 12px 18px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Reset Password
          </a>
        </p>
        <p style="margin: 0; font-size: 13px; color: #6b7280;">If you did not request this, you can ignore this email.</p>
      </div>
    `;

    await resend.emails.send({
      from,
      to: email,
      subject: "Reset your LA CREATIVO Dashboard password",
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("REQUEST PASSWORD RESET ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
