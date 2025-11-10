// app/api/admin/create-user/route.ts
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import crypto from "crypto";

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
