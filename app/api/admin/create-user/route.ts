// app/api/admin/create-user/route.ts
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

    // Create user in Firebase Authentication
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

    return NextResponse.json({
      ok: true,
      message: "User created",
      uid,
      password, // this will show in your Admin dashboard UI
    });
  } catch (err: any) {
    console.error("CREATE USER ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 400 }
    );
  }
}
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { name, email, role } = body;

    if (!name || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    // ✅ Generate random password
    const password = crypto.randomBytes(6).toString("hex"); // Example: a4f93bd1c2e1

    // ✅ Create Firebase Auth User
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    // ✅ Save role + metadata in Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      name,
      email,
      role,
      createdAt: Date.now(),
      systemPassword: password, // will be removed after first login
    });
// Send welcome email with system-generated password
await resend.emails.send({
  from: "LA CREATIVO <noreply@lacreativo.com>",
  to: email,
  subject: "Welcome to LA CREATIVO — Your Account Details",
  html: `
    <p>Hi ${name},</p>
    <p>Congratulations! Your user account area is now active now.
Use the credentials below to log in. You can update your password anytime from your profile.</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Temporary Password:</strong> ${password}</p>
    <p>Please log in and change your password immediately.</p>
    <br/>
    <p>LA CREATIVO</p>
  `,
});

    return NextResponse.json({
      success: true,
      message: "User created successfully.",
      uid: userRecord.uid,
      password,
    });
  } catch (err: any) {
    console.error(err);

    return NextResponse.json(
      { error: err.message || "Something went wrong." },
      { status: 500 }
    );
  }
}
