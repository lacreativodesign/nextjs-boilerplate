// app/api/admin/create-user/route.ts
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { name, email, role } = await req.json();

    if (!name || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate password
    const password = Math.random().toString(36).slice(-10);

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    const uid = userRecord.uid;

    // Save user in Firestore
    await adminDb.collection("users").doc(uid).set({
      uid,
      name,
      email,
      role,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      generatedPassword: password,
      status: "active",
      company: "LA CREATIVO",
    });

    // Send credentials using RESEND
    await resend.emails.send({
      from: "LA CREATIVO <noreply@lacreativo.com>",
      to: email,
      subject: "Your LA CREATIVO Account Credentials",
      html: `
        <p>Welcome to LA CREATIVO!</p>
        <p>Your account has been created.</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${password}</p>
        <p>You can login here:</p>
        <p><a href="https://login.lacreativo.com">login.lacreativo.com</a></p>
      `,
    });

    return NextResponse.json({
      ok: true,
      message: "User created + email sent",
      uid,
    });
  } catch (err: any) {
    console.error("CREATE USER ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 400 }
    );
  }
}
