import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth } from "@/lib/firebaseAdmin";
import { passwordResetEmailHtml, passwordResetEmailSubject } from "@/lib/email/html-templates";

const DASHBOARD_URL = "https://app.bizosto.com";

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

    await resend.emails.send({
      from: process.env.ONBOARDING_FROM_EMAIL || "Bizosto <onboarding@resend.dev>",
      to: email,
      subject: passwordResetEmailSubject(),
      html: passwordResetEmailHtml({ name: email, resetUrl: resetLink, expiresIn: "1 hour" }),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("REQUEST PASSWORD RESET ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
