// app/api/admin/create-user/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["admin", "sales", "am", "production", "hr", "finance", "client"]),
});

// ✅ System-generated password
function generatePassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  let pwd = "";
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = BodySchema.parse(json);

    const password = generatePassword(); // ✅ auto-generated

    // 1) Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email: body.email,
      password: password,
      displayName: body.name,
      emailVerified: false,
      disabled: false,
    });

    const uid = userRecord.uid;

    // 2) Store role & profile in Firestore
    await adminDb.collection("users").doc(uid).set({
      uid,
      name: body.name,
      email: body.email,
      role: body.role,
      createdAt: new Date(),
      status: "active",
    });

    // 3) Email credentials
    const resend = new Resend(process.env.RESEND_API_KEY!);

    const dashboardLink = (() => {
      switch (body.role) {
        case "admin": return "https://dashboard.lacreativo.com/admin";
        case "sales": return "https://dashboard.lacreativo.com/sales";
        case "am": return "https://dashboard.lacreativo.com/am";
        case "production": return "https://dashboard.lacreativo.com/production";
        case "hr": return "https://dashboard.lacreativo.com/hr";
        case "finance": return "https://dashboard.lacreativo.com/finance";
        case "client": return "https://dashboard.lacreativo.com/client";
        default: return "https://dashboard.lacreativo.com";
      }
    })();

    await resend.emails.send({
      from: "LA CREATIVO <onboarding@lacreativo.com>",
      to: [body.email],
      subject: "Welcome to LA CREATIVO – Your Login Credentials",
      html: `
        <div style="font-family:Inter,system-ui,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
          <h2 style="margin:0 0 12px 0">Welcome to LA CREATIVO ERP</h2>
          <p>Your account is now active.</p>
          <p><b>Email:</b> ${body.email}</p>
          <p><b>Temporary Password:</b> ${password}</p>
          <p><b>Your Dashboard:</b> <a href="${dashboardLink}">${dashboardLink}</a></p>
          <p style="margin-top:16px;color:#6b7280;font-size:13px">Please change your password after your first login.</p>
          <p style="margin-top:24px">— LA CREATIVO Team</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, uid });
  } catch (err: any) {
    console.error(err);
    const msg = err?.message || "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
