import crypto from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function otpEmailHtml(otp: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Bizosto</title></head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:28px 32px;">
<span style="color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</span>
<span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:12px;">Operating System for Service Businesses</span>
</td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1E3A5F;">Verify your email address</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">Enter this code to complete your Bizosto signup for <strong>${email}</strong></p>
<div style="text-align:center;margin:32px 0;">
  <div style="display:inline-block;background:#F1F5F9;border:2px dashed #CBD5E1;border-radius:12px;padding:24px 48px;">
    <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#012167;font-family:monospace;">${otp}</span>
  </div>
</div>
<p style="margin:0 0 8px;font-size:14px;color:#64748B;">This code expires in <strong>10 minutes</strong>.</p>
<p style="margin:0;font-size:13px;color:#94A3B8;">If you did not request this, you can safely ignore this email.</p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;">
<p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · <a href="https://bizosto.com" style="color:#2563EB;text-decoration:none;">bizosto.com</a></p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Email service is not configured." }, { status: 500 });
    }

    // Check rate limit: max 3 OTPs per email per 10 minutes
    const rateLimitRef = adminDb.collection("otp_rate_limits").doc(email);
    const rateLimitSnap = await rateLimitRef.get();
    const now = Date.now();

    if (rateLimitSnap.exists) {
      const data = rateLimitSnap.data() || {};
      const attempts = (data.attempts as number) || 0;
      const windowStart = (data.windowStart as number) || 0;
      const windowDuration = 10 * 60 * 1000; // 10 minutes

      if (now - windowStart < windowDuration && attempts >= 3) {
        return NextResponse.json(
          { ok: false, error: "Too many code requests. Please wait 10 minutes." },
          { status: 429 }
        );
      }

      if (now - windowStart >= windowDuration) {
        await rateLimitRef.set({ attempts: 1, windowStart: now });
      } else {
        await rateLimitRef.set({ attempts: attempts + 1, windowStart }, { merge: true });
      }
    } else {
      await rateLimitRef.set({ attempts: 1, windowStart: now });
    }

    const otp = generateOtp();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    // Store OTP in Firestore
    await adminDb.collection("email_otps").doc(email).set({
      otp,
      email,
      expiresAt,
      createdAt: now,
      verified: false,
      attempts: 0,
    });

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.ONBOARDING_FROM_EMAIL || "Bizosto <welcome@bizosto.com>",
      to: email,
      subject: `${otp} is your Bizosto verification code`,
      html: otpEmailHtml(otp, email),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("send-otp error:", err?.message || err);
    return NextResponse.json({
      ok: false,
      error: "Could not send verification code. Please check your email address and try again. If the problem continues, contact support@bizosto.com.",
    }, { status: 500 });
  }
}
