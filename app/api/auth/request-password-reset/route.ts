import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth } from "@/lib/firebaseAdmin";

const DASHBOARD_URL = "https://dashboard.lacreativo.com";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Email service unavailable." }, { status: 500 });
    }

    const user = await adminAuth.getUserByEmail(email).catch(() => null);
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const resetLink = await adminAuth.generatePasswordResetLink(email, {
      url: `${DASHBOARD_URL}/login`,
    });

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
      from: "La Creativo ERP <no-reply@lacreativo.com>",
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
